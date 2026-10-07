import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, REASON_LABELS, STATUS_LABELS } from "@/lib/constants";
import { dayEndISO, dayStartISO, isDate, variantLabel } from "@/lib/utils";
import type { MovementRow, StockReportRow, StockRow } from "@/types";

const PAGE = 1000;
const MAX_ROWS = 100_000;

const BRL_FORMAT = '"R$" #,##0.00';
const INT_FORMAT = "#,##0";

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

export async function getStockSnapshot() {
  const supabase = await createClient();
  const rows = await fetchAll<StockRow>((from, to) =>
    supabase
      .from("stock_overview")
      .select("*")
      .eq("ativo", true)
      .order("nome_base")
      .order("tamanho_rank")
      .order("produto")
      .order("cor")
      .order("tamanho_ordem")
      .range(from, to),
  );
  const pecas = rows.reduce((s, r) => s + r.estoque, 0);
  const valor = rows.reduce((s, r) => s + Number(r.valor_total ?? 0), 0);
  return { rows, pecas, valor };
}

/** Planilha "Estoque": uma linha por item, com valor unitário e total (fórmulas) e linha de totais. */
export function buildStockSheet(workbook: ExcelJS.Workbook, rows: StockRow[]) {
  const sheet = workbook.addWorksheet("Estoque");
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
  const totals = sheet.addRow({
    produto: "TOTAL",
    estoque: { formula: `SUM(E2:E${last})`, result: rows.reduce((s, r) => s + r.estoque, 0) },
    total: { formula: `SUM(H2:H${last})`, result: rows.reduce((s, r) => s + Number(r.valor_total ?? 0), 0) },
  });
  totals.font = { bold: true };
  totals.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE5CC" } }));
  sheet.autoFilter = { from: "A1", to: `I${Math.max(last, 2)}` };
  return rows.length;
}

/** Planilha "Movimentações" do período (datas no horário de Brasília). */
export async function buildMovementsSheet(workbook: ExcelJS.Workbook, from?: string, to?: string) {
  const supabase = await createClient();
  const rows = await fetchAll<MovementRow>((a, b) => {
    let q = supabase.from("movements_detailed").select("*");
    if (from && isDate(from)) q = q.gte("created_at", dayStartISO(from));
    if (to && isDate(to)) q = q.lte("created_at", dayEndISO(to));
    return q.order("created_at", { ascending: false }).range(a, b);
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

// ------------------------------------------------------------------ relatórios de saldo


export const DEFAULT_LIMITE = 150;
export const TOP_OPTIONS = [10, 20, 50, 100] as const;

/** Itens JÁ MOVIMENTADOS (ao menos 1 movimentação no histórico) com saldo abaixo do limite, do menor para o maior. */
export async function getLowMovedItems(limite: number) {
  const supabase = await createClient();
  return fetchAll<StockReportRow>((from, to) =>
    supabase
      .from("stock_report")
      .select("*")
      .eq("ativo", true)
      .gt("movimentos", 0)
      .lt("estoque", limite)
      .order("estoque", { ascending: true })
      .order("nome_base")
      .order("tamanho_rank")
      .range(from, to),
  );
}

/** Itens com maior quantidade em estoque. */
export async function getTopItems(top: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_report")
    .select("*")
    .eq("ativo", true)
    .gt("estoque", 0)
    .order("estoque", { ascending: false })
    .order("produto")
    .limit(top);
  if (error) throw new Error(error.message);
  return (data ?? []) as StockReportRow[];
}

function dateBR(iso: string | null) {
  return iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000) : null;
}

export function buildLowStockSheet(workbook: ExcelJS.Workbook, rows: StockReportRow[], limite: number) {
  const sheet = workbook.addWorksheet(`Abaixo de ${limite}`.slice(0, 31));
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
  const totals = sheet.addRow({
    produto: `TOTAL (${rows.length} itens com saldo abaixo de ${limite})`,
    estoque: { formula: `SUM(D2:D${last})`, result: rows.reduce((s, r) => s + r.estoque, 0) },
    total: { formula: `SUM(J2:J${last})`, result: rows.reduce((s, r) => s + Number(r.valor_total ?? 0), 0) },
  });
  totals.font = { bold: true };
  totals.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE5CC" } }));
  sheet.autoFilter = { from: "A1", to: `K${Math.max(last, 2)}` };
  return rows.length;
}

export function buildTopStockSheet(workbook: ExcelJS.Workbook, rows: StockReportRow[], totalPecas: number) {
  const sheet = workbook.addWorksheet(`Maiores estoques`);
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
