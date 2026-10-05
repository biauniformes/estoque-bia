/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Testa as migrations + regras de negócio do banco em um Postgres local (PGlite),
 * emulando os papéis/funções do Supabase (auth.users, auth.uid(), anon,
 * authenticated, service_role). Execute: npm run test:db
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const db = new PGlite();
let passed = 0;
let failed = 0;

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const ADMIN2 = "00000000-0000-0000-0000-0000000000a2";
const OP1 = "00000000-0000-0000-0000-0000000000b1";
const OP2 = "00000000-0000-0000-0000-0000000000b2";

async function as(uid: string | null) {
  await db.exec("reset role");
  if (uid) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec("set role authenticated");
  } else {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
async function expectError(name: string, fn: () => Promise<unknown>, match: RegExp) {
  try {
    await fn();
    console.log(`  ✗ ${name} — deveria ter falhado`);
    failed++;
  } catch (e) {
    const msg = (e as Error).message;
    if (match.test(msg)) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name} — erro inesperado: ${msg}`);
      failed++;
    }
  }
}
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name} ${extra}`);
    failed++;
  }
}

async function variantId(sku: string) {
  await db.exec("reset role");
  return (await rows<{ id: string }>("select id from product_variants where sku = $1", [sku]))[0].id;
}
const mov = (uid: string, v: string, tipo: string, q: number, motivo: string, oc: string | null, key: string) =>
  rows("select public.register_movement($1,$2,$3,$4,$5,'obs',$6,'1.2.3.4','test-agent') as r", [v, tipo, q, motivo, oc, key])
    .then((r) => (r[0] as { r: Record<string, unknown> }).r);

async function stock(v: string) {
  await db.exec("reset role");
  return (await rows<{ quantidade: number }>("select quantidade from stock_balances where variant_id=$1", [v]))[0].quantidade;
}

