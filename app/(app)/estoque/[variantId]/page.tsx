import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, MinusCircle, Package, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getStockRow, getVariantSummary } from "@/services/stock";
import { listMovements } from "@/services/movements";
import { categoryLabel, REASON_LABELS } from "@/lib/constants";
import { formatDateTime, formatNumber, isUuid, signed, variantLabel } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MovementBadge, StockBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";

export const metadata = { title: "Detalhe do item" };

export default async function VariantDetailPage({ params }: { params: Promise<{ variantId: string }> }) {
  const profile = await requireUser();
  const { variantId } = await params;
  if (!isUuid(variantId)) notFound();
  const row = await getStockRow(variantId);
  if (!row) notFound();

  const [summary, { rows: movements }] = await Promise.all([
    getVariantSummary(variantId),
    listMovements({ variantId }, 50),
  ]);
  const isAdmin = profile.role === "admin";

  return (
    <>
      <PageHeader
        title={row.produto}
        description={[categoryLabel(row.categoria), variantLabel(row.cor, row.tamanho), `Código ${row.sku}`].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button asChild variant="entrada" size="lg">
              <Link href={`/entrada?variant=${row.variant_id}`}><PlusCircle className="h-5 w-5" aria-hidden /> Entrada</Link>
            </Button>
            <Button asChild variant="saida" size="lg">
              <Link href={`/saida?variant=${row.variant_id}`}><MinusCircle className="h-5 w-5" aria-hidden /> Saída</Link>
            </Button>
          </>
        }
      />

      {row.status !== "normal" && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="text-lg font-extrabold">{row.status === "zerado" ? "Estoque zerado" : "Estoque baixo"}</p>
            <p>
              {row.produto}{variantLabel(row.cor, row.tamanho) && ` — ${variantLabel(row.cor, row.tamanho)}`} · Estoque atual: <strong>{formatNumber(row.estoque)}</strong> · Estoque mínimo:{" "}
              <strong>{formatNumber(row.estoque_minimo)}</strong>
            </p>
          </div>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Estoque atual" value={formatNumber(summary.estoque)} icon={<Package className="h-7 w-7" />} hint={`Mínimo: ${formatNumber(row.estoque_minimo)}`} />
        <StatCard label="Entradas (total)" value={formatNumber(summary.entradas)} tone="success" icon={<ArrowDownToLine className="h-7 w-7" />} />
        <StatCard label="Saídas (total)" value={formatNumber(summary.saidas)} tone="danger" icon={<ArrowUpFromLine className="h-7 w-7" />} />
      </div>
      <p className="-mt-4 mb-6 flex items-center gap-2 text-sm text-slate-500">
        Situação: <StockBadge status={row.status} />
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Linha do tempo das movimentações</CardTitle>
          {!isAdmin && <p className="text-sm text-slate-500">Você vê apenas as movimentações registradas por você.</p>}
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <EmptyState title="Sem movimentações" description="Este item ainda não tem movimentações visíveis para você." />
          ) : (
            <ol className="relative ml-3 space-y-5 border-l-2 border-slate-200 pl-6">
              {movements.map((m) => (
                <li key={m.id} className="relative">
                  <span
                    className={`absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-white ${m.tipo === "entrada" ? "bg-emerald-500" : "bg-rose-500"}`}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className={`text-2xl font-extrabold tabular-nums ${m.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>
                      {signed(m.tipo, m.quantidade)}
                    </span>
                    <MovementBadge tipo={m.tipo} ajuste={["ajuste_positivo", "ajuste_negativo", "correcao"].includes(m.motivo)} />
                    <span className="font-semibold">
                      {m.oc_number ? `OC ${m.oc_number}` : REASON_LABELS[m.motivo] ?? m.motivo}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {formatDateTime(m.created_at)} · {m.user_nome} · estoque {formatNumber(m.estoque_anterior)} → {formatNumber(m.estoque_posterior)}
                    {m.observacao ? ` · “${m.observacao}”` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}
