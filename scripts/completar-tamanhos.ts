/**
 * Procura tamanhos que faltam dentro de cada modelo (grade) e cadastra os que estiverem "no meio"
 * da grade (ex.: existem PP e M, falta P). Usa o valor do tamanho menor vizinho e o mesmo
 * padrão de código do modelo (…02=PP, …03=P, …04=M, …05=G, …06=GG, …07=XG, …08=G1 … …12=G5).
 *
 *   npm run completar:tamanhos            → só mostra o que faria (nada é gravado)
 *   npm run completar:tamanhos -- --aplicar → cadastra os itens (quantidade 0)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const aplicar = process.argv.includes("--aplicar");
const SIZES = ["PP", "P", "M", "G", "GG", "XG", "G1", "G2", "G3", "G4", "G5"];
const SIZE_RE = /(^|[\s-])(PP|P|M|G|GG|XG|G[1-5])\s*$/i;

type Row = { codigo: string; nome: string; categoria: string; valor_unitario: number };
type Parsed = Row & { size: string; base: string; sep: string; prefix: string; suffix: string };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Faixas de preço observadas na planilha: PP–GG (base), XG–G2 (+10%), G3–G5 (+21%). */
const TIER = (size: string) => (["XG", "G1", "G2"].includes(size) ? 1 : ["G3", "G4", "G5"].includes(size) ? 2 : 0);
const TIER_FACTOR = [1, 1.1, 1.21];

/** Preço de um tamanho a partir dos tamanhos presentes: mesma faixa (mais próximo) ou escala da faixa vizinha. */
function precoPara(size: string, tem: Map<string, { valor_unitario: number }>): number {
  const i = SIZES.indexOf(size);
  const presentes = [...tem.entries()].map(([s, p]) => ({ s, p: p.valor_unitario, d: Math.abs(SIZES.indexOf(s) - i) })).sort((a, b) => a.d - b.d);
  const mesmaFaixa = presentes.find((x) => TIER(x.s) === TIER(size) && x.p > 0);
  if (mesmaFaixa) return mesmaFaixa.p;
  const ref = presentes.find((x) => x.p > 0) ?? presentes[0];
  return Math.round((ref.p / TIER_FACTOR[TIER(ref.s)]) * TIER_FACTOR[TIER(size)] * 100) / 100;
}

function parse(r: Row): Parsed | null {
  const m = r.nome.match(SIZE_RE);
  const c = r.codigo.match(/^(\d{3}\.\d{3})\.(\d{2})$/);
  if (!m || !c) return null;
  const size = m[2].toUpperCase();
  const base = r.nome.slice(0, m.index! + (m[1] ? 0 : 0)).replace(/[\s-]+$/, "");
  const sep = r.nome.slice(base.length, r.nome.length - m[2].length); // ex.: " - " ou " "
  return { ...r, size, base, sep, prefix: c[1], suffix: c[2] };
}

