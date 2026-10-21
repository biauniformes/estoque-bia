import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, REASON_LABELS, STATUS_LABELS } from "@/lib/constants";
import { dayEndISO, dayStartISO, isDate, variantLabel } from "@/lib/utils";
import { applyEmpresa, EMPRESAS, empresaDe, empresaLabel, SEM_EMPRESA, type FiltroEmpresa } from "@/lib/empresas";
import type { MovementRow, StockReportRow, StockRow } from "@/types";

export { EMPRESAS, SEM_EMPRESA, parseEmpresa, empresaLabel, empresaDe, combinaEmpresa } from "@/lib/empresas";
export type { FiltroEmpresa } from "@/lib/empresas";

const PAGE = 1000;
const MAX_ROWS = 100_000;

const BRL_FORMAT = '"R$" #,##0.00';
const INT_FORMAT = "#,##0";

export const DEFAULT_LIMITE = 150;
export const TOP_OPTIONS = [10, 20, 50, 100] as const;

/** Lê todas as linhas de uma consulta paginando de 1000 em 1000 (limite do PostgREST). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFC7C14" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A0A0A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function styleTotals(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE5CC" } }));
}

// ------------------------------------------------------------------ leituras

/** Itens ativos com saldo. `soComEstoque` descarta os zerados. (Funciona para administrador e operador.) */
export async function getStockSnapshot(empresa: FiltroEmpresa = "", soComEstoque = false) {
  const supabase = await createClient();
  const rows = await fetchAll<StockRow>((from, to) => {
    let q = supabase.from("stock_overview").select("*").eq("ativo", true);
    q = applyEmpresa(q, empresa);
    if (soComEstoque) q = q.gt("estoque", 0);
    return q.order("nome_base").order("tamanho_rank").order("produto").order("cor").order("tamanho_ordem").order("variant_id").range(from, to);
  });
  const pecas = rows.reduce((s, r) => s + r.estoque, 0);
  const valor = rows.reduce((s, r) => s + Number(r.valor_total ?? 0), 0);
  return { rows, pecas, valor };
}

/** Itens JÁ MOVIMENTADOS (ao menos 1 movimentação no histórico) com saldo abaixo do limite (admin). */
export async function getLowMovedItems(limite: number, empresa: FiltroEmpresa = "") {
  const supabase = await createClient();
  return fetchAll<StockReportRow>((from, to) => {
    let q = supabase.from("stock_report").select("*").eq("ativo", true).gt("movimentos", 0).lt("estoque", limite);
    q = applyEmpresa(q, empresa);
    return q.order("estoque", { ascending: true }).order("nome_base").order("tamanho_rank").order("variant_id").range(from, to);
  });
}

/** Itens com maior quantidade em estoque (admin e operador). */
export async function getTopItems(top: number, empresa: FiltroEmpresa = "") {
  const supabase = await createClient();
  let q = supabase.from("stock_overview").select("*").eq("ativo", true).gt("estoque", 0);
  q = applyEmpresa(q, empresa);
  const { data, error } = await q.order("estoque", { ascending: false }).order("produto").order("variant_id").limit(top);
  if (error) throw new Error(error.message);
  return (data ?? []) as StockRow[];
}

/** Saldo ATUAL dos itens que já foram movimentados ao menos uma vez (admin). */
export async function getMovedStock(incluirZerados: boolean, empresa: FiltroEmpresa = "") {
  const supabase = await createClient();
  const rows = await fetchAll<StockReportRow>((from, to) => {
    let q = supabase.from("stock_report").select("*").eq("ativo", true).gt("movimentos", 0);
    q = applyEmpresa(q, empresa);
    if (!incluirZerados) q = q.gt("estoque", 0);
    return q.order("nome_base").order("tamanho_rank").order("produto").order("variant_id").range(from, to);
  });
  const pecas = rows.reduce((s, r) => s + r.estoque, 0);
  const valor = rows.reduce((s, r) => s + Number(r.valor_total ?? 0), 0);
  return { rows, pecas, valor };
}

/** Resumo por empresa a partir de uma lista de itens (já em memória). */
export function resumoPorEmpresa(rows: StockRow[]) {
  const nomes = [...EMPRESAS, SEM_EMPRESA] as const;
  return nomes.map((e) => {
    const itens = rows.filter((r) => empresaDe(r.produto) === e);
    const comEstoque = itens.filter((r) => r.estoque > 0);
    return {
      empresa: e as string,
      cadastrados: itens.length,
      comEstoque: comEstoque.length,
      pecas: comEstoque.reduce((s, r) => s + r.estoque, 0),
      valor: comEstoque.reduce((s, r) => s + Number(r.valor_total ?? 0), 0),
    };
  });
}

