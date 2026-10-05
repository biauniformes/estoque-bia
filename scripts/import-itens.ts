/**
 * Importa o catálogo (código, nome, valor unitário) de uma planilha .xlsx do sistema da Bia.
 *
 *   npm run import:itens -- "C:\caminho\relatório de estoque.xlsx"          (importa de verdade)
 *   npm run import:itens -- "C:\caminho\relatório.xlsx" --simular           (só mostra o que faria)
 *
 * Colunas esperadas (cabeçalho na linha 2): "Cód. Auxiliar" (= código), "Nome do Produto",
 * "Valor Unitário". A coluna de quantidade é IGNORADA de propósito: o estoque começa em 0 e
 * as quantidades são lançadas pelo sistema (Entrada).
 *
 * Pode rodar de novo: itens novos são criados e itens existentes têm nome/valor atualizados
 * (o saldo e o histórico nunca são tocados).
 */
import { config } from "dotenv";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const simular = args.includes("--simular");
if (!file) {
  console.error('Uso: npm run import:itens -- "caminho\\planilha.xlsx" [--simular]');
  process.exit(1);
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

type Item = { codigo: string; nome: string; valor: number; categoria: string };

/** Categoria sugerida pelo nome (o que não casar vira "outros"; dá para ajustar depois). */
function categoriaDe(nome: string): string {
  const n = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bpolo\b/.test(n)) return "camisas_polo";
  if (/\bsocial\b/.test(n)) return "camisas_sociais";
  if (/\bcamiseta\b|\bcamisa\b|\bbaby look\b/.test(n)) return "camisetas";
  if (/\bjaqueta\b|\bblusao\b|\bcasaco\b/.test(n)) return "jaquetas";
  if (/\bcalca\b|\bbata calca\b/.test(n)) return "calcas";
  if (/\bbermuda\b/.test(n)) return "bermudas";
  if (/\bjaleco\b/.test(n)) return "jalecos";
  if (/\bcolete\b/.test(n)) return "coletes";
  return "outros";
}

/** Texto de uma célula sem depender de cell.text (que falha em células vazias/fórmulas). */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined && o.result !== null) return String(o.result);
    if (o.text !== undefined && o.text !== null) return String(o.text);
    return "";
  }
  return String(v);
}

function parseValor(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in (v as object)) return parseValor((v as { result: unknown }).result);
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

async function readItems(): Promise<{ items: Item[]; ignoradas: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file!);
  const ws = wb.worksheets[0];

  // localiza a linha de cabeçalho (procura "nome do produto")
  let headerRow = 0;
  const col: Record<string, number> = {};
  ws.eachRow((row, i) => {
    if (headerRow) return;
    const cells = row.values as unknown[];
    const idx = cells.findIndex((c) => norm(c) === "nomedoproduto");
    if (idx > 0) {
      headerRow = i;
      cells.forEach((c, j) => {
        const k = norm(c);
        if (k === "codauxiliar") col.codigo = j;
        if (k === "nomedoproduto") col.nome = j;
        if (k === "valorunitario") col.valor = j;
      });
    }
  });
  if (!headerRow || !col.codigo || !col.nome || !col.valor) {
    throw new Error('Não encontrei as colunas "Cód. Auxiliar", "Nome do Produto" e "Valor Unitário".');
  }

  const items: Item[] = [];
  const ignoradas: string[] = [];
  const vistos = new Set<string>();
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    const codigo = cellText(row.getCell(col.codigo)).trim();
    const nomeBruto = cellText(row.getCell(col.nome)).trim();
    // rodapés/totais (inclusive células mescladas) não têm código no formato 100.301.00
    if (!codigo || !nomeBruto || codigo === nomeBruto || !/^\d[\d.\-]*$/.test(codigo)) return;
    const nome = nomeBruto.replace(/^[-–\s]+/, "").replace(/\s+/g, " ").trim();
    if (vistos.has(codigo.toUpperCase())) {
      ignoradas.push(`linha ${i}: código repetido ${codigo}`);
      return;
    }
    vistos.add(codigo.toUpperCase());
    items.push({ codigo, nome, valor: Math.round(parseValor(row.getCell(col.valor).value) * 100) / 100, categoria: categoriaDe(nome) });
  });
  return { items, ignoradas };
}