async function main() {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("products").select("codigo,nome,categoria,valor_unitario").eq("ativo", true).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]).map((r) => ({ ...r, valor_unitario: Number(r.valor_unitario) })));
    if (!data || data.length < 1000) break;
  }
  const existentes = new Set(rows.map((r) => r.codigo.toUpperCase()));

  const parsed = rows.map(parse).filter((p): p is Parsed => !!p);
  // 1) mapa tamanho -> final do código, aprendido nos próprios dados (maioria vence)
  const votos: Record<string, Record<string, number>> = {};
  parsed.forEach((p) => ((votos[p.size] ??= {})[p.suffix] = (votos[p.size][p.suffix] ?? 0) + 1));
  const suffixDe: Record<string, string> = {};
  for (const s of SIZES) {
    const top = Object.entries(votos[s] ?? {}).sort((a, b) => b[1] - a[1])[0];
    if (top) suffixDe[s] = top[0];
  }
  console.log("Padrão de código aprendido (tamanho → final):", JSON.stringify(suffixDe));

  // 2) grupos por modelo (código-base + nome sem o tamanho)
  const grupos = new Map<string, Parsed[]>();
  parsed.forEach((p) => {
    const k = `${p.prefix}|${p.base.toUpperCase()}`;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(p);
  });

  const novos: { codigo: string; nome: string; categoria: string; valor: number; modelo: string; tamanho: string }[] = [];
  const pontas: string[] = [];
  const conflitos: string[] = [];
  for (const [, g] of grupos) {
    if (g.length < 3) continue; // modelos com poucos tamanhos: não dá para inferir a grade
    const idx = g.map((p) => SIZES.indexOf(p.size)).filter((i) => i >= 0);
    const min = Math.min(...idx);
    const max = Math.max(...idx);
    const tem = new Map(g.map((p) => [p.size, p]));
    for (let i = min + 1; i < max; i++) {
      const s = SIZES[i];
      if (tem.has(s)) continue;
      // vizinho menor presente mais próximo → valor e formato do nome
      let anterior: Parsed | undefined;
      for (let j = i - 1; j >= min && !anterior; j--) anterior = tem.get(SIZES[j]);
      const ref = anterior ?? g[0];
      const suf = suffixDe[s];
      if (!suf) continue;
      const codigo = `${ref.prefix}.${suf}`;
      const nome = `${ref.base}${ref.sep}${s}`;
      if (existentes.has(codigo.toUpperCase())) {
        conflitos.push(`${codigo} já existe com outro nome (modelo: ${ref.base})`);
        continue;
      }
      novos.push({ codigo, nome, categoria: ref.categoria, valor: precoPara(s, tem), modelo: ref.base, tamanho: s });
    }
    // tamanhos que faltam nas pontas (não adiciono automaticamente: o modelo pode não existir nesses tamanhos)
    const faltandoPontas = SIZES.filter((s, i) => !tem.has(s) && (i < min || i > max)).join(", ");
    if (faltandoPontas && g.length >= 5) pontas.push(`${g[0].base}: faltam nas pontas → ${faltandoPontas}`);
  }

  if (process.argv.includes("--testar")) {
    let certos = 0;
    let total = 0;
    const erros: string[] = [];
    for (const [, g] of grupos) {
      if (g.length < 4) continue;
      for (const alvo of g) {
        const resto = new Map(g.filter((x) => x !== alvo).map((x) => [x.size, x]));
        const previsto = precoPara(alvo.size, resto);
        total++;
        if (Math.abs(previsto - alvo.valor_unitario) < 0.015) certos++;
        else if (erros.length < 14) erros.push(`${alvo.nome}: real ${alvo.valor_unitario.toFixed(2)} · previsto ${previsto.toFixed(2)}`);
      }
    }
    console.log(`Teste da regra de preço: ${certos}/${total} acertos (${((certos / total) * 100).toFixed(1)}%)`);
    erros.forEach((e) => console.log("  ✗", e));
    return;
  }

  console.log(`\nModelos analisados: ${grupos.size} · tamanhos faltando NO MEIO da grade: ${novos.length}`);
  const porModelo = new Map<string, string[]>();
  novos.forEach((n) => (porModelo.get(n.modelo) ?? porModelo.set(n.modelo, []).get(n.modelo)!).push(n.tamanho));
  [...porModelo.entries()].slice(0, 400).forEach(([m, t]) => console.log(`  + ${m}: ${t.join(", ")}`));
  if (conflitos.length) console.log("\nCódigos já existentes (ignorados):", conflitos);
  console.log(`\nFaltam nas PONTAS (não adicionados — confirme se o modelo existe nesses tamanhos): ${pontas.length} modelos`);
  pontas.slice(0, 15).forEach((p) => console.log("  ·", p));

  if (!aplicar) {
    console.log("\nSimulação: nada foi gravado. Rode com --aplicar para cadastrar.");
    return;
  }
  let criados = 0;
  for (let k = 0; k < novos.length; k += 100) {
    const lote = novos.slice(k, k + 100);
    const { data, error } = await supabase
      .from("products")
      .insert(lote.map((n) => ({ codigo: n.codigo, nome: n.nome, categoria: n.categoria, valor_unitario: n.valor })))
      .select("id, codigo");
    if (error || !data) throw new Error(`Falha ao criar produtos: ${error?.message}`);
    const { error: vErr } = await supabase
      .from("product_variants")
      .insert(data.map((p) => ({ product_id: p.id, cor: "Único", tamanho: "Único", sku: p.codigo.toUpperCase(), estoque_minimo: 0 })));
    if (vErr) throw new Error(`Falha ao criar variações: ${vErr.message}`);
    criados += data.length;
  }
  await supabase.from("audit_logs").insert({
    action: "importacao_catalogo",
    entity_type: "system",
    metadata: { origem: "completar-tamanhos", criados, observacao: "Tamanhos faltando no meio da grade" },
  });
  console.log(`\nCadastrados ${criados} itens (quantidade 0).`);
}

main().catch((e) => {
  console.error("ERRO:", e.message ?? e);
  process.exit(1);
});
