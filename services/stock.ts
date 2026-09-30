import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/constants";
import { safeLike } from "@/lib/utils";
import type { StockRow } from "@/types";

export type StockFilters = { q?: string; categoria?: string; cor?: string; tamanho?: string; status?: string; page?: number };

const ORDER = ["produto", "cor", "tamanho_ordem", "tamanho"] as const;

export async function listStock(f: StockFilters, pageSize = PAGE_SIZE) {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let query = supabase.from("stock_overview").select("*", { count: "exact" }).eq("ativo", true);
  if (f.q) {
    const t = safeLike(f.q);
    if (t) query = query.or(`produto.ilike.%${t}%,sku.ilike.%${t}%,codigo.ilike.%${t}%`);
  }
  if (f.categoria) query = query.eq("categoria", f.categoria);
  if (f.cor) query = query.eq("cor", f.cor);
  if (f.tamanho) query = query.eq("tamanho", f.tamanho);
  if (["normal", "baixo", "zerado"].includes(f.status ?? "")) query = query.eq("status", f.status as string);
  for (const col of ORDER) query = query.order(col, { ascending: true });
  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as StockRow[], total: count ?? 0 };
}

/** Todas as variações ativas (usado pelos formulários de entrada/saída). */
export async function listActiveVariants() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_overview")
    .select("*")
    .eq("ativo", true)
    .order("produto")
    .order("cor")
    .order("tamanho_ordem")
    .order("tamanho")
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as StockRow[];
}

export async function getStockRow(variantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("stock_overview").select("*").eq("variant_id", variantId).maybeSingle();
  return (data as StockRow | null) ?? null;
}

export async function getStockFacets() {
  const supabase = await createClient();
  const { data } = await supabase.from("product_variants").select("cor, tamanho").eq("ativo", true).limit(5000);
  const cores = [...new Set((data ?? []).map((v: { cor: string }) => v.cor))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const order = ["PP", "P", "M", "G", "GG", "XG", "EXG"];
  const tamanhos = [...new Set((data ?? []).map((v: { tamanho: string }) => v.tamanho))].sort((a, b) => {
    const ia = order.indexOf(a.toUpperCase());
    const ib = order.indexOf(b.toUpperCase());
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, "pt-BR", { numeric: true });
  });
  return { cores, tamanhos };
}

export async function getVariantSummary(variantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("variant_summary", { p_variant_id: variantId });
  return (data ?? { estoque: 0, entradas: 0, saidas: 0, movimentacoes: 0 }) as {
    estoque: number;
    entradas: number;
    saidas: number;
    movimentacoes: number;
  };
}