async function main() {
  const { items, ignoradas } = await readItems();
  const porCategoria = items.reduce<Record<string, number>>((acc, i) => ((acc[i.categoria] = (acc[i.categoria] ?? 0) + 1), acc), {});
  console.log(`Planilha lida: ${items.length} itens.`);
  console.log("Por categoria:", JSON.stringify(porCategoria));
  console.log(`Itens com valor 0,00: ${items.filter((i) => i.valor === 0).length}`);
  if (ignoradas.length) console.log("Ignoradas:", ignoradas);
  if (simular) {
    console.log("\n--simular: nada foi gravado. Exemplos:");
    items.slice(0, 5).forEach((i) => console.log(`  ${i.codigo} | ${i.nome} | R$ ${i.valor.toFixed(2)} | ${i.categoria}`));
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // existentes (por código, sem diferenciar maiúsculas)
  const existentes = new Map<string, { id: string; nome: string; valor_unitario: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("products").select("id, codigo, nome, valor_unitario").range(from, from + 999);
    if (error) throw new Error(`Falha ao ler produtos (a migration 0004 foi aplicada?): ${error.message}`);
    (data ?? []).forEach((p) => existentes.set(p.codigo.toUpperCase(), { id: p.id, nome: p.nome, valor_unitario: Number(p.valor_unitario) }));
    if (!data || data.length < 1000) break;
  }

  const novos = items.filter((i) => !existentes.has(i.codigo.toUpperCase()));
  const alterar = items.filter((i) => {
    const e = existentes.get(i.codigo.toUpperCase());
    return e && (e.nome !== i.nome || e.valor_unitario !== i.valor);
  });

  // 1) cria produtos novos (em lotes) e depois a variação "Único" de cada um
  let criados = 0;
  for (let k = 0; k < novos.length; k += 100) {
    const lote = novos.slice(k, k + 100);
    const { data, error } = await supabase
      .from("products")
      .insert(lote.map((i) => ({ codigo: i.codigo, nome: i.nome, categoria: i.categoria, valor_unitario: i.valor })))
      .select("id, codigo");
    if (error || !data) throw new Error(`Falha ao criar produtos: ${error?.message}`);
    const { error: vErr } = await supabase.from("product_variants").insert(
      data.map((p) => ({ product_id: p.id, cor: "Único", tamanho: "Único", sku: p.codigo.toUpperCase(), estoque_minimo: 0 })),
    );
    if (vErr) throw new Error(`Falha ao criar variações: ${vErr.message}`);
    criados += data.length;
    process.stdout.write(`\r  criados: ${criados}/${novos.length}`);
  }
  if (novos.length) process.stdout.write("\n");

  // 2) atualiza nome/valor dos que já existiam
  for (const i of alterar) {
    const e = existentes.get(i.codigo.toUpperCase())!;
    const { error } = await supabase.from("products").update({ nome: i.nome, valor_unitario: i.valor }).eq("id", e.id);
    if (error) throw new Error(`Falha ao atualizar ${i.codigo}: ${error.message}`);
  }

  await supabase.from("audit_logs").insert({
    action: "importacao_catalogo",
    entity_type: "system",
    metadata: { arquivo: file!.split(/[\\/]/).pop(), lidos: items.length, criados, atualizados: alterar.length },
  });

  console.log(`\nConcluído: ${criados} itens criados, ${alterar.length} atualizados, ${items.length - criados - alterar.length} sem mudança.`);
  console.log("Estoque de todos os itens começa em 0 — lance as quantidades em Entrada.");
}

main().catch((e) => {
  console.error("\nERRO:", e.message ?? e);
  process.exit(1);
});
