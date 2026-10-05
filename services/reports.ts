import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, REASON_LABELS, STATUS_LABELS } from "@/lib/constants";
import { dayEndISO, dayStartISO, isDate, variantLabel } from "@/lib/utils";
import type { MovementRow, StockRow } from "@/types";

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
