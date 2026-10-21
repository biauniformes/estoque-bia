/**
 * Troca o catálogo atual pela LISTA DE PREÇOS NOVA (extraída do PDF para JSON).
 *
 *   npx tsx scripts/trocar-catalogo.ts --lista <lista_nova.json>             → SIMULAÇÃO (não grava nada)
 *   npx tsx scripts/trocar-catalogo.ts --lista <lista_nova.json> --aplicar   → aplica
 *
 * O que faz:
 *  1) Itens JÁ MOVIMENTADOS (contados ou com histórico) são ATUALIZADOS NO LUGAR para o item novo
 *     equivalente (código, nome e valor novos). Estoque e histórico permanecem no mesmo item.
 *  2) Itens NUNCA movimentados são apagados (função segura do banco, que reconfere antes de apagar).
 *  3) Os demais itens da lista nova são criados com estoque 0:
 *        com preço  → ativos;   sem preço (ou R$ 0,00) → desativados, "aguardando valor".
 *  4) Códigos repetidos na lista nova: vale o primeiro, os demais são ignorados e listados.
 * Exige a migration 0010 (para --aplicar).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const listaPath = args[args.indexOf("--lista") + 1];
if (!listaPath || listaPath.startsWith("--")) {
  console.error("Uso: --lista <caminho do lista_nova.json> [--aplicar]");
  process.exit(1);
}

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

type Novo = { codigo: string; nome: string; valor: number | null };
type Velho = { id: string; codigo: string; nome: string; categoria: string; valor: number; estoque: number; movimentos: number };

const norm = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9%]+/g, " ").trim();
const SZ = /\s(PP|P|M|G|GG|XG|EXG|G[1-9]|\d{2}|TAM ES\w*|TAM)$/;
const split = (t: string): [string, string] => {
  const n = norm(t);
  const m = n.match(SZ);
  return m ? [n.slice(0, m.index!), m[1]] : [n, ""];
};
/** A lista traz "TAM ES" cortado: devolve "TAM ESPECIAL". */
const fixNome = (n: string) => n.replace(/\s+/g, " ").trim().replace(/ TAM ES$/, " TAM ESPECIAL");

function categoriaDe(nome: string): string {
  const n = norm(nome).toLowerCase();
  if (/\bpolo\b/.test(n)) return "camisas_polo";
  if (/\bsocial\b/.test(n)) return "camisas_sociais";
  if (/\bcamiseta\b|\bcamisete\b|\bcamisa\b|\bbaby look\b|\bbabylook\b/.test(n)) return "camisetas";
  if (/\bjaqueta\b|\bblusao\b|\bcasaco\b|\bmoletom\b|\bblazer\b/.test(n)) return "jaquetas";
  if (/\bcalca\b/.test(n)) return "calcas";
  if (/\bbermuda\b/.test(n)) return "bermudas";
  if (/\bjaleco\b/.test(n)) return "jalecos";
  if (/\bcolete\b/.test(n)) return "coletes";
  return "outros";
}

