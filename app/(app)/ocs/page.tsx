import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/constants";
import { first, formatDateTime, formatNumber, normalizeOc, safeLike } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Filters } from "@/components/shared/filters";
import { DataTable } from "@/components/shared/data-table";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/states";
import type { OcSummaryRow } from "@/types";

export const metadata = { title: "Ordens de Compra" };

export default async function OcsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = first(sp.q);
  const page = parsePage(first(sp.page));
  const supabase = await createClient();

  let query = supabase.from("oc_summary").select("*", { count: "exact" });
  if (q) {
    const t = safeLike(normalizeOc(q));
    if (t) query = query.ilike("oc_number", `%${t}%`);
  }
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await query.order("ultima_movimentacao", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as OcSummaryRow[];

  return (
    <>
      <PageHeader title="Ordens de Compra" description="Tudo o que saiu do estoque para cada OC." />
      <Card className="overflow-hidden">
        <Filters fields={[{ name: "q", label: "Buscar OC", type: "search", placeholder: "Ex.: 22" }]} />
        <DataTable<OcSummaryRow>
          caption="OCs com movimentação"
          rows={rows}
          rowKey={(r) => r.oc_number}
          empty={<EmptyState title="Nenhuma OC encontrada" description="As OCs aparecem aqui quando há saída vinculada a elas." />}
          columns={[
            {
              header: "OC",
              cell: (r) => (
                <Link href={`/ocs/${encodeURIComponent(r.oc_number)}`} className="text-xl font-extrabold hover:text-orange-700 hover:underline">
                  OC {r.oc_number}
                </Link>
              ),
            },
            { header: "Total retirado", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.total_retirado)}</strong> },
            { header: "Movimentos", align: "right", hideBelow: "md", cell: (r) => formatNumber(r.movimentos) },
            { header: "Última movimentação", hideBelow: "md", cell: (r) => formatDateTime(r.ultima_movimentacao) },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <Link href={`/ocs/${encodeURIComponent(r.oc_number)}`} aria-label={`Abrir OC ${r.oc_number}`}>
                  <ChevronRight className="ml-auto h-6 w-6 text-slate-400" />
                </Link>
              ),
            },
          ]}
        />
        <Pagination page={page} total={count ?? 0} pathname="/ocs" params={q ? { q } : {}} />
      </Card>
    </>
  );
}
