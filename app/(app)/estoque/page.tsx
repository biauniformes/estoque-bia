import Link from "next/link";
import { MinusCircle, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listStock, getStockFacets } from "@/services/stock";
import { CATEGORIES, STATUS_LABELS } from "@/lib/constants";
import { first, formatBRL, formatNumber, variantLabel } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Filters, type FilterField } from "@/components/shared/filters";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { StockBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import type { StockRow } from "@/types";

export const metadata = { title: "Estoque atual" };

export default async function EstoquePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireUser();
  const isAdmin = profile.role === "admin";
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

  // itens "Único" (catálogo importado) não precisam de filtro de cor/tamanho
  const meaningful = (list: string[]) => list.filter((v) => variantLabel(v, v) !== "");
  const fields: FilterField[] = [
    { name: "q", label: "Produto", type: "search", placeholder: "Nome, código ou SKU" },
    { name: "categoria", label: "Categoria", type: "select", options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
    ...(meaningful(facets.cores).length > 0
      ? ([{ name: "cor", label: "Cor", type: "select", options: meaningful(facets.cores).map((c) => ({ value: c, label: c })) }] as FilterField[])
      : []),
    ...(meaningful(facets.tamanhos).length > 0
      ? ([{ name: "tamanho", label: "Tamanho", type: "select", options: meaningful(facets.tamanhos).map((t) => ({ value: t, label: t })) }] as FilterField[])
      : []),
    { name: "status", label: "Status", type: "select", options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
  ];

  const columns: Column<StockRow>[] = [
    { header: "Código", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
    {
      header: "Produto",
      cell: (r) => (
        <Link href={`/estoque/${r.variant_id}`} className="font-bold text-slate-900 underline-offset-4 hover:text-orange-700 hover:underline">
          {r.produto}
          {variantLabel(r.cor, r.tamanho) && <span className="block text-sm font-normal text-slate-500">{variantLabel(r.cor, r.tamanho)}</span>}
        </Link>
      ),
    },
    { header: "Estoque", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.estoque)}</strong> },
    { header: "Mínimo", align: "right", hideBelow: "lg", cell: (r) => formatNumber(r.estoque_minimo) },
    ...(isAdmin
      ? ([
          { header: "Valor unit.", align: "right", hideBelow: "lg", cell: (r) => formatBRL(r.valor_unitario) },
          { header: "Valor total", align: "right", hideBelow: "md", cell: (r) => <strong>{formatBRL(r.valor_total)}</strong> },
        ] as Column<StockRow>[])
      : []),
    { header: "Status", cell: (r) => <StockBadge status={r.status} /> },
    {
      header: "Ação",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button asChild size="sm" variant="entrada" aria-label={`Entrada de ${r.produto}`}>
            <Link href={`/entrada?variant=${r.variant_id}`}>
              <PlusCircle className="h-4 w-4" aria-hidden /> Entrada
            </Link>
          </Button>
          <Button asChild size="sm" variant="saida" aria-label={`Saída de ${r.produto}`}>
            <Link href={`/saida?variant=${r.variant_id}`}>
              <MinusCircle className="h-4 w-4" aria-hidden /> Saída
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Estoque atual" description="Saldo calculado a partir das movimentações — nunca editado à mão." />
      <Card className="overflow-hidden">
        <Filters fields={fields} />
        <DataTable<StockRow>
          caption="Estoque atual por produto"
          rows={rows}
          rowKey={(r) => r.variant_id}
          empty={<EmptyState title="Nenhum item encontrado" description="Ajuste os filtros ou a busca." />}
          columns={columns}
        />
        <Pagination page={page} total={total} pathname="/estoque" params={activeParams} />
      </Card>
    </>
  );
}