// ------------------------------------------------------------------ planilhas
// Todas as planilhas aceitam `valores`. Com valores=false (versão do OPERADOR) saem SOMENTE
// código, nome e quantidade — nenhuma coluna de preço/valor.

/** Planilha de estoque: uma linha por item. */
export function buildStockSheet(workbook: ExcelJS.Workbook, rows: StockRow[], sheetName = "Estoque", valores = true) {
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  if (!valores) {
    sheet.columns = [
      { header: "Código", key: "codigo", width: 14 },
      { header: "Produto", key: "produto", width: 70 },
      { header: "Quantidade", key: "estoque", width: 14, style: { numFmt: INT_FORMAT } },
    ];
    styleHeader(sheet);
    rows.forEach((r) => sheet.addRow({ codigo: r.codigo, produto: r.produto, estoque: r.estoque }));
    const last = rows.length + 1;
    styleTotals(sheet.addRow({ produto: "TOTAL", estoque: { formula: `SUM(C2:C${last})`, result: rows.reduce((s, r) => s + r.estoque, 0) } }));
    sheet.autoFilter = { from: "A1", to: `C${Math.max(last, 2)}` };
    return rows.length;
  }

  sheet.columns = [
    { header: "Código", key: "codigo", width: 14 },
    { header: "Produto", key: "produto", width: 62 },
    { header: "Cor / Tamanho", key: "variacao", width: 18 },
    { header: "Categoria", key: "categoria", width: 16 },
    { header: "Quantidade", key: "estoque", width: 13, style: { numFmt: INT_FORMAT } },
    { header: "Estoque mínimo", key: "minimo", width: 15, style: { numFmt: INT_FORMAT } },
    { header: "Valor unitário", key: "unit", width: 16, style: { numFmt: BRL_FORMAT } },
    { header: "Valor total", key: "total", width: 18, style: { numFmt: BRL_FORMAT } },
    { header: "Situação", key: "status", width: 15 },
  ];
  styleHeader(sheet);
  rows.forEach((r, i) => {
    const line = i + 2;
    sheet.addRow({
      codigo: r.codigo,
      produto: r.produto,
      variacao: variantLabel(r.cor, r.tamanho),
      categoria: categoryLabel(r.categoria),
      estoque: r.estoque,
      minimo: r.estoque_minimo,
      unit: Number(r.valor_unitario ?? 0),
      total: { formula: `E${line}*G${line}`, result: Number(r.valor_total ?? 0) },
      status: STATUS_LABELS[r.status],
    });
  });
  const last = rows.length + 1;
  styleTotals(
    sheet.addRow({
      produto: "TOTAL",
      estoque: { formula: `SUM(E2:E${last})`, result: rows.reduce((s, r) => s + r.estoque, 0) },
      total: { formula: `SUM(H2:H${last})`, result: rows.reduce((s, r) => s + Number(r.valor_total ?? 0), 0) },
    }),
  );
  sheet.autoFilter = { from: "A1", to: `I${Math.max(last, 2)}` };
  return rows.length;
}

/** Uma aba por empresa (com estoque) + aba de resumo. */
export function buildEmpresasWorkbook(workbook: ExcelJS.Workbook, rows: StockRow[], valores = true) {
  const resumo = resumoPorEmpresa(rows);
  const sheet = workbook.addWorksheet("Resumo");
  sheet.columns = valores
    ? [
        { header: "Empresa", key: "e", width: 22 },
        { header: "Itens com estoque", key: "n", width: 18, style: { numFmt: INT_FORMAT } },
        { header: "Peças", key: "p", width: 14, style: { numFmt: INT_FORMAT } },
        { header: "Valor em estoque", key: "v", width: 20, style: { numFmt: BRL_FORMAT } },
      ]
    : [
        { header: "Empresa", key: "e", width: 22 },
        { header: "Itens com estoque", key: "n", width: 18, style: { numFmt: INT_FORMAT } },
        { header: "Peças", key: "p", width: 14, style: { numFmt: INT_FORMAT } },
      ];
  styleHeader(sheet);
  resumo.forEach((r) => sheet.addRow({ e: empresaLabel(r.empresa), n: r.comEstoque, p: r.pecas, v: r.valor }));
  const last = resumo.length + 1;
  styleTotals(
    sheet.addRow({
      e: "TOTAL",
      n: { formula: `SUM(B2:B${last})`, result: resumo.reduce((s, r) => s + r.comEstoque, 0) },
      p: { formula: `SUM(C2:C${last})`, result: resumo.reduce((s, r) => s + r.pecas, 0) },
      ...(valores ? { v: { formula: `SUM(D2:D${last})`, result: resumo.reduce((s, r) => s + r.valor, 0) } } : {}),
    }),
  );
  let total = 0;
  for (const r of resumo) {
    const itens = rows.filter((x) => empresaDe(x.produto) === r.empresa && x.estoque > 0);
    if (itens.length === 0) continue;
    total += buildStockSheet(workbook, itens, empresaLabel(r.empresa), valores);
  }
  return total;
}