// modelo antigo (normalizado) → modelo novo (como na lista nova)
const MAPA: Record<string, string> = {
  "CALCA OPERACIONAL UNISSEX C ELASTICO AZUL": "CALÇA ELÁSTICO COM CORDÃO BRIM ORBENK AZUL",
  "CALCA OPERACIONAL UNISSEX C ELASTICO BRANCA": "CALÇA ELÁSTICO COM CORDÃO BRIM 100% ALG SEPAT BRANCA",
  "BLAZER FEMININO SPANDEX PRETO": "BLAZER FEMININO SPANDEX SEPAT PRETO",
  "CALCA ELASTICO COM CORDAO HELANCA COLEGIAL VERDE MUSGO": "CALÇA ELÁSTICO COM CORDÃO HELANCA SEPAT VERDE MUSGO",
  "CALCA JEANS MASC AZUL": "CALÇA JEANS MASC TRADICIONAL ORBENK AZUL",
  "CALCA JEANS FEM AZUL": "CALÇA JEANS FEM TRADICIONAL ORBENK AZUL",
  "CAMISA GOLA POLO UNISSEX MC AZUL": "CAMISA GOLA POLO MC ORBENK AZUL",
  "CAMISA GOLA POLO UNISSEX MC BRANCA": "CAMISA GOLA POLO MC ORBENK BRANCA",
  "CAMISA GOLA POLO UNISSEX ML AZUL": "CAMISA GOLA POLO ML ORBENK AZUL",
  "CAMISA GOLA POLO UNISSEX ML BRANCA": "CAMISA GOLA POLO ML ORBENK BRANCA",
  "CAMISETA BASICA MC MM 100%ALG BRANCA": "CAMISETA BÁSICA MC MM 100% ALG SEPAT BRANCA",
  "CAMISETA BASICA ML MM 100%ALG BRANCA": "CAMISETA BÁSICA ML MM 100% ALG SEPAT BRANCA",
  "CAMISETA OPERACIONAL MC PV AZUL": "CAMISETA BÁSICA MC MM PV ORBENK AZUL",
  "CAMISETA OPERACIONAL MC PV BRANCA": "CAMISETA BÁSICA MC MM PV ORBENK BRANCA",
  "CAMISETA OPERACIONAL MC PV CINZA": "CAMISETA BÁSICA MC MM PV ORBENK CINZA",
  "CAMISETA OPERACIONAL ML PV AZUL": "CAMISETA BÁSICA ML MM PV ORBENK AZUL",
  "CAMISETA OPERACIONAL ML PV BRANCA": "CAMISETA BÁSICA ML MM PV ORBENK BRANCA",
  "CAMISETE MC TRICOLINE BRANCA": "CAMISETE FEM MC (COPEIRA) SEPAT BRANCA",
  "CAMISETE ML TRICOLINE BRANCA PE DE GOLA PUNHO REVEL EM PRETO": "CAMISETE FEM ML (NUTRICIONISTA) (PÉ DE GOLA+PUNHO+REVEL EM PRETO) SEPAT BRANCA",
  "CAMISETE ML TRICOLINE CINZA PE DE GOLA PUNHO EM CINZA ESCURO E REVEL EM CHUMBO ESCURO": "CAMISETE FEM ML (SUPERVISORA) (PÉ DE GOLA+PUNHO EM CINZA ESCURO E REVEL EM CHUMBO ESCURO) SEPAT CINZA",
  "COLETE FEM SPANDEX PRETO": "COLETE FEM SEPAT SPANDEX PRETO",
  "JALECO NUTRICIONISTA ML SPANDEX BRANCO 3 BOLSOS DETALHES BORDO": "JALECO NUTRICIONISTA ML (3 BOLSOS+DETALHES BORDÔ) SEPAT BRANCO",
  "JALECO OPERACIONAL MC BRIM AZUL": "JALECO OPERACIONAL MC ORBENK BRIM AZUL",
  "JALECO OPERACIONAL ML BRIM AZUL": "JALECO OPERACIONAL ML ORBENK BRIM AZUL",
  "JAQUETA OPERACIONAL UNISSEX AZUL": "JAQUETA OPERACIONAL ORBENK BRIM UNISEX AZUL",
  "JAQUETA OPERACIONAL UNISSEX BRANCA": "JAQUETA OPERACIONAL ORBENK BRIM UNISEX BRANCA",
};

