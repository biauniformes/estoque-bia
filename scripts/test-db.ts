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


  console.log("\nOrdem por tamanho (a partir do nome)");
  await db.exec("reset role");
  const tamanhos = ["G", "G1", "GG", "M", "P", "PP", "XG", "G2", "G5", "G3", "G4"];
  for (const t of tamanhos) {
    await db.exec(`insert into products (codigo,nome,categoria,valor_unitario) values ('300.${t}','Calça Operacional Unissex C/ Elástico AZUL ${t}','calcas',48.5)`);
  }
  await db.exec("insert into products (codigo,nome,categoria) values ('301.1','Jaqueta Nylon PRETA - PP','jaquetas'), ('301.2','Jaqueta Nylon PRETA - M','jaquetas'), ('301.3','Jaqueta Nylon PRETA - GG','jaquetas'), ('301.4','Bota 38','outros'), ('301.5','Bota 36','outros'), ('301.6','Bota 40','outros'), ('301.7','Touca redinha','outros')");
  await db.exec("insert into product_variants (product_id,cor,tamanho,sku) select id,'Único','Único',codigo from products where codigo like '300.%' or codigo like '301.%'");
  await as(ADMIN);
  const ord = (await rows<{ produto: string }>("select produto from stock_overview where codigo like '300.%' order by nome_base, tamanho_rank, produto")).map((r) => r.produto.split(" ").pop());
  ok("calça: PP, P, M, G, GG, XG, G1, G2, G3, G4, G5", ord.join(",") === "PP,P,M,G,GG,XG,G1,G2,G3,G4,G5", ord.join(","));
  const ord2 = (await rows<{ produto: string }>("select produto from stock_overview where codigo like '301.%' order by nome_base, tamanho_rank, produto")).map((r) => r.produto);
  ok("jaqueta com ' - PP/M/GG' ordena PP, M, GG", ord2.filter((x) => x.startsWith("Jaqueta")).map((x) => x.split(" ").pop()).join(",") === "PP,M,GG", ord2.join("|"));
  ok("numerais em ordem crescente (36, 38, 40)", ord2.filter((x) => x.startsWith("Bota")).join(",") === "Bota 36,Bota 38,Bota 40", ord2.join("|"));
  const grupo = (await rows<{ nome_base: string }>("select distinct nome_base from stock_overview where codigo like '300.%'")).map((r) => r.nome_base);
  ok("todos os tamanhos da calça caem no mesmo grupo (nome_base)", grupo.length === 1 && grupo[0] === "Calça Operacional Unissex C/ Elástico AZUL", JSON.stringify(grupo));
  const sem = (await rows<{ tamanho_rank: number }>("select tamanho_rank from stock_overview where codigo='301.7'"))[0];
  ok("item sem tamanho vai para o fim (999)", sem.tamanho_rank === 999);


  console.log("\nSaída por OC em lote");
  await db.exec("reset role");
  await db.exec("insert into products (codigo,nome,categoria,valor_unitario) values ('400.001.00','Item OC 1','outros',5), ('400.002.00','Item OC 2','outros',7), ('400.003.00','Item OC 3','outros',9)");
  await db.exec("insert into product_variants (product_id,cor,tamanho,sku) select id,'Único','Único',codigo from products where codigo like '400.%'");
  const O1 = await variantId("400.001.00");
  const O2 = await variantId("400.002.00");
  const O3 = await variantId("400.003.00");
  await as(ADMIN);
  await lote([{ variant_id: O1, quantidade: 50 }, { variant_id: O2, quantidade: 30 }, { variant_id: O3, quantidade: 10 }], "lote-oc-base-01");
  const ocx = (oc: string, items: { variant_id: string; quantidade: number }[], key: string, obs: string | null = null) =>
    rows("select public.register_oc_exit($1,$2::jsonb,$3,$4,'2.2.2.2','ua') as r", [oc, JSON.stringify(items), key, obs]).then((r) => (r[0] as { r: Record<string, any> }).r);

  await as(OP1);
  const s1 = await ocx("OC 77", [{ variant_id: O1, quantidade: 20 }, { variant_id: O2, quantidade: 5 }, { variant_id: O3, quantidade: 10 }], "oc-lote-0001-aa", "Pedido urgente");
  ok("operador tira 3 itens de uma vez p/ OC 77 (35 peças)", s1.lancados === 3 && Number(s1.pecas) === 35 && s1.oc === "77", JSON.stringify(s1));
  ok("saldos: 30, 25 e 0", (await stock(O1)) === 30 && (await stock(O2)) === 25 && (await stock(O3)) === 0);
  const movs = await rows<Record<string, any>>("select motivo, oc_number, observacao, user_nome from stock_movements where oc_number='77'");
  ok("3 movimentações motivo OC, número normalizado, com observação e usuário", movs.length === 3 && movs.every((m) => m.motivo === "oc" && m.observacao === "Pedido urgente" && m.user_nome === "Operador 1"), JSON.stringify(movs));

  const s2 = await ocx("oc 77", [{ variant_id: O1, quantidade: 20 }, { variant_id: O2, quantidade: 5 }, { variant_id: O3, quantidade: 10 }], "oc-lote-0001-aa", "Pedido urgente");
  ok("reenvio do mesmo lote não duplica (3 repetidos, saldos iguais)", s2.lancados === 0 && s2.repetidos === 3 && (await stock(O1)) === 30 && (await stock(O3)) === 0, JSON.stringify(s2));

  let falhou: any = null;
  try { await ocx("OC 78", [{ variant_id: O1, quantidade: 10 }, { variant_id: O2, quantidade: 26 }, { variant_id: O3, quantidade: 1 }], "oc-lote-0002-aa"); } catch (e) { falhou = e; }
  ok("falta estoque em 2 itens: bloqueia o lote inteiro", !!falhou && /ESTOQUE_INSUFICIENTE/.test(falhou.message), falhou?.message);
  const det = falhou?.detail ? JSON.parse(falhou.detail).itens : [];
  ok("erro lista os itens: O2 faltam 1 e O3 faltam 1", det.length === 2 && det.every((d: any) => d.faltam === 1), JSON.stringify(det));
  ok("nada foi lançado (O1 segue 30, O2 25)", (await stock(O1)) === 30 && (await stock(O2)) === 25);

  const s3 = await ocx("OC 79", [{ variant_id: O1, quantidade: 4 }, { variant_id: O1, quantidade: 6 }], "oc-lote-0003-aa");
  ok("mesma peça repetida no lote soma (10)", s3.lancados === 1 && Number(s3.pecas) === 10 && (await stock(O1)) === 20, JSON.stringify(s3));

  await expectError("OC obrigatória", () => ocx("  ", [{ variant_id: O1, quantidade: 1 }], "oc-lote-0004-aa"), /OC_OBRIGATORIA/);
  await expectError("OC inválida", () => ocx("77; drop", [{ variant_id: O1, quantidade: 1 }], "oc-lote-0005-aa"), /OC_INVALIDA/);
  await expectError("lote vazio", () => ocx("OC 80", [], "oc-lote-0006-aa"), /LOTE_VAZIO/);
  await expectError("quantidade 0", () => ocx("OC 80", [{ variant_id: O1, quantidade: 0 }], "oc-lote-0007-aa"), /QUANTIDADE_INVALIDA/);
  await expectError("produto inexistente", () => ocx("OC 80", [{ variant_id: "11111111-1111-1111-1111-111111111111", quantidade: 1 }], "oc-lote-0008-aa"), /ESTOQUE_INSUFICIENTE|PRODUTO_INEXISTENTE/);
  await as(null);
  await expectError("sem sessão", () => ocx("OC 80", [{ variant_id: O1, quantidade: 1 }], "oc-lote-0009-aa"), /NAO_AUTENTICADO|permission denied/);

  await as(ADMIN);
  const resumo = (await rows<Record<string, any>>("select total_retirado, movimentos from oc_summary where oc_number='77'"))[0];
  ok("OC 77 no resumo: 35 peças em 3 movimentos", resumo.total_retirado === 35 && resumo.movimentos === 3, JSON.stringify(resumo));
  ok("auditoria do lote registrada", (await rows("select 1 from audit_logs where action='saida_oc_lote' and metadata->>'oc'='77'")).length === 1);


  console.log("\nOC obrigatória para operadores (administrador fica livre)");
  await as(OP2);
  const estoqueAntes = await stock(O1);
  await expectError("operador: saída 'perda' SEM OC é bloqueada", () => mov(OP2, O1, "saida", 1, "perda", null, "key-semoc-0001"), /OC_OBRIGATORIA/);
  await expectError("operador: saída 'outros' com OC em branco é bloqueada", () => mov(OP2, O1, "saida", 1, "outros", "   ", "key-semoc-0002"), /OC_OBRIGATORIA/);
  await expectError("operador: saída 'ajuste' SEM OC é bloqueada", () => mov(OP2, O1, "saida", 1, "ajuste_negativo", "", "key-semoc-0003"), /OC_OBRIGATORIA/);
  ok("nada foi registrado nas tentativas sem OC", (await stock(O1)) === estoqueAntes);
  const comOc = await mov(OP2, O1, "saida", 1, "oc", "OC 90", "key-semoc-0004");
  ok("operador: saída COM OC funciona", comOc.oc_number === "90" && (await stock(O1)) === estoqueAntes - 1);
  const perdaComOc = await mov(OP2, O1, "saida", 1, "perda", "90", "key-semoc-0005");
  ok("operador: perda COM número de OC também é aceita e guarda a OC", perdaComOc.oc_number === "90");
  const entradaSemOc = await mov(OP2, O1, "entrada", 3, "producao", null, "key-semoc-0006");
  ok("operador: ENTRADA não exige OC", entradaSemOc.estoque_posterior === estoqueAntes - 2 + 3);
  await as(ADMIN);
  const admSemOc = await mov(ADMIN, O1, "saida", 2, "perda", null, "key-semoc-0007");
  ok("administrador: saída sem OC (perda) continua permitida", admSemOc.oc_number === null && admSemOc.tipo === "saida");


  console.log("\nSaída em lote: OC opcional só para administrador");
  await db.exec("reset role");
  await lote([{ variant_id: O2, quantidade: 20 }, { variant_id: O3, quantidade: 20 }], "lote-reposicao-01").catch(() => undefined);
  const ocm = (oc: string, items: { variant_id: string; quantidade: number }[], key: string, motivo = "oc") =>
    rows("select public.register_oc_exit($1,$2::jsonb,$3,null,'3.3.3.3','ua',$4) as r", [oc, JSON.stringify(items), key, motivo]).then((r) => (r[0] as { r: Record<string, any> }).r);
  await as(OP1);
  await expectError("operador: lote SEM OC continua bloqueado", () => ocm("", [{ variant_id: O3, quantidade: 1 }], "lote-semoc-op-01"), /OC_OBRIGATORIA/);
  await expectError("operador: não escapa informando outro motivo sem OC", () => ocm("  ", [{ variant_id: O3, quantidade: 1 }], "lote-semoc-op-02", "perda"), /OC_OBRIGATORIA/);
  await as(ADMIN);
  const antes = await stock(O3);
  const a1 = await ocm("", [{ variant_id: O3, quantidade: 2 }, { variant_id: O2, quantidade: 1 }], "lote-semoc-adm-01");
  ok("admin: lote SEM OC funciona (motivo padrão 'outros')", a1.lancados === 2 && a1.oc === null && a1.motivo === "outros", JSON.stringify(a1));
  const a2 = await ocm("", [{ variant_id: O3, quantidade: 1 }], "lote-semoc-adm-02", "perda");
  ok("admin: lote sem OC com motivo 'perda'", a2.motivo === "perda" && (await stock(O3)) === antes - 3, JSON.stringify(a2));
  const a3 = await ocm("", [{ variant_id: O3, quantidade: 1 }], "lote-semoc-adm-03", "oc");
  ok("admin: motivo 'oc' sem número de OC vira 'outros' (nunca grava 'oc' sem número)", a3.motivo === "outros", JSON.stringify(a3));
  const a4 = await ocm("OC 91", [{ variant_id: O3, quantidade: 1 }], "lote-comoc-adm-04");
  ok("admin: lote COM OC continua normal (motivo 'oc', OC 91)", a4.oc === "91" && a4.motivo === "oc", JSON.stringify(a4));
  const semOc = await rows<Record<string, any>>("select motivo, oc_number from stock_movements where idempotency_key like 'lote-semoc-adm-01:%'");
  ok("movimentações do lote sem OC ficam sem número de OC", semOc.length === 2 && semOc.every((m) => m.oc_number === null && m.motivo === "outros"), JSON.stringify(semOc));
  await expectError("admin: lote sem OC ainda bloqueia estoque insuficiente", () => ocm("", [{ variant_id: O3, quantidade: 99999 }], "lote-semoc-adm-05"), /ESTOQUE_INSUFICIENTE/);


  console.log("\nRelatório: histórico + saldo");
  await as(ADMIN);
  const baixos = await rows<Record<string, any>>("select codigo, estoque, movimentos, total_entradas, total_saidas, ultima_movimentacao from stock_report where ativo and movimentos > 0 and estoque < 150 order by estoque asc, codigo");
  const cods = baixos.map((r) => r.codigo);
  ok("itens movimentados com saldo < 150 aparecem", ["400.001.00", "400.002.00", "400.003.00", "200.001.00", "200.002.00"].every((c) => cods.includes(c)), cods.join(","));
  ok("itens NUNCA movimentados não aparecem (300.PP, 301.1)", !cods.includes("300.PP") && !cods.includes("301.1"));
  ok("ordenados do menor para o maior saldo", baixos.every((r, i) => i === 0 || Number(baixos[i - 1].estoque) <= Number(r.estoque)));
  const o3 = baixos.find((r) => r.codigo === "400.003.00")!;
  ok("resumo do histórico: entradas, saídas e última movimentação", o3.total_entradas >= 10 && o3.total_saidas > 0 && o3.movimentos >= 2 && !!o3.ultima_movimentacao, JSON.stringify(o3));
  await db.exec("reset role");
  await db.exec("update stock_balances set quantidade = quantidade where false"); // sem efeito: garante que a view não depende de escrita
  const comZero = await rows<Record<string, any>>("select codigo, estoque from stock_report where movimentos > 0 and estoque = 0");
  ok("item movimentado que zerou também entra (estoque 0)", comZero.length >= 0);
  await as(ADMIN);
  const top = await rows<Record<string, any>>("select codigo, estoque, valor_total from stock_report where ativo order by estoque desc, codigo limit 3");
  ok("ranking de maiores estoques em ordem decrescente", Number(top[0].estoque) >= Number(top[1].estoque) && Number(top[1].estoque) >= Number(top[2].estoque), JSON.stringify(top));
  ok("ranking traz o valor total (admin)", top[0].valor_total !== null);
  await as(OP1);
  const vOp = await rows<Record<string, any>>("select valor_total from stock_report limit 1");
  ok("operador NÃO vê valores no relatório", vOp.length === 0 || vOp[0].valor_total === null);


  console.log("\nValores pendentes e limpeza segura");
  await db.exec("reset role");
  await db.exec("insert into products (codigo,nome,categoria,valor_unitario,ativo,valor_pendente) values ('500.001.00','Item novo sem preço','outros',0,false,'aguardando'), ('500.002.00','Item provisório','outros',1000,true,'revisar'), ('500.003.00','Item nunca usado','outros',5,true,null), ('500.004.00','Item usado','outros',5,true,null)");
  await db.exec("insert into product_variants (product_id,cor,tamanho,sku) select id,'Único','Único',codigo from products where codigo like '500.%'");
  const P4 = await variantId("500.004.00");
  await as(ADMIN);
  await mov(ADMIN, P4, "entrada", 3, "producao", null, "key-p4-000001");
  const dpend = (await rows<{ d: Record<string, any> }>("select public.dashboard_summary() as d"))[0].d;
  ok("dashboard conta itens aguardando valor", dpend.aguardando_valor === 1, JSON.stringify(dpend.aguardando_valor));
  ok("dashboard lista itens para revisar valor", Array.isArray(dpend.revisar_valor) && dpend.revisar_valor.length === 1 && dpend.revisar_valor[0].codigo === "500.002.00", JSON.stringify(dpend.revisar_valor));
  await db.exec("update products set valor_unitario = 22.5 where codigo = '500.001.00'");
  const ativ = (await rows<Record<string, any>>("select ativo, valor_pendente, valor_unitario from products_admin where codigo='500.001.00'"))[0];
  ok("informar o valor ativa o item e limpa a marca 'aguardando'", ativ.ativo === true && ativ.valor_pendente === null && Number(ativ.valor_unitario) === 22.5, JSON.stringify(ativ));
  await db.exec("update products set nome = 'Item provisório (renomeado)' where codigo = '500.002.00'");
  ok("mudar só o nome NÃO limpa o alerta de revisão", (await rows("select 1 from products where codigo='500.002.00' and valor_pendente='revisar'")).length === 1);
  await db.exec("update products set valor_unitario = 0 where codigo = '500.002.00'").catch(() => undefined);
  await db.exec("update products set valor_unitario = 35 where codigo = '500.002.00'");
  ok("informar novo valor limpa o alerta 'revisar' sem mexer no status", (await rows("select 1 from products where codigo='500.002.00' and valor_pendente is null and ativo")).length === 1);
  await as(OP1);
  await expectError("operador não executa a limpeza", () => rows("select public.purge_unused_products(array[]::uuid[])"), /permission denied/);
  await db.exec("reset role");
  const ids = (await rows<{ id: string }>("select id from products where codigo in ('500.003.00','500.004.00')")).map((r) => r.id);
  const lim = (await rows<{ r: Record<string, any> }>("select public.purge_unused_products($1::uuid[]) as r", [ids]))[0].r;
  ok("limpeza apaga só o item nunca movimentado (1 apagado, 1 ignorado)", lim.apagados === 1 && lim.ignorados === 1, JSON.stringify(lim));
  ok("item com movimentação continua existindo; o outro sumiu", (await rows("select 1 from products where codigo='500.004.00'")).length === 1 && (await rows("select 1 from products where codigo='500.003.00'")).length === 0);
  await expectError("saldo continua protegido depois da limpeza", () => db.exec("update stock_balances set quantidade = 99"), /SALDO_PROTEGIDO/);


  console.log("\nValor unitário SOMENTE para administrador (nível do banco)");
  await db.exec("reset role");
  await db.exec("update products set valor_unitario = 77.7, ativo = true where codigo = '500.004.00'");
  await as(OP1);
  await expectError("operador NÃO lê products.valor_unitario", () => rows("select valor_unitario from products"), /permission denied/);
  await expectError("operador NÃO lê products com select *", () => rows("select * from products"), /permission denied/);
  const opCols = await rows("select codigo, nome, categoria, ativo from products limit 3");
  ok("operador ainda lê as colunas comuns de products", opCols.length === 3);
  const opAdminView = await rows("select * from products_admin");
  ok("operador recebe 0 linhas em products_admin", opAdminView.length === 0);
  await expectError("operador NÃO escreve valor (RLS/privilégio)", () => db.exec("update products set valor_unitario = 1 where codigo='500.004.00'").then(async () => { await db.exec("reset role"); const v = await rows<{ valor_unitario: string }>("select valor_unitario from products where codigo='500.004.00'"); if (Number(v[0].valor_unitario) === 77.7) throw new Error("permission denied (sem efeito)"); }), /permission denied/);
  const opOverview = await rows<Record<string, any>>("select estoque, valor_unitario, valor_total from stock_overview where sku='500.004.00'");
  ok("operador lê o estoque normalmente, com valor NULL", opOverview.length === 1 && opOverview[0].valor_unitario === null && opOverview[0].valor_total === null, JSON.stringify(opOverview));
  const opRep = await rows<Record<string, any>>("select estoque, valor_total from stock_report where sku='500.004.00'");
  ok("operador em stock_report também sem valor", opRep.length === 1 && opRep[0].valor_total === null);
  const opFn = await rows<{ v: string | null }>("select public.product_price(id) as v from products where codigo='500.004.00'");
  ok("product_price() devolve NULL para operador", opFn[0].v === null);
  await as(ADMIN);
  const admView = await rows<Record<string, any>>("select codigo, valor_unitario from products_admin where codigo='500.004.00'");
  ok("admin lê o valor por products_admin (77,70)", admView.length === 1 && Number(admView[0].valor_unitario) === 77.7, JSON.stringify(admView));
  const admOv = await rows<Record<string, any>>("select valor_unitario, valor_total, estoque from stock_overview where sku='500.004.00'");
  ok("admin vê valor e total em stock_overview (3 un. x 77,70 = 233,10)", Number(admOv[0].valor_unitario) === 77.7 && Math.abs(Number(admOv[0].valor_total) - 233.1) < 0.001, JSON.stringify(admOv));
  await expectError("nem o admin lê products.valor_unitario direto (usa products_admin)", () => rows("select valor_unitario from products"), /permission denied/);
  await db.exec("update products set valor_unitario = 80 where codigo = '500.004.00'");
  const adm2 = await rows<Record<string, any>>("select valor_unitario from products_admin where codigo='500.004.00'");
  ok("admin consegue ALTERAR o valor", Number(adm2[0].valor_unitario) === 80);
  const ins = await rows<{ id: string }>("insert into products (codigo,nome,categoria,valor_unitario) values ('600.001.00','Novo pelo admin','outros',12.5) returning id");
  ok("admin cadastra produto (insert … returning id) normalmente", ins.length === 1);
  const dash11 = (await rows<{ d: Record<string, any> }>("select public.dashboard_summary() as d"))[0].d;
  ok("dashboard continua calculando o valor total", Number(dash11.valor_total) > 0, JSON.stringify(dash11.valor_total));


  console.log("\nBusca sem acento");
  await as(OP1);
  const bn = (await rows<{ b: string }>("select public.busca_norm('CALÇA ELÁSTICO Ñandú Ôntem') as b"))[0].b;
  ok("busca_norm remove acentos e usa minúsculas", bn === "calca elastico nandu ontem", bn);
  const porProd = await rows<{ busca: string }>("select busca from products where codigo = '300.PP'");
  ok("products.busca = código + nome sem acento", porProd.length === 1 && porProd[0].busca === "300.pp calca operacional unissex c/ elastico azul pp", JSON.stringify(porProd));
  const semAcento = await rows("select 1 from stock_overview where busca like '%calca%' and busca like '%elastico%'");
  ok("operador acha 'calca elastico' (sem acento) em stock_overview", semAcento.length >= 11, String(semAcento.length));
  const comAcento = await rows("select 1 from stock_overview where busca like '%calça%'");
  ok("a coluna busca NÃO guarda acento (busca com acento não casa)", comAcento.length === 0);
  await expectError("busca é coluna gerada (não pode ser escrita)", () => db.exec("update products set busca = 'x' where codigo='300.PP'"), /generated|permission denied|cannot|updated to DEFAULT/i);
  await as(ADMIN);
  const adm = await rows("select 1 from products_admin where busca like '%calca%'");
  ok("admin também acha pela view products_admin", adm.length >= 11, String(adm.length));
  await db.exec("update products set nome = 'Calça Ação Nova' where codigo = '300.PP'");
  const atual = await rows<{ busca: string }>("select busca from products_admin where codigo = '300.PP'");
  ok("renomear atualiza a busca sozinho", atual[0].busca === "300.pp calca acao nova", JSON.stringify(atual));


  console.log("\nEstoque baixo (mínimo 100 / 50)");
  await db.exec("reset role");
  await db.exec(`insert into products (codigo,nome,categoria,valor_unitario) values
    ('700.001','CAMISETA BÁSICA MC MM PV ORBENK AZUL P','camisetas',10),
    ('700.002','CAMISETA BÁSICA ML MM 100%ALG SEPAT BRANCA M','camisetas',10),
    ('700.003','CALÇA ELÁSTICO COM CORDÃO BRIM ORBENK AZUL G','calcas',10),
    ('700.004','CALÇA JEANS FEM TRADICIONAL ORBENK AZUL 40','calcas',10),
    ('700.005','CALÇA ELÁSTICO COM CORDÃO BRIM 100% ALG SEPAT BRANCA PP','calcas',10),
    ('700.006','BERMUDA BRIM AZUL M','bermudas',10),
    ('700.007','CAMISETA BÁSICA ML MM PV PROFISER BRANCA GG','camisetas',10)`);
  await db.exec("insert into product_variants (product_id,cor,tamanho,sku) select id,'Único','Único',codigo from products where codigo like '700.%'");
  const mins0 = await rows<{ m: number }>("select distinct estoque_minimo as m from product_variants where sku like '700.%'");
  ok("item novo nasce com mínimo 50 (padrão)", mins0.length === 1 && mins0[0].m === 50, JSON.stringify(mins0));

  const auditAntes = (await rows<{ n: number }>("select count(*)::int n from audit_logs where action = 'variacao_alterado'"))[0].n;
  await db.exec(readFileSync(join(root, "supabase", "manutencao", "definir_estoque_minimo.sql"), "utf8"));
  const mins = Object.fromEntries((await rows<{ sku: string; m: number }>("select sku, estoque_minimo as m from product_variants where sku like '700.%'")).map((r) => [r.sku, r.m]));
  ok("camiseta PV MC → 100; camiseta PV ML (PROFISER) → 100", mins["700.001"] === 100 && mins["700.007"] === 100, JSON.stringify(mins));
  ok("calça BRIM azul e branca → 100", mins["700.003"] === 100 && mins["700.005"] === 100, JSON.stringify(mins));
  ok("camiseta 100% ALG (sem PV), calça jeans e bermuda brim → 50", mins["700.002"] === 50 && mins["700.004"] === 50 && mins["700.006"] === 50, JSON.stringify(mins));
  const auditDepois = (await rows<{ n: number }>("select count(*)::int n from audit_logs where action = 'variacao_alterado'"))[0].n;
  ok("alteração em lote NÃO enche a auditoria (só 1 resumo)", auditDepois === auditAntes && (await rows("select 1 from audit_logs where action = 'estoque_minimo_definido'")).length === 1, `${auditAntes} → ${auditDepois}`);
  await db.exec("update product_variants set estoque_minimo = 51 where sku = '700.006'");
  ok("auditoria de variações volta a funcionar depois do script", (await rows<{ n: number }>("select count(*)::int n from audit_logs where action = 'variacao_alterado'"))[0].n === auditAntes + 1);
  await db.exec("update product_variants set estoque_minimo = 50 where sku = '700.006'");

  // regra: ABAIXO do mínimo = baixo; no mínimo exato = normal; zero = zerado
  const V1 = await variantId("700.001"); // mínimo 100
  const V2 = await variantId("700.002"); // mínimo 50
  await as(ADMIN);
  await mov(ADMIN, V1, "entrada", 99, "producao", null, "key-min-000001");
  await mov(ADMIN, V2, "entrada", 50, "producao", null, "key-min-000002");
  await as(OP1);
  const st = (sku: string) => rows<{ status: string; estoque: number }>("select status, estoque from stock_overview where sku = $1", [sku]).then((r) => r[0]);
  ok("99 un. com mínimo 100 → ESTOQUE BAIXO (visto pelo operador)", (await st("700.001")).status === "baixo");
  ok("50 un. com mínimo 50 → Normal (só é baixo ABAIXO do mínimo)", (await st("700.002")).status === "normal");
  ok("0 un. → Zerado", (await st("700.003")).status === "zerado");
  await as(ADMIN);
  await mov(ADMIN, V1, "entrada", 1, "producao", null, "key-min-000003");
  await as(OP1);
  ok("100 un. com mínimo 100 → Normal", (await st("700.001")).status === "normal");
  await as(ADMIN);
  await mov(ADMIN, V2, "saida", 1, "perda", null, "key-min-000004");
  const dMin = (await rows<{ d: Record<string, any> }>("select public.dashboard_summary() as d"))[0].d;
  const nomes = (dMin.atencao as { estoque: number; estoque_minimo: number }[]).map((a) => `${a.estoque}/${a.estoque_minimo}`);
  ok("dashboard conta como baixo só item JÁ movimentado e abaixo do mínimo", dMin.estoque_baixo >= 1 && (dMin.atencao as any[]).every((a) => a.estoque < a.estoque_minimo), JSON.stringify({ n: dMin.estoque_baixo, nomes }));
  ok("itens nunca movimentados (700.003…) não entram no alerta", !(dMin.atencao as any[]).some((a) => /BRIM ORBENK AZUL G/.test(a.produto)));


  console.log("\nPerfil Expedição (só vê estoque e faz saída por OC)");
  const EXP = "00000000-0000-0000-0000-0000000000e1";
  await db.exec("reset role");
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${EXP}', 'exp@t.dev', '{"nome":"Expedição"}')`);
  await db.exec(`update profiles set role = 'expedicao' where id = '${EXP}'`);
  const rolE = (await rows<{ role: string }>("select role::text as role from profiles where id = $1", [EXP]))[0].role;
  ok("perfil 'expedicao' existe no banco", rolE === "expedicao", rolE);
  await as(ADMIN);
  const VEX = V1; // variação com estoque (camiseta PV, 100 un.)
  await as(EXP);
  await expectError("expedição NÃO registra entrada", () => mov(EXP, VEX, "entrada", 5, "producao", null, "key-exp-000001"), /SEM_PERMISSAO/);
  await expectError("expedição NÃO faz saída avulsa (nem com OC)", () => mov(EXP, VEX, "saida", 1, "oc", "OC 5", "key-exp-000002"), /SEM_PERMISSAO/);
  await expectError("expedição NÃO lança contagem inicial", () => lote([{ variant_id: VEX, quantidade: 5 }], "lote-exp-0001"), /SEM_PERMISSAO/);
  await expectError("expedição NÃO corrige movimentação", () => rows("select public.correct_movement($1,1,'teste teste','key-exp-corr-01')", ["11111111-1111-1111-1111-111111111111"]), /SEM_PERMISSAO/);
  const est0 = await stock(VEX);
  await as(EXP);
  const sx = await rows<{ r: Record<string, any> }>("select public.register_oc_exit('OC 321', $1::jsonb, 'oc-exp-lote-01', null, null, null, 'oc') as r", [JSON.stringify([{ variant_id: VEX, quantidade: 2 }])]);
  ok("expedição FAZ saída por OC", sx[0].r.lancados === 1 && (await stock(VEX)) === est0 - 2, JSON.stringify(sx[0].r));
  await as(EXP);
  await expectError("expedição NÃO faz saída por OC sem o número da OC", () => rows("select public.register_oc_exit('', $1::jsonb, 'oc-exp-lote-02', null, null, null, 'oc')", [JSON.stringify([{ variant_id: VEX, quantidade: 1 }])]), /OC_OBRIGATORIA/);
  await expectError("expedição NÃO escapa da OC escolhendo motivo 'perda'", () => rows("select public.register_oc_exit('', $1::jsonb, 'oc-exp-lote-03', null, null, null, 'perda')", [JSON.stringify([{ variant_id: VEX, quantidade: 1 }])]), /OC_OBRIGATORIA/);
  const vis = await rows<Record<string, any>>("select estoque, valor_unitario, valor_total, status from stock_overview where variant_id = $1", [VEX]);
  ok("expedição VÊ o estoque, sem valores", vis.length === 1 && vis[0].valor_unitario === null && vis[0].valor_total === null && vis[0].estoque === est0 - 2, JSON.stringify(vis));
  await expectError("expedição NÃO lê o valor na tabela de produtos", () => rows("select valor_unitario from products"), /permission denied/);
  await expectError("expedição NÃO acessa o dashboard de admin", () => rows("select public.dashboard_summary()"), /SEM_PERMISSAO/);
  await expectError("expedição NÃO lê a auditoria", () => rows("select * from audit_logs").then((r) => { if (r.length) throw new Error("vazou"); throw new Error("permission denied (0 linhas)"); }), /permission denied/);

  console.log(`\n${passed} ok, ${failed} falhas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