async function main() {
  // ---- stubs do Supabase
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role, anon;
  `);

  // ---- migrations + seed de catálogo
  const dir = join(root, "supabase", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(readFileSync(join(root, "supabase", "seed", "01_catalog.sql"), "utf8"));
  console.log("Migrations aplicadas.\n");

  // ---- usuários (via trigger handle_new_user)
  await db.exec(`
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
     ('${ADMIN}', 'admin1@t.dev', '{"role":"admin"}', '{"nome":"Administrador 1"}'),
     ('${ADMIN2}', 'admin2@t.dev', '{"role":"admin"}', '{"nome":"Administrador 2"}'),
     ('${OP1}', 'op1@t.dev', '{}', '{"nome":"Operador 1"}'),
     ('${OP2}', 'op2@t.dev', '{}', '{"nome":"Operador 2"}');
  `);
  const profs = await rows<{ role: string }>("select role from profiles order by email");
  ok("profiles criados pelo trigger (2 admin + 2 operator)",
    profs.filter((p) => p.role === "admin").length === 2 && profs.filter((p) => p.role === "operator").length === 2);

  const variants = await rows("select count(*)::int as n from product_variants");
  ok("20 variações cadastradas", (variants[0] as { n: number }).n === 20);

  const JAQ = await variantId("JAQ-001-AZU-G");

  console.log("\nFluxo principal");
  await as(OP1);
  let r = await mov(OP1, JAQ, "entrada", 30, "producao", null, "key-00000001");
  ok("T1 entrada de 30 → estoque 30", r.estoque_posterior === 30 && (await stock(JAQ)) === 30);

  await as(OP2);
  r = await mov(OP2, JAQ, "saida", 10, "oc", "OC 22", "key-00000002");
  ok("T2 saída de 10 p/ OC 22 → estoque 20 (OC normalizada)", r.estoque_posterior === 20 && r.oc_number === "22");

  r = await mov(OP2, JAQ, "saida", 20, "oc", "22", "key-00000003");
  ok("T3 saída de 20 → estoque 0", r.estoque_posterior === 0 && (await stock(JAQ)) === 0);

  await expectError("T4 saída de 1 com estoque 0 bloqueada", () => mov(OP2, JAQ, "saida", 1, "oc", "22", "key-00000004"), /ESTOQUE_INSUFICIENTE/);
  ok("   saldo segue 0 após tentativa bloqueada", (await stock(JAQ)) === 0);

  console.log("\nPermissões / RLS");
  await as(OP1);
  ok("T5 operador não lê auditoria (0 linhas)", (await rows("select * from audit_logs")).length === 0);
  await as(ADMIN);
  ok("T6 admin lê auditoria", (await rows("select * from audit_logs")).length > 0);

  await as(OP2);
  const own = await rows("select user_nome from movements_detailed");
  ok("operador só vê as próprias movimentações", own.length === 2 && own.every((m) => (m as { user_nome: string }).user_nome === "Operador 2"));
  await as(ADMIN);
  ok("admin vê todas as movimentações", (await rows("select * from movements_detailed")).length === 3);

  console.log("\nAuditoria (T7)");
  const a = (await rows<Record<string, any>>(
    "select * from audit_logs where action='saida' and (metadata->>'quantidade')::int = 10"))[0];
  ok("registra usuário/nome/role", a.user_nome === "Operador 2" && a.user_role === "operator");
  ok("registra produto/OC/estoque antes e depois",
    a.metadata.produto === "Jaqueta Operacional" && a.metadata.oc === "22" &&
    a.metadata.estoque_anterior === 30 && a.metadata.estoque_posterior === 20);
  ok("registra ip/user-agent/data", a.ip_address === "1.2.3.4" && a.user_agent === "test-agent" && !!a.created_at);

  console.log("\nImutabilidade (T8) e saldo protegido");
  await as(ADMIN);
  await expectError("admin não apaga movimentação", () => db.exec("delete from stock_movements"), /permission denied/);
  await expectError("admin não edita movimentação", () => db.exec("update stock_movements set quantidade = 1"), /permission denied/);
  await as(OP1);
  await expectError("operador não insere movimentação direto", () => db.exec(
    `insert into stock_movements (product_variant_id,tipo,quantidade,motivo,user_id,user_nome,user_role,estoque_anterior,estoque_posterior)
     values ('${JAQ}','entrada',5,'outros','${OP1}','x','operator',0,5)`), /permission denied/);
  await expectError("operador não altera saldo direto", () => db.exec("update stock_balances set quantidade = 999"), /permission denied/);
  await db.exec("reset role");
  await expectError("superuser/service: delete em movimentação bloqueado por trigger", () => db.exec("delete from stock_movements"), /REGISTRO_IMUTAVEL/);
  await expectError("superuser/service: update em movimentação bloqueado por trigger", () => db.exec("update stock_movements set quantidade = 1"), /REGISTRO_IMUTAVEL/);
  await expectError("superuser/service: delete na auditoria bloqueado", () => db.exec("delete from audit_logs"), /REGISTRO_IMUTAVEL/);
  await expectError("superuser/service: update direto de saldo bloqueado", () => db.exec("update stock_balances set quantidade = 999"), /SALDO_PROTEGIDO/);
  ok("saldo inalterado", (await stock(JAQ)) === 0);

  console.log("\nDuplo clique (T9)");
  await as(OP1);
  const k = "key-doubleclick-1";
  const r1 = await mov(OP1, JAQ, "entrada", 5, "producao", null, k);
  const r2 = await mov(OP1, JAQ, "entrada", 5, "producao", null, k);
  ok("segunda confirmação devolve a mesma movimentação", r1.id === r2.id && r2.duplicado === true);
  ok("estoque aumentou só 5 (0 → 5)", (await stock(JAQ)) === 5);
  await as(ADMIN);
  ok("apenas 1 movimentação com a chave", (await rows("select 1 from stock_movements where idempotency_key=$1", [k])).length === 1);
  // concorrência real: duas chamadas simultâneas com a mesma chave
  await as(OP1);
  const [c1, c2] = await Promise.allSettled([
    mov(OP1, JAQ, "entrada", 7, "producao", null, "key-concurrent-1"),
    mov(OP1, JAQ, "entrada", 7, "producao", null, "key-concurrent-1"),
  ]);
  ok("chamadas simultâneas com mesma chave: saldo +7 uma única vez",
    c1.status === "fulfilled" && c2.status === "fulfilled" && (await stock(JAQ)) === 12);

  console.log("\nValidações");
  await as(OP1);
  await expectError("quantidade 0", () => mov(OP1, JAQ, "entrada", 0, "producao", null, "key-v0000001"), /QUANTIDADE_INVALIDA/);
  await expectError("quantidade negativa", () => mov(OP1, JAQ, "entrada", -3, "producao", null, "key-v0000002"), /QUANTIDADE_INVALIDA/);
  await expectError("saída p/ OC sem número de OC", () => mov(OP1, JAQ, "saida", 1, "oc", "  ", "key-v0000003"), /OC_OBRIGATORIA/);
  await expectError("OC inválida", () => mov(OP1, JAQ, "saida", 1, "oc", "22; drop", "key-v0000004"), /OC_INVALIDA/);
  await expectError("motivo de saída em entrada", () => mov(OP1, JAQ, "entrada", 1, "perda", null, "key-v0000005"), /MOTIVO_INVALIDO/);
  await expectError("produto inexistente", () => mov(OP1, "11111111-1111-1111-1111-111111111111", "entrada", 1, "producao", null, "key-v0000006"), /PRODUTO_INEXISTENTE/);
  await expectError("sem chave de idempotência", () => mov(OP1, JAQ, "entrada", 1, "producao", null, ""), /CHAVE_OBRIGATORIA/);
  await expectError("operador não usa motivo 'correcao'", () => mov(OP1, JAQ, "entrada", 1, "correcao", null, "key-v0000007"), /SEM_PERMISSAO/);
  await as(null);
  await expectError("sem sessão", () => mov(OP1, JAQ, "entrada", 1, "producao", null, "key-v0000008"), /NAO_AUTENTICADO|permission denied/);

  console.log("\nCorreção administrativa");
  await as(ADMIN);
  const CAM = await variantId("CAM-001-BRA-M");
  await as(OP1);
  const e50 = await mov(OP1, CAM, "entrada", 50, "producao", null, "key-cam-50000");
  await as(OP1);
  await expectError("operador não corrige movimentação", () =>
    rows("select public.correct_movement($1,40,'erro de digitação','key-corr-op001')", [e50.id]), /SEM_PERMISSAO/);
  await as(ADMIN);
  const c = (await rows<{ r: Record<string, any> }>(
    "select public.correct_movement($1,40,'Digitado 50, correto 40','key-corr-000001') as r", [e50.id]))[0].r;
  ok("entrada 50 corrigida p/ 40 gera saída de ajuste de 10", c.tipo === "saida" && c.quantidade === 10 && c.motivo === "correcao");
  ok("estoque 50 → 40", (await stock(CAM)) === 40);
  ok("registro original preservado", (await rows("select 1 from stock_movements where id=$1 and quantidade=50", [e50.id])).length === 1);
  await expectError("corrigir p/ mesmo valor efetivo", () =>
    rows("select public.correct_movement($1,40,'de novo','key-corr-000002')", [e50.id]), /SEM_DIFERENCA/);
  const c2b = (await rows<{ r: Record<string, any> }>(
    "select public.correct_movement($1,45,'Na verdade eram 45','key-corr-000003') as r", [e50.id]))[0].r;
  ok("segunda correção 40 → 45 gera entrada de 5", c2b.tipo === "entrada" && c2b.quantidade === 5 && (await stock(CAM)) === 45);
  await expectError("não corrige uma correção", () =>
    rows("select public.correct_movement($1,1,'x y z','key-corr-000004')", [c.id]), /NAO_CORRIGIR_CORRECAO/);
  ok("correção registrada na auditoria como ajuste", (await rows("select 1 from audit_logs where action='ajuste'")).length === 2);

  console.log("\nCadastros, usuários e eventos");
  await as(OP1);
  await expectError("operador não cria produto", () => db.exec(
    "insert into products (codigo,nome) values ('X-1','Teste')"), /permission denied|row-level security/);
  const upd = await db.query(`update profiles set role='admin' where id='${OP1}'`);
  ok("operador não consegue se promover a admin (RLS: 0 linhas)", upd.affectedRows === 0);
  await as(ADMIN);
  ok("papel do operador continua 'operator'", (await rows<{ role: string }>("select role from profiles where id=$1", [OP1]))[0].role === "operator");
  await as(OP1);
  await as(ADMIN);
  await db.exec("insert into products (codigo,nome,categoria) values ('TST-1','Produto Teste','outros')");
  await db.exec("update products set nome='Produto Teste 2' where codigo='TST-1'");
  await db.exec("update products set ativo=false where codigo='TST-1'");
  const acts = (await rows<{ action: string }>("select action from audit_logs where entity_type='product' and user_id=$1 order by created_at", [ADMIN])).map((x) => x.action);
  ok("auditoria de produto: criado/alterado/desativado", ["produto_criado", "produto_alterado", "produto_desativado"].every((x) => acts.includes(x)), JSON.stringify(acts));
  await expectError("movimentar produto desativado", async () => {
    await db.exec(`insert into product_variants (product_id, cor, tamanho, sku) select id,'Azul','M','TST-1-AZU-M' from products where codigo='TST-1'`);
    const v = await variantId("TST-1-AZU-M");
    await as(ADMIN);
    await mov(ADMIN, v, "entrada", 1, "producao", null, "key-inativo-001");
  }, /PRODUTO_INATIVO/);

  await db.exec(`update profiles set role='admin' where id='${OP2}'`);
  await db.exec(`update profiles set role='operator' where id='${OP2}'`);
  ok("auditoria de permissão alterada", (await rows("select 1 from audit_logs where action='permissao_alterada'")).length === 2);
  await db.exec(`update profiles set ativo=false where id='${ADMIN2}'`);
  await expectError("não desativa o último administrador", () => db.exec(`update profiles set ativo=false where id='${ADMIN}'`), /ULTIMO_ADMIN/);
  await db.exec(`update profiles set ativo=true where id='${ADMIN2}'`);
  await rows("select public.log_audit_event('login','user',$1,'{}'::jsonb,'9.9.9.9','ua')", [ADMIN]);
  await expectError("ação de auditoria fora da lista", () => rows("select public.log_audit_event('apagar_tudo')"), /ACAO_INVALIDA/);
  await as(OP1);
  await db.exec(`update profiles set ativo=false where id='${OP1}'`).catch(() => undefined);
  await as(ADMIN);
  await db.exec(`update profiles set ativo=false where id='${OP1}'`);
  await as(OP1);
  await expectError("usuário desativado não movimenta", () => mov(OP1, JAQ, "entrada", 1, "producao", null, "key-desat-0001"), /NAO_AUTENTICADO/);
  await as(ADMIN);
  await db.exec(`update profiles set ativo=true where id='${OP1}'`);

  console.log("\nResumos");
  const dash = (await rows<{ d: Record<string, any> }>("select public.dashboard_summary() as d"))[0].d;
  ok("dashboard_summary retorna totais", dash.estoque_total === 57 && dash.entradas_hoje > 0 && dash.ocs_movimentadas === 1, JSON.stringify(dash));
  const oc = await rows<Record<string, any>>("select * from oc_summary where oc_number='22'");
  ok("oc_summary OC 22 = 30 unidades", oc.length === 1 && oc[0].total_retirado === 30 && oc[0].movimentos === 2);
  await as(OP2);
  await expectError("operador não acessa dashboard_summary", () => rows("select public.dashboard_summary()"), /SEM_PERMISSAO/);
  const vs = (await rows<{ s: Record<string, any> }>("select public.variant_summary($1) as s", [JAQ]))[0].s;
  ok("variant_summary: entradas 42 / saídas 30", vs.entradas === 42 && vs.saidas === 30 && vs.estoque === 12, JSON.stringify(vs));

  console.log("\nValor unitário e valor em estoque");
  await as(ADMIN);
  await db.exec("update products set valor_unitario = 19.9 where codigo = 'JAQ-001'");
  const ov = (await rows<Record<string, any>>("select estoque, valor_unitario, valor_total from stock_overview where sku='JAQ-001-AZU-G'"))[0];
  ok("admin vê valor unitário e total (12 un. x 19,90 = 238,80)", Number(ov.valor_unitario) === 19.9 && Number(ov.valor_total) === 238.8, JSON.stringify(ov));
  await as(OP2);
  const ovOp = (await rows<Record<string, any>>("select estoque, valor_unitario, valor_total from stock_overview where sku='JAQ-001-AZU-G'"))[0];
  ok("operador NÃO vê valores (null)", ovOp.valor_unitario === null && ovOp.valor_total === null && ovOp.estoque === 12);
  await as(ADMIN);
  const d2 = (await rows<{ d: Record<string, any> }>("select public.dashboard_summary() as d"))[0].d;
  ok("dashboard: valor_total = 12 x 19,90 = 238,80 e estoque_total = 57", Number(d2.valor_total) === 238.8 && d2.estoque_total === 57, JSON.stringify(d2));
  await expectError("valor negativo bloqueado", () => db.exec("update products set valor_unitario = -1 where codigo = 'JAQ-001'"), /check|violates/i);
  ok("alteração de valor auditada", (await rows("select 1 from audit_logs where action='produto_alterado' and metadata->'alteracoes' ? 'valor_unitario'")).length === 1);

  console.log("\nLimpeza dos dados de demonstração");
  await db.exec("reset role");
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1','velho@stockuniformes.demo','{"nome":"Velho Demo"}')`);
  await db.exec(readFileSync(join(root, "supabase", "manutencao", "limpar_dados_demonstracao.sql"), "utf8"));
  const cnt = (await rows<Record<string, number>>(
    `select (select count(*) from products)::int p, (select count(*) from product_variants)::int v,
            (select count(*) from stock_movements)::int m, (select count(*) from stock_balances)::int b,
            (select count(*) from profiles)::int u, (select count(*) from audit_logs)::int a`))[0];
  ok("produtos, variações, movimentações e saldos zerados", cnt.p === 0 && cnt.v === 0 && cnt.m === 0 && cnt.b === 0, JSON.stringify(cnt));
  ok("contas reais mantidas; conta demo removida", cnt.u === 4, JSON.stringify(cnt));
  ok("auditoria limpa, com 1 registro da limpeza", cnt.a === 1);
  await db.exec("insert into products (codigo,nome,categoria,valor_unitario) values ('100.301.00','Avental Teste','outros',23)");
  await db.exec("insert into product_variants (product_id,cor,tamanho,sku) select id,'Único','Único','100.301.00' from products");
  const nv = await variantId("100.301.00");
  await as(ADMIN);
  const rr = await mov(ADMIN, nv, "entrada", 10, "producao", null, "key-pos-limpeza-1");
  ok("após a limpeza: entrada de 10 funciona (saldo 10)", rr.estoque_posterior === 10 && (await stock(nv)) === 10);
  await db.exec("reset role");
  await expectError("após a limpeza: histórico volta a ser imutável", () => db.exec("delete from stock_movements"), /REGISTRO_IMUTAVEL/);
  await expectError("após a limpeza: auditoria volta a ser imutável", () => db.exec("delete from audit_logs"), /REGISTRO_IMUTAVEL/);
  await expectError("após a limpeza: saldo segue protegido", () => db.exec("update stock_balances set quantidade = 99"), /SALDO_PROTEGIDO/);


  console.log("\nContagem inicial (lote, somente admin)");
  await db.exec("reset role");
  await db.exec("insert into products (codigo,nome,categoria,valor_unitario) values ('200.001.00','Camisa A','camisetas',10), ('200.002.00','Camisa B','camisetas',25.5)");
  await db.exec("insert into product_variants (product_id,cor,tamanho,sku) select id,'Único','Único',codigo from products where codigo like '200.%'");
  const CA = await variantId("200.001.00");
  const CB = await variantId("200.002.00");
  const lote = (items: { variant_id: string; quantidade: number }[], key: string) =>
    rows("select public.register_initial_count($1::jsonb,$2,'1.1.1.1','ua') as r", [JSON.stringify(items), key]).then((r) => (r[0] as { r: Record<string, any> }).r);

  await as(OP1);
  await expectError("operador não lança contagem inicial", () => lote([{ variant_id: CA, quantidade: 5 }], "lote-op-0001"), /SEM_PERMISSAO/);
  await expectError("motivo 'contagem_inicial' não vale na entrada comum", () => mov(OP1, CA, "entrada", 5, "contagem_inicial", null, "key-ci-op-0001"), /MOTIVO_INVALIDO|SEM_PERMISSAO/);
  await as(ADMIN);
  await expectError("admin também não usa o motivo na entrada comum", () => mov(ADMIN, CA, "entrada", 5, "contagem_inicial", null, "key-ci-adm-001"), /MOTIVO_INVALIDO/);

  const lt1 = await lote([{ variant_id: CA, quantidade: 100 }, { variant_id: CB, quantidade: 40 }], "lote-0001-abcd");
  ok("lote lança 2 itens: 140 peças, R$ 2.020,00", lt1.lancados === 2 && Number(lt1.pecas) === 140 && Number(lt1.valor) === 2020, JSON.stringify(lt1));
  ok("saldos atualizados", (await stock(CA)) === 100 && (await stock(CB)) === 40);
  const mv = (await rows<Record<string, any>>("select motivo, observacao, user_nome, tipo from stock_movements where product_variant_id=$1 and motivo='contagem_inicial'", [CA]))[0];
  ok("movimentação registrada como Contagem inicial (entrada) pelo admin", mv.tipo === "entrada" && mv.user_nome === "Administrador 1" && mv.observacao === "Contagem inicial", JSON.stringify(mv));

  const lt2 = await lote([{ variant_id: CA, quantidade: 100 }, { variant_id: CB, quantidade: 40 }], "lote-0001-abcd");
  ok("reenviar o mesmo lote não duplica (repetidos=2, saldo igual)", lt2.lancados === 0 && lt2.repetidos === 2 && (await stock(CA)) === 100 && (await stock(CB)) === 40, JSON.stringify(lt2));

  await expectError("lote com item inválido desfaz TUDO (tudo ou nada)", () =>
    lote([{ variant_id: CA, quantidade: 7 }, { variant_id: "11111111-1111-1111-1111-111111111111", quantidade: 3 }], "lote-0002-abcd"), /PRODUTO_INEXISTENTE/);
  ok("saldo de CA continua 100 após lote que falhou", (await stock(CA)) === 100);
  await expectError("quantidade 0 no lote", () => lote([{ variant_id: CA, quantidade: 0 }], "lote-0003-abcd"), /QUANTIDADE_INVALIDA/);
  await expectError("lote vazio", () => lote([], "lote-0004-abcd"), /LOTE_VAZIO/);
  await expectError("sem chave", () => lote([{ variant_id: CA, quantidade: 1 }], ""), /CHAVE_OBRIGATORIA/);

  const dd = (await rows<{ d: Record<string, any> }>("select public.dashboard_summary() as d"))[0].d;
  ok("dashboard: estoque 150 (10+100+40), valor R$ 2.250,00 e 'entradas hoje' ignora a contagem",
    dd.estoque_total === 150 && Number(dd.valor_total) === 2250 && dd.entradas_hoje === 10, JSON.stringify(dd));
  ok("auditoria do lote registrada", (await rows("select 1 from audit_logs where action='contagem_inicial'")).length === 1);

  console.log(`\n${passed} ok, ${failed} falhas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
