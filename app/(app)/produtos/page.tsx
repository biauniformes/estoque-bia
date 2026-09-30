import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, PAGE_SIZE, categoryLabel } from "@/lib/constants";
import { first, safeLike } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filters } from "@/components/shared/filters";
import { DataTable } from "@/components/shared/data-table";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/states";
import type { ProductRow } from "@/types";

export const metadata = { title: "Produtos" };

type Row = ProductRow & { product_variants: { id: string; ativo: boolean }[] };

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const params = { q: first(sp.q), categoria: first(sp.categoria), status: first(sp.status) };
  const page = parsePage(first(sp.page));
  const supabase = await createClient();

  let query = supabase.from("products").select("*, product_variants(id, ativo)", { count: "exact" });
  if (params.q) {
    const t = safeLike(params.q);
    if (t) query = query.or(`nome.ilike.%${t}%,codigo.ilike.%${t}%`);
  }
  if (params.categoria) query = query.eq("categoria", params.categoria);
  if (params.status === "ativo") query = query.eq("ativo", true);
  if (params.status === "inativo") query = query.eq("ativo", false);
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await query.order("nome").range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as Row[];
  const activeParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v));

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cadastro de produtos e variações (cor, tamanho, modelo, SKU e estoque mínimo)."
        actions={
          <Button asChild size="lg">
            <Link href="/produtos/novo"><Plus className="h-5 w-5" aria-hidden /> Novo produto</Link>
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <Filters
          fields={[
            { name: "q", label: "Buscar", type: "search", placeholder: "Nome ou código" },
            { name: "categoria", label: "Categoria", type: "select", options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
            { name: "status", label: "Situação", type: "select", options: [{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Desativados" }] },
          ]}
        />
        <DataTable<Row>
          caption="Produtos cadastrados"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Nenhum produto encontrado" />}
          columns={[
            { header: "Código", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
            {
              header: "Produto",
              cell: (r) => (
                <Link href={`/produtos/${r.id}`} className="font-bold hover:text-orange-700 hover:underline">{r.nome}</Link>
              ),
            },
            { header: "Categoria", hideBelow: "md", cell: (r) => categoryLabel(r.categoria) },
            { header: "Variações", align: "right", cell: (r) => r.product_variants.filter((v) => v.ativo).length },
            { header: "Situação", cell: (r) => (r.ativo ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Desativado</Badge>) },
            { header: "", align: "right", cell: (r) => <Button asChild size="sm" variant="outline"><Link href={`/produtos/${r.id}`}>Abrir</Link></Button> },
          ]}
        />
        <Pagination page={page} total={count ?? 0} pathname="/produtos" params={activeParams} />
      </Card>
    </>
  );
}
