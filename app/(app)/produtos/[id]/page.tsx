import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid, formatNumber, first, variantLabel } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { StockBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import { ProductForm } from "@/components/produtos/product-form";
import { VariantDialog } from "@/components/produtos/variant-dialog";
import { ActiveToggle } from "@/components/produtos/active-toggle";
import type { ProductRow, StockRow, VariantRow } from "@/types";

export const metadata = { title: "Produto" };

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const aviso = first((await searchParams).aviso);
  const supabase = await createClient();

  const { data: product } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) notFound();
  const [{ data: variants }, { data: stock }] = await Promise.all([
    supabase.from("product_variants").select("*").eq("product_id", id).order("cor").order("tamanho"),
    supabase.from("stock_overview").select("*").eq("product_id", id).order("cor").order("tamanho_ordem"),
  ]);
  const p = product as ProductRow;
  const stockById = new Map((stock as StockRow[] | null ?? []).map((s) => [s.variant_id, s]));
  const rows = ((variants ?? []) as VariantRow[]).sort((a, b) => {
    const sa = stockById.get(a.id)?.tamanho_ordem ?? 99;
    const sb = stockById.get(b.id)?.tamanho_ordem ?? 99;
    return a.cor.localeCompare(b.cor, "pt-BR") || sa - sb || a.tamanho.localeCompare(b.tamanho, "pt-BR", { numeric: true });
  });

  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Produtos
      </Link>
      <PageHeader
        title={p.nome}
        description={`Código ${p.codigo}`}
        actions={
          <>
            {p.ativo ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Desativado</Badge>}
            <ActiveToggle kind="product" id={p.id} ativo={p.ativo} label={p.nome} size="default" />
          </>
        }
      />
      {aviso === "variacao" && (
        <p role="alert" className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 font-semibold text-amber-900">
          Produto criado, mas a primeira variação não pôde ser salva (verifique SKU/cor/tamanho). Adicione abaixo.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Dados do produto</CardTitle></CardHeader>
          <CardContent><ProductForm product={p} /></CardContent>
        </Card>
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Variações</CardTitle>
            <VariantDialog productId={p.id} />
          </CardHeader>
          <DataTable<VariantRow>
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title="Sem variações" description="Adicione cor e tamanho para poder movimentar este produto." />}
            columns={[
              { header: "Cor / Tam.", cell: (r) => <strong>{variantLabel(r.cor, r.tamanho) || "Única"}</strong> },
              { header: "SKU", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.sku}</span> },
              { header: "Estoque", align: "right", cell: (r) => formatNumber(stockById.get(r.id)?.estoque ?? 0) },
              { header: "Mín.", align: "right", hideBelow: "md", cell: (r) => formatNumber(r.estoque_minimo) },
              {
                header: "Situação",
                cell: (r) => (r.ativo ? stockById.get(r.id) ? <StockBadge status={stockById.get(r.id)!.status} /> : "—" : <Badge>Desativada</Badge>),
              },
              {
                header: "Ações",
                align: "right",
                cell: (r) => (
                  <div className="flex justify-end gap-2">
                    <VariantDialog productId={p.id} variant={r} />
                    <ActiveToggle kind="variant" id={r.id} ativo={r.ativo} label={variantLabel(r.cor, r.tamanho) || "variação única"} />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
