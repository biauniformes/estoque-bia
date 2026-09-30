import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/constants";
import { dayEndISO, dayStartISO, isDate, isUuid, normalizeOc, safeLike } from "@/lib/utils";
import type { MovementRow } from "@/types";

export type MovementFilters = {
  q?: string;
  tipo?: string; // entrada | saida | ajuste
  user?: string;
  oc?: string;
  categoria?: string;
  from?: string;
  to?: string;
  variantId?: string;
  page?: number;
};

/** Consulta a view `movements_detailed` (RLS: admin vê tudo, operador só o que é dele). */
export async function listMovements(f: MovementFilters, pageSize = PAGE_SIZE) {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let query = supabase.from("movements_detailed").select("*", { count: "exact" });

  if (f.q) {
    const t = safeLike(f.q);
    if (t) query = query.or(`produto.ilike.%${t}%,sku.ilike.%${t}%,user_nome.ilike.%${t}%,oc_number.ilike.%${t}%`);
  }
  if (f.tipo === "entrada" || f.tipo === "saida") query = query.eq("tipo", f.tipo);
  if (f.tipo === "ajuste") query = query.in("motivo", ["ajuste_positivo", "ajuste_negativo", "correcao"]);
  if (f.user && isUuid(f.user)) query = query.eq("user_id", f.user);
  if (f.oc) query = query.eq("oc_number", normalizeOc(f.oc));
  if (f.categoria) query = query.eq("categoria", f.categoria);
  if (f.variantId && isUuid(f.variantId)) query = query.eq("variant_id", f.variantId);
  if (f.from && isDate(f.from)) query = query.gte("created_at", dayStartISO(f.from));
  if (f.to && isDate(f.to)) query = query.lte("created_at", dayEndISO(f.to));

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as MovementRow[], total: count ?? 0 };
}

export async function listUsersForFilter() {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, nome").order("nome");
  return (data ?? []) as { id: string; nome: string }[];
}
