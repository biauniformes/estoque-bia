import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/constants";
import { applyBusca } from "@/lib/utils";
import type { StockRow } from "@/types";

export type StockFilters = { q?: string; categoria?: string; cor?: string; tamanho?: string; status?: string; page?: number };

// "variant_id" no fim desempata: sem ele, linhas iguais podem repetir ou sumir entre páginas
const ORDER = ["nome_base", "tamanho_rank", "produto", "cor", "tamanho_ordem", "tamanho", "variant_id"] as const;

export async function listStock(f: StockFilters, pageSize = PAGE_SIZE) {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let query = supabase.from("stock_overview").select("*", { count: "exact" }).eq("ativo", true);
  if (f.q) query = applyBusca(query, f.q);
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

/**
 * Todas as variações ativas (formulários de entrada/saída e contagem).
 * O Supabase devolve no máximo 1000 linhas por requisição, então a leitura é paginada.
 */
export async function listActiveVariants() {
  const supabase = await createClient();
  const out: StockRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from("stock_overview")
      .select("*")
      .eq("ativo", true)
      .order("nome_base")
      .order("tamanho_rank")
      .order("produto")
      .order("cor")
      .order("tamanho_ordem")
      .order("tamanho")
      .order("variant_id") // desempate: mantém a paginação estável
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as StockRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function getStockRow(variantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("stock_overview").select("*").eq("variant_id", variantId).maybeSingle();
  return (data as StockRow | null) ?? null;
}

export async function getStockFacets() {
  const supabase = await createClient();
  const data: { cor: string; tamanho: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const r = await supabase.from("product_variants").select("cor, tamanho").eq("ativo", true).order("id").range(from, from + 999);
    data.push(...((r.data ?? []) as { cor: string; tamanho: string }[]));
    if (!r.data || r.data.length < 1000) break;
  }
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
