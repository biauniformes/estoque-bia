import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { listMovements } from "@/services/movements";
import { REASON_LABELS } from "@/lib/constants";
import { formatDateTime, formatNumber, normalizeOc, signed, variantLabel } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/data-table";
import { MovementBadge } from "@/components/shared/badges";
import type { MovementRow } from "@/types";

export const metadata = { title: "Detalhe da OC" };

export default async function OcDetailPage({ params }: { params: Promise<{ oc: string }> }) {
  await requireAdmin();
  const raw = (await params).oc;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    notFound();
  }
  const oc = normalizeOc(decoded);
  if (!/^[A-Z0-9./-]{1,20}$/.test(oc)) notFound();

  const { rows } = await listMovements({ oc }, 500);
  if (rows.length === 0) notFound();

  // total líquido por item (saídas − devoluções/correções vinculadas à OC)
  const items = new Map<string, { produto: string; cor: string; tamanho: string; total: number }>();
  for (const m of rows) {
    const cur = items.get(m.variant_id) ?? { produto: m.produto, cor: m.cor, tamanho: m.tamanho, total: 0 };
    cur.total += m.tipo === "saida" ? m.quantidade : -m.quantidade;
    items.set(m.variant_id, cur);
  }
  const list = [...items.values()].filter((i) => i.total !== 0).sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR"));
  const total = list.reduce((s, i) => s + i.total, 0);

  return (
    <>
      <Link href="/ocs" className="mb-3 inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todas as OCs
      </Link>
      <PageHeader title={`OC ${oc}`} description={`${rows.length} movimentações vinculadas`} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Itens retirados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {list.map((i) => (
                <li key={`${i.produto}${i.cor}${i.tamanho}`} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <span className="font-bold">{i.produto}</span>
                    <span className="block text-sm text-slate-500">{variantLabel(i.cor, i.tamanho)}</span>
                  </span>
                  <span className="text-2xl font-extrabold tabular-nums">{formatNumber(i.total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-4 text-white">
              <span className="font-bold uppercase tracking-wide">Total retirado para esta OC</span>
              <span className="text-3xl font-extrabold tabular-nums">{formatNumber(total)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader>
            <CardTitle>Movimentações da OC</CardTitle>
          </CardHeader>
          <DataTable<MovementRow>
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { header: "Data", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
              { header: "Produto", cell: (r) => <span><strong>{r.produto}</strong> <span className="text-slate-500">{variantLabel(r.cor, r.tamanho)}</span></span> },
              { header: "Movimento", hideBelow: "md", cell: (r) => <MovementBadge tipo={r.tipo} ajuste={r.motivo === "correcao"} /> },
              { header: "Qtd.", align: "right", cell: (r) => <strong className={r.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}>{signed(r.tipo, r.quantidade)}</strong> },
              { header: "Motivo", hideBelow: "lg", cell: (r) => REASON_LABELS[r.motivo] ?? r.motivo },
              { header: "Usuário", cell: (r) => r.user_nome },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
