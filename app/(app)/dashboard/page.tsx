import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Banknote, FileText, MinusCircle, Package, PlusCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listMovements } from "@/services/movements";
import { formatBRL, formatDateTime, formatNumber, signed, variantLabel } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MovementBadge, StockBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState } from "@/components/shared/states";
import type { StockStatus } from "@/lib/constants";

export const metadata = { title: "Dashboard" };

type Summary = {
  estoque_total: number;
  valor_total: number;
  entradas_hoje: number;
  saidas_hoje: number;
  estoque_baixo: number;
  ocs_movimentadas: number;
  atencao: { variant_id: string; produto: string; cor: string; tamanho: string; estoque: number; estoque_minimo: number; status: StockStatus }[];
};

export default async function DashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, recent] = await Promise.all([supabase.rpc("dashboard_summary"), listMovements({}, 8)]);
  if (error || !data) return <ErrorState description="Não foi possível carregar o resumo do estoque." />;
  const s = data as Summary;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral do estoque em tempo real."
        actions={
          <>
            <Button asChild variant="entrada" size="lg"><Link href="/entrada"><PlusCircle className="h-5 w-5" aria-hidden /> Entrada</Link></Button>
            <Button asChild variant="saida" size="lg"><Link href="/saida"><MinusCircle className="h-5 w-5" aria-hidden /> Saída</Link></Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-5 rounded-2xl bg-black p-6 text-white shadow-sm">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand text-black">
            <Package className="h-8 w-8" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-300">Peças em estoque</p>
            <p className="text-4xl font-extrabold tabular-nums text-brand sm:text-5xl">{formatNumber(s.estoque_total)}</p>
            <p className="text-sm text-slate-400">unidades somadas de todos os itens</p>
          </div>
        </div>
        <div className="flex items-center gap-5 rounded-2xl bg-black p-6 text-white shadow-sm">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand text-black">
            <Banknote className="h-8 w-8" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-300">Valor total em estoque</p>
            <p className="truncate text-4xl font-extrabold tabular-nums text-brand sm:text-5xl">{formatBRL(s.valor_total)}</p>
            <p className="text-sm text-slate-400">quantidade × valor unitário de cada peça</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Entradas hoje" value={formatNumber(s.entradas_hoje)} tone="success" icon={<ArrowDownToLine className="h-7 w-7" />} hint="unidades" />
        <StatCard label="Saídas hoje" value={formatNumber(s.saidas_hoje)} tone="danger" icon={<ArrowUpFromLine className="h-7 w-7" />} hint="unidades" />
        <StatCard label="Estoque baixo" value={formatNumber(s.estoque_baixo)} tone="warning" icon={<AlertTriangle className="h-7 w-7" />} hint="itens no mínimo ou abaixo" />
        <StatCard label="OCs movimentadas" value={formatNumber(s.ocs_movimentadas)} tone="info" icon={<FileText className="h-7 w-7" />} hint="últimos 30 dias" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Produtos que precisam de atenção</CardTitle>
          </CardHeader>
          <CardContent>
            {s.atencao.length === 0 ? (
              <EmptyState title="Tudo em ordem" description="Nenhum item no mínimo ou abaixo." className="py-8" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.atencao.map((a) => (
                  <li key={a.variant_id}>
                    <Link href={`/estoque/${a.variant_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-3 hover:bg-slate-50">
                      <div>
                        <p className="font-bold">{a.produto}</p>
                        <p className="text-sm text-slate-500">
                          {variantLabel(a.cor, a.tamanho) && `${variantLabel(a.cor, a.tamanho)} · `}atual <strong>{formatNumber(a.estoque)}</strong> · mínimo {formatNumber(a.estoque_minimo)}
                        </p>
                      </div>
                      <StockBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Últimas movimentações</CardTitle>
            <Link href="/movimentacoes" className="text-sm font-semibold text-orange-700 hover:underline">Ver todas</Link>
          </CardHeader>
          <CardContent>
            {recent.rows.length === 0 ? (
              <EmptyState title="Sem movimentações ainda" className="py-8" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.rows.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-bold">
                        {m.produto} <span className="font-normal text-slate-500">{variantLabel(m.cor, m.tamanho)}</span>
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDateTime(m.created_at)} · {m.user_nome}
                        {m.oc_number ? ` · OC ${m.oc_number}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <MovementBadge tipo={m.tipo} ajuste={["ajuste_positivo", "ajuste_negativo", "correcao"].includes(m.motivo)} />
                      <span className={`w-16 text-right text-xl font-extrabold tabular-nums ${m.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>
                        {signed(m.tipo, m.quantidade)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