/** Planilha "Movimentações" do período (admin; datas no horário de Brasília). */
export async function buildMovementsSheet(workbook: ExcelJS.Workbook, from?: string, to?: string, empresa: FiltroEmpresa = "") {
  const supabase = await createClient();
  const rows = await fetchAll<MovementRow>((a, b) => {
    let q = supabase.from("movements_detailed").select("*");
    q = applyEmpresa(q, empresa);
    if (from && isDate(from)) q = q.gte("created_at", dayStartISO(from));
    if (to && isDate(to)) q = q.lte("created_at", dayEndISO(to));
    return q.order("created_at", { ascending: false }).order("id").range(a, b);
  });

  const sheet = workbook.addWorksheet("Movimentações");
  sheet.columns = [
    { header: "Data/hora", key: "data", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    { header: "Código", key: "codigo", width: 14 },
    { header: "Produto", key: "produto", width: 56 },
    { header: "Cor / Tamanho", key: "variacao", width: 16 },
    { header: "Movimento", key: "tipo", width: 12 },
    { header: "Quantidade", key: "qtd", width: 12, style: { numFmt: INT_FORMAT } },
    { header: "Motivo", key: "motivo", width: 18 },
    { header: "OC", key: "oc", width: 10 },
    { header: "Usuário", key: "usuario", width: 18 },
    { header: "Estoque anterior", key: "ant", width: 15, style: { numFmt: INT_FORMAT } },
    { header: "Estoque posterior", key: "post", width: 16, style: { numFmt: INT_FORMAT } },
    { header: "Observação", key: "obs", width: 40 },
  ];
  styleHeader(sheet);
  for (const m of rows) {
    sheet.addRow({
      // exceljs grava datas em UTC; deslocamos -3h para a planilha mostrar o horário de Brasília
      data: new Date(new Date(m.created_at).getTime() - 3 * 3_600_000),
      codigo: m.codigo,
      produto: m.produto,
      variacao: variantLabel(m.cor, m.tamanho),
      tipo: m.tipo === "entrada" ? "Entrada" : "Saída",
      qtd: m.tipo === "entrada" ? m.quantidade : -m.quantidade,
      motivo: REASON_LABELS[m.motivo] ?? m.motivo,
      oc: m.oc_number ?? "",
      usuario: m.user_nome,
      ant: m.estoque_anterior,
      post: m.estoque_posterior,
      obs: m.observacao ?? "",
    });
  }
  sheet.autoFilter = { from: "A1", to: `L${Math.max(rows.length + 1, 2)}` };
  return rows.length;
}

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estoque Bia";
  wb.created = new Date();
  return wb;
}

function dateBR(iso: string | null) {
  return iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000) : null;
}

