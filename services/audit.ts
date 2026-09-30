import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/constants";
import { dayEndISO, dayStartISO, isDate, isUuid, safeLike } from "@/lib/utils";
import type { AuditRow } from "@/types";

export type AuditFilters = { q?: string; user?: string; action?: string; from?: string; to?: string; page?: number };

const STOCK_ACTIONS = ["entrada", "saida", "ajuste"];

export async function listAuditEvents(f: AuditFilters, pageSize = PAGE_SIZE) {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let query = supabase.from("audit_logs").select("*", { count: "exact" });

  if (f.action) query = query.eq("action", f.action);
  // sem ação escolhida: eventos do sistema (as movimentações têm aba própria)
  else query = query.not("action", "in", `(${STOCK_ACTIONS.join(",")})`);

  if (f.user && isUuid(f.user)) query = query.eq("user_id", f.user);
  if (f.q) {
    const t = safeLike(f.q);
    if (t) query = query.or(`user_nome.ilike.%${t}%,action.ilike.%${t}%,entity_type.ilike.%${t}%`);
  }
  if (f.from && isDate(f.from)) query = query.gte("created_at", dayStartISO(f.from));
  if (f.to && isDate(f.to)) query = query.lte("created_at", dayEndISO(f.to));

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
}