// casos especiais decididos com a Bia (chave = nome antigo normalizado)
type Especial = { codigo: string; nome: string; valor: number | "manter"; pendente: "revisar" | null };
const ESPECIAIS: Record<string, Especial> = {
  "CALCA JEANS MASC AZUL 64": { codigo: "285.002.64", nome: "CALÇA JEANS MASC TRADICIONAL ORBENK AZUL 64", valor: 82.72, pendente: null },
  "CAMISA GOLA POLO UNISSEX MC AZUL TAM G8": { codigo: "330.004.29", nome: "CAMISA GOLA POLO MC ORBENK AZUL G8", valor: 1000, pendente: "revisar" },
  // vai para o TAM ESPECIAL do modelo novo; a lista nova traz R$ 0,00, então o valor antigo é mantido para revisão
  "CAMISETA BASICA MC MM 100%ALG BRANCA TAM ESPECIAL": { codigo: "410.002.99", nome: "", valor: "manter", pendente: "revisar" },
};

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  const lista = (JSON.parse(readFileSync(listaPath, "utf8")) as Novo[]).map((r) => ({ ...r, nome: fixNome(r.nome) }));
  const porCodigo = new Map<string, Novo>();
  const repetidos: string[] = [];
  const unicos: Novo[] = [];
  for (const r of lista) {
    if (porCodigo.has(r.codigo)) {
      repetidos.push(`${r.codigo} → ignorado: "${r.nome}" (mantido: "${porCodigo.get(r.codigo)!.nome}")`);
      continue;
    }
    porCodigo.set(r.codigo, r);
    unicos.push(r);
  }
  const idx = new Map<string, Novo>();
  for (const r of unicos) {
    const [b, sz] = split(r.nome);
    idx.set(`${b}|${sz}`, r);
  }

  // ---- catálogo atual
  const prods = await fetchAll<{ id: string; codigo: string; nome: string; categoria: string; valor_unitario: number }>((f, t) =>
    s.from("products").select("id,codigo,nome,categoria,valor_unitario").range(f, t),
  );
  const rep = await fetchAll<{ codigo: string; estoque: number; movimentos: number }>((f, t) => s.from("stock_report").select("codigo,estoque,movimentos").range(f, t));
  const repBy = new Map(rep.map((r) => [r.codigo, r]));
  const velhos: Velho[] = prods.map((p) => ({ id: p.id, codigo: p.codigo, nome: p.nome, categoria: p.categoria, valor: Number(p.valor_unitario), estoque: repBy.get(p.codigo)?.estoque ?? 0, movimentos: repBy.get(p.codigo)?.movimentos ?? 0 }));

  const movidos = velhos.filter((v) => v.movimentos > 0);
  const nunca = velhos.filter((v) => v.movimentos === 0);

  type Alvo = { velho: Velho; codigo: string; nome: string; valor: number; pendente: "revisar" | null; nota?: string };
  const alvos: Alvo[] = [];
  const jaFeitos: Velho[] = [];
  const problemas: string[] = [];
  for (const v of movidos) {
    const nn = norm(v.nome);
    if (porCodigo.has(v.codigo) && norm(porCodigo.get(v.codigo)!.nome) === nn) {
      jaFeitos.push(v); // já está com o código/nome novos (reexecução)
      continue;
    }
    const esp = ESPECIAIS[nn];
    if (esp) {
      const alvoPdf = porCodigo.get(esp.codigo);
      if (esp.valor === "manter") {
        if (!alvoPdf) { problemas.push(`${v.codigo} ${v.nome}: item ${esp.codigo} não existe na lista nova`); continue; }
        alvos.push({ velho: v, codigo: alvoPdf.codigo, nome: alvoPdf.nome, valor: v.valor, pendente: esp.pendente, nota: "TAM ESPECIAL: valor antigo mantido para revisar" });
      } else {
        if (alvoPdf) { problemas.push(`${v.codigo}: o código ${esp.codigo} já existe na lista nova (${alvoPdf.nome})`); continue; }
        alvos.push({ velho: v, codigo: esp.codigo, nome: esp.nome, valor: esp.valor, pendente: esp.pendente });
      }
      continue;
    }
    const [b, sz] = split(v.nome);
    const novoModelo = MAPA[b];
    if (!novoModelo) { problemas.push(`${v.codigo} ${v.nome}: modelo sem equivalência`); continue; }
    const alvoPdf = idx.get(`${norm(novoModelo)}|${sz}`);
    if (!alvoPdf) { problemas.push(`${v.codigo} ${v.nome}: tamanho ${sz} não existe em "${novoModelo}"`); continue; }
    const semPreco = !alvoPdf.valor;
    alvos.push({ velho: v, codigo: alvoPdf.codigo, nome: alvoPdf.nome, valor: semPreco ? v.valor : alvoPdf.valor!, pendente: semPreco ? "revisar" : null, nota: semPreco ? "sem preço na lista nova: valor antigo mantido para revisar" : undefined });
  }
  const codigosAlvo = new Set(alvos.map((a) => a.codigo));
  jaFeitos.forEach((j) => codigosAlvo.add(j.codigo));
  if (codigosAlvo.size !== alvos.length + jaFeitos.length) problemas.push("há dois itens apontando para o mesmo código novo");

  const criar = unicos.filter((r) => !codigosAlvo.has(r.codigo));
  const comPreco = criar.filter((r) => r.valor && r.valor > 0);
  const semPreco = criar.filter((r) => !r.valor || r.valor <= 0);
  const longos = lista.filter((r) => r.nome.length > 120);

  const pecasAlvo = alvos.reduce((a, x) => a + x.velho.estoque, 0);
  const antes = alvos.reduce((a, x) => a + x.velho.estoque * x.velho.valor, 0);
  const depois = alvos.reduce((a, x) => a + x.velho.estoque * x.valor, 0);

  console.log("=== SIMULAÇÃO ===");
  console.log(`lista nova: ${lista.length} linhas (${unicos.length} códigos únicos; ${repetidos.length} repetidos ignorados)`);
  console.log(`itens atuais: ${velhos.length} | já movimentados: ${movidos.length} | nunca movimentados (serão apagados): ${nunca.length}`);
  console.log(`atualizados NO LUGAR (estoque e histórico mantidos): ${alvos.length}${jaFeitos.length ? ` (+${jaFeitos.length} já atualizados antes)` : ""} | peças: ${pecasAlvo}`);
  console.log(`valor em estoque desses itens: R$ ${antes.toFixed(2)} → R$ ${depois.toFixed(2)}`);
  console.log(`a CRIAR: ${criar.length} → ativos (com preço): ${comPreco.length} | desativados "aguardando valor": ${semPreco.length}`);
  console.log(`marcados "revisar valor": ${alvos.filter((a) => a.pendente).length}`);
  alvos.filter((a) => a.nota || a.pendente || ESPECIAIS[norm(a.velho.nome)]).forEach((a) => console.log(`  · ${a.velho.codigo} "${a.velho.nome}" (${a.velho.estoque} un.) → ${a.codigo} "${a.nome}" R$ ${a.valor.toFixed(2)}${a.pendente ? " [REVISAR]" : ""}${a.nota ? " — " + a.nota : ""}`));
  if (repetidos.length) console.log(`\ncódigos repetidos na lista (${repetidos.length}):`, repetidos.slice(0, 3), repetidos.length > 3 ? "…" : "");
  if (longos.length) console.log(`nomes com mais de 120 caracteres: ${longos.length}`, longos.slice(0, 2).map((l) => l.nome));
  console.log("\nexemplos de troca:");
  alvos.filter((_, i) => i % 40 === 0).forEach((a) => console.log(`  ${a.velho.codigo} ${a.velho.nome} (${a.velho.estoque}) → ${a.codigo} ${a.nome} R$ ${a.valor.toFixed(2)}`));
  if (problemas.length) {
    console.log(`\n!!! PROBLEMAS (${problemas.length}) — nada será aplicado:`);
    problemas.forEach((p) => console.log("  -", p));
  }
  writeFileSync(listaPath.replace(/\.json$/, "") + ".plano.json", JSON.stringify({ alvos: alvos.map((a) => ({ id: a.velho.id, de: a.velho.codigo, para: a.codigo, nome: a.nome, valor: a.valor, pendente: a.pendente, estoque: a.velho.estoque })), apagar: nunca.map((n) => n.id), criar: criar.length }));

  if (!aplicar) {
    console.log("\nSimulação: nada foi gravado. Use --aplicar para executar.");
    return;
  }
  if (problemas.length) throw new Error("Há problemas na simulação; corrija antes de aplicar.");
  if (longos.length) throw new Error("Há nomes acima de 120 caracteres.");

  // ================================================== APLICAR
  const totalAntes = rep.reduce((a, r) => a + r.estoque, 0);
  const movAntes = (await s.from("stock_movements").select("id", { count: "exact", head: true })).count;
  console.log(`\nAPLICANDO… (estoque total antes: ${totalAntes} peças; movimentações: ${movAntes})`);

  // 1) apagar itens nunca movimentados
  let apagados = 0;
  for (let k = 0; k < nunca.length; k += 100) {
    const { data, error } = await s.rpc("purge_unused_products", { p_ids: nunca.slice(k, k + 100).map((n) => n.id) });
    if (error) throw new Error(`purge: ${error.message}`);
    apagados += (data as { apagados: number }).apagados;
  }
  console.log(`  apagados: ${apagados}`);

  // 2) atualizar no lugar — fase 1: códigos provisórios (evita conflito de código único)
  for (const a of alvos) {
    const tmp = "T" + a.velho.id.replace(/-/g, "").slice(0, 20);
    const r1 = await s.from("products").update({ codigo: tmp }).eq("id", a.velho.id);
    if (r1.error) throw new Error(`temp ${a.velho.codigo}: ${r1.error.message}`);
    const r2 = await s.from("product_variants").update({ sku: tmp }).eq("product_id", a.velho.id);
    if (r2.error) throw new Error(`temp sku ${a.velho.codigo}: ${r2.error.message}`);
  }
  // fase 2: valores finais
  let n = 0;
  for (const a of alvos) {
    const r1 = await s.from("products").update({ codigo: a.codigo, nome: a.nome, valor_unitario: a.valor, valor_pendente: a.pendente }).eq("id", a.velho.id);
    if (r1.error) throw new Error(`final ${a.codigo}: ${r1.error.message}`);
    const r2 = await s.from("product_variants").update({ sku: a.codigo }).eq("product_id", a.velho.id);
    if (r2.error) throw new Error(`final sku ${a.codigo}: ${r2.error.message}`);
    if (++n % 50 === 0) process.stdout.write(`\r  atualizados: ${n}/${alvos.length}`);
  }
  console.log(`\r  atualizados: ${n}/${alvos.length}   `);

  // 3) criar o restante
  const existentes = new Set((await fetchAll<{ codigo: string }>((f, t) => s.from("products").select("codigo").range(f, t))).map((p) => p.codigo.toUpperCase()));
  const novos = criar.filter((r) => !existentes.has(r.codigo.toUpperCase()));
  let criados = 0;
  for (let k = 0; k < novos.length; k += 100) {
    const lote = novos.slice(k, k + 100);
    const { data, error } = await s
      .from("products")
      .insert(lote.map((r) => ({
        codigo: r.codigo,
        nome: r.nome,
        categoria: categoriaDe(r.nome),
        valor_unitario: r.valor && r.valor > 0 ? r.valor : 0,
        ativo: !!(r.valor && r.valor > 0),
        valor_pendente: r.valor && r.valor > 0 ? null : "aguardando",
      })))
      .select("id, codigo");
    if (error || !data) throw new Error(`criar produtos: ${error?.message}`);
    const v = await s.from("product_variants").insert(data.map((p) => ({ product_id: p.id, cor: "Único", tamanho: "Único", sku: p.codigo.toUpperCase(), estoque_minimo: 0 })));
    if (v.error) throw new Error(`criar variações: ${v.error.message}`);
    criados += data.length;
    process.stdout.write(`\r  criados: ${criados}/${novos.length}`);
  }
  console.log("");

  // 4) conferência
  const rep2 = await fetchAll<{ estoque: number }>((f, t) => s.from("stock_report").select("estoque").range(f, t));
  const totalDepois = rep2.reduce((a, r) => a + r.estoque, 0);
  const movDepois = (await s.from("stock_movements").select("id", { count: "exact", head: true })).count;
  const totProd = (await s.from("products").select("id", { count: "exact", head: true })).count;
  await s.from("audit_logs").insert({ action: "importacao_catalogo", entity_type: "system", metadata: { origem: "troca-catalogo-lista-nova", atualizados: alvos.length, apagados, criados, aguardando_valor: semPreco.length } });
  console.log(`\nCONFERÊNCIA: peças em estoque ${totalAntes} → ${totalDepois} | movimentações ${movAntes} → ${movDepois} | produtos no sistema: ${totProd}`);
  if (totalAntes !== totalDepois || movAntes !== movDepois) console.log("!!! ATENÇÃO: estoque ou histórico mudou — investigar");
  else console.log("OK: estoque e histórico intactos.");
}

main().catch((e) => {
  console.error("\nERRO:", e.message ?? e);
  process.exit(1);
});