export function buildLowStockSheet(workbook: ExcelJS.Workbook, rows: StockReportRow[], limite: number, valores = true) {
  const sheet = workbook.addWorksheet(`Abaixo de ${limite}`.slice(0, 31));
  if (!valores) {
    sheet.columns = [
      { header: "Código", key: "codigo", width: 14 },
      { header: "Produto", key: "produto", width: 70 },
      { header: "Quantidade", key: "estoque", width: 14, style: { numFmt: INT_FORMAT } },
    ];
    styleHeader(sheet);
    rows.forEach((r) => sheet.addRow({ codigo: r.codigo, produto: r.produto, estoque: r.estoque }));
    const last = rows.length + 1;
    styleTotals(sheet.addRow({ produto: `TOTAL (${rows.length} itens com saldo abaixo de ${limite})`, estoque: { formula: `SUM(C2:C${last})`, result: rows.reduce((s, r) => s + r.estoque, 0) } }));
    sheet.autoFilter = { from: "A1", to: `C${Math.max(last, 2)}` };
    return rows.length;
  }
  sheet.columns = [
    { header: "Código", key: "codigo", width: 14 },
    { header: "Produto", key: "produto", width: 62 },
    { header: "Cor / Tamanho", key: "variacao", width: 16 },
    { header: "Estoque atual", key: "estoque", width: 14, style: { numFmt: INT_FORMAT } },
    { header: "Total de entradas", key: "ent", width: 17, style: { numFmt: INT_FORMAT } },
    { header: "Total de saídas", key: "sai", width: 16, style: { numFmt: INT_FORMAT } },
    { header: "Movimentações", key: "mov", width: 15, style: { numFmt: INT_FORMAT } },
    { header: "Última movimentação", key: "ult", width: 20, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    { header: "Valor unitário", key: "unit", width: 15, style: { numFmt: BRL_FORMAT } },
    { header: "Valor em estoque", key: "total", width: 17, style: { numFmt: BRL_FORMAT } },
    { header: "Situação", key: "status", width: 14 },
  ];
  styleHeader(sheet);
  rows.forEach((r, i) => {
    const line = i + 2;
    sheet.addRow({
      codigo: r.codigo,
      produto: r.produto,
      variacao: variantLabel(r.cor, r.tamanho),
      estoque: r.estoque,
      ent: r.total_entradas,
      sai: r.total_saidas,
      mov: r.movimentos,
      ult: dateBR(r.ultima_movimentacao),
      unit: Number(r.valor_unitario ?? 0),
      total: { formula: `D${line}*I${line}`, result: Number(r.valor_total ?? 0) },
      status: STATUS_LABELS[r.status],
    });
  });
  const last = rows.length + 1;
  styleTotals(
    sheet.addRow({
      produto: `TOTAL (${rows.length} itens com saldo abaixo de ${limite})`,
      estoque: { formula: `SUM(D2:D${last})`, result: rows.reduce((s, r) => s + r.estoque, 0) },
      total: { formula: `SUM(J2:J${last})`, result: rows.reduce((s, r) => s + Number(r.valor_total ?? 0), 0) },
    }),
  );
  sheet.autoFilter = { from: "A1", to: `K${Math.max(last, 2)}` };
  return rows.length;
}

export function buildTopStockSheet(workbook: ExcelJS.Workbook, rows: StockRow[], totalPecas: number, valores = true) {
  const sheet = workbook.addWorksheet("Maiores estoques");
  if (!valores) {
    sheet.columns = [
      { header: "#", key: "pos", width: 6 },
      { header: "Código", key: "codigo", width: 14 },
      { header: "Produto", key: "produto", width: 70 },
      { header: "Quantidade", key: "estoque", width: 14, style: { numFmt: INT_FORMAT } },
    ];
    styleHeader(sheet);
    rows.forEach((r, i) => sheet.addRow({ pos: i + 1, codigo: r.codigo, produto: r.produto, estoque: r.estoque }));
    sheet.autoFilter = { from: "A1", to: `D${Math.max(rows.length + 1, 2)}` };
    return rows.length;
  }
  sheet.columns = [
    { header: "#", key: "pos", width: 6 },
    { header: "Código", key: "codigo", width: 14 },
    { header: "Produto", key: "produto", width: 62 },
    { header: "Cor / Tamanho", key: "variacao", width: 16 },
    { header: "Estoque atual", key: "estoque", width: 14, style: { numFmt: INT_FORMAT } },
    { header: "% do total de peças", key: "pct", width: 18, style: { numFmt: "0.0%" } },
    { header: "Valor unitário", key: "unit", width: 15, style: { numFmt: BRL_FORMAT } },
    { header: "Valor em estoque", key: "total", width: 17, style: { numFmt: BRL_FORMAT } },
  ];
  styleHeader(sheet);
  rows.forEach((r, i) => {
    const line = i + 2;
    sheet.addRow({
      pos: i + 1,
      codigo: r.codigo,
      produto: r.produto,
      variacao: variantLabel(r.cor, r.tamanho),
      estoque: r.estoque,
      pct: totalPecas > 0 ? r.estoque / totalPecas : 0,
      unit: Number(r.valor_unitario ?? 0),
      total: { formula: `E${line}*G${line}`, result: Number(r.valor_total ?? 0) },
    });
  });
  sheet.autoFilter = { from: "A1", to: `H${Math.max(rows.length + 1, 2)}` };
  return rows.length;
}
