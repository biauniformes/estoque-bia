import Link from "next/link";
import { MinusCircle, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listStock, getStockFacets } from "@/services/stock";
import { CATEGORIES, STATUS_LABELS } from "@/lib/constants";
import { first, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Filters } from "@/components/shared/filters";
import { DataTable } from "@/components/shared/data-table";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { StockBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import type { StockRow } from "@/types";

export const metadata = { title: "Estoque atual" };

export default async function EstoquePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const params = {
    q: first(sp.q),
    categoria: first(sp.categoria),
    cor: first(sp.cor),
    tamanho: first(sp.tamanho),
    status: first(sp.status),
  };
  const page = parsePage(first(sp.page));
  const [{ rows, total }, facets] = await Promise.all([listStock({ ...params, page }), getStockFacets()]);
  const activeParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v));

  return (
    <>
      <PageHeader title="Estoque atual" description="Saldo calculado a partir das movimentações — nunca editado à mão." />
      <Card className="overflow-hidden">
        <Filters
          fields={[
            { name: "q", label: "Produto", type: "search", placeholder: "Produto, código ou SKU" },
            { name: "categoria", label: "Categoria", type: "select", options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
            { name: "cor", label: "Cor", type: "select", options: facets.cores.map((c) => ({ value: c, label: c })) },
            { name: "tamanho", label: "Tamanho", type: "select", options: facets.tamanhos.map((t) => ({ value: t, label: t })) },
            { name: "status", label: "Status", type: "select", options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
          ]}
        />
        <DataTable<StockRow>
          caption="Estoque atual por produto, cor e tamanho"
          rows={rows}
          rowKey={(r) => r.variant_id}
          empty={<EmptyState title="Nenhum item encontrado" description="Ajuste os filtros ou a busca." />}
          columns={[
            {
              header: "Produto",
              cell: (r) => (
                <Link href={`/estoque/${r.variant_id}`} className="font-bold text-slate-900 underline-offset-4 hover:text-orange-700 hover:underline">
                  {r.produto}
                </Link>
              ),
            },
            { header: "Cor", cell: (r) => r.cor },
            { header: "Tamanho", cell: (r) => r.tamanho },
            { header: "Estoque", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.estoque)}</strong> },
            { header: "Mínimo", align: "right", hideBelow: "md", cell: (r) => formatNumber(r.estoque_minimo) },
            { header: "Status", cell: (r) => <StockBadge status={r.status} /> },
            {
              header: "Ação",
              align: "right",
              cell: (r) => (
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm" variant="entrada" aria-label={`Entrada de ${r.produto} ${r.cor} ${r.tamanho}`}>
                    <Link href={`/entrada?variant=${r.variant_id}`}>
                      <PlusCircle className="h-4 w-4" aria-hidden /> Entrada
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="saida" aria-label={`Saída de ${r.produto} ${r.cor} ${r.tamanho}`}>
                    <Link href={`/saida?variant=${r.variant_id}`}>
                      <MinusCircle className="h-4 w-4" aria-hidden /> Saída
                    </Link>
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pagination page={page} total={total} pathname="/estoque" params={activeParams} />
      </Card>
    </>
  );
}
