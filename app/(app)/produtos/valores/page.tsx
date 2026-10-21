import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { first, formatBRL, formatNumber, safeLike } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Filters } from "@/components/shared/filters";
import { DataTable } from "@/components/shared/data-table";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/states";
import { ValueInline } from "@/components/produtos/value-inline";

export const metadata = { title: "Valores pendentes" };

const PAGE = 50;

type Row = { id: string; codigo: string; nome: string; valor_unitario: number; valor_pendente: "aguardando" | "revisar" };

export default async function ValoresPendentesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tipo = first(sp.tipo) === "revisar" ? "revisar" : "aguardando";
  const q = first(sp.q);
  const page = parsePage(first(sp.page));
  const supabase = await createClient();

  const count = async (t: string) =>
    (await supabase.from("products").select("id", { count: "exact", head: true }).eq("valor_pendente", t)).count ?? 0;
  const [nAguardando, nRevisar] = await Promise.all([count("aguardando"), count("revisar")]);

  let query = supabase.from("products").select("id,codigo,nome,valor_unitario,valor_pendente", { count: "exact" }).eq("valor_pendente", tipo);
  if (q) {
    const t = safeLike(q);
    if (t) query = query.or(`nome.ilike.%${t}%,codigo.ilike.%${t}%`);
  }
  const from = (page - 1) * PAGE;
  const { data, count: total } = await query.order("codigo").range(from, from + PAGE - 1);
  const rows = (data ?? []) as Row[];

  // estoque atual dos itens da página (útil na aba "revisar")
  const estoque = new Map<string, number>();
  if (rows.length) {
    const { data: st } = await supabase.from("stock_overview").select("codigo,estoque").in("codigo", rows.map((r) => r.codigo));
    (st ?? []).forEach((s: { codigo: string; estoque: number }) => estoque.set(s.codigo, s.estoque));
  }

  const tab = (active: boolean) =>
    cn("flex h-12 items-center gap-2 rounded-xl px-5 font-bold", active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-2 ring-slate-200 hover:bg-slate-100");

  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Produtos
      </Link>
      <PageHeader
        title="Valores pendentes"
        description="Só administradores veem esta tela. Informe o valor de cada item e clique em Salvar."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/produtos/valores" className={tab(tipo === "aguardando")}>
          Aguardando valor <span className="rounded-full bg-orange-500 px-2 text-sm text-black">{formatNumber(nAguardando)}</span>
        </Link>
        <Link href="/produtos/valores?tipo=revisar" className={tab(tipo === "revisar")}>
          Revisar valor <span className="rounded-full bg-orange-500 px-2 text-sm text-black">{formatNumber(nRevisar)}</span>
        </Link>
      </div>
      <p className="mb-4 max-w-3xl rounded-2xl border-2 border-slate-300 bg-white p-4 text-slate-700">
        {tipo === "aguardando" ? (
          <>
            Itens novos da lista de preços que vieram <strong>sem valor</strong>. Eles ficam <strong>desativados</strong> (ninguém os vê nas buscas, entradas e saídas)
            até você informar o valor: ao salvar, o item é <strong>ativado automaticamente</strong>.
          </>
        ) : (
          <>
            Itens que já estão em uso com um valor <strong>provisório</strong>. Informe o valor correto e salve para tirar o aviso do dashboard.
          </>
        )}
      </p>
      <Card className="overflow-hidden">
        <Filters fields={[{ name: "q", label: "Buscar", type: "search", placeholder: "Nome ou código" }]} />
        <DataTable<Row>
          caption="Itens com valor pendente"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title={tipo === "aguardando" ? "Nenhum item aguardando valor" : "Nenhum item para revisar"} description="Tudo em dia por aqui." />}
          columns={[
            { header: "Código", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
            { header: "Produto", cell: (r) => <Link href={`/produtos/${r.id}`} className="font-bold hover:text-orange-700 hover:underline">{r.nome}</Link> },
            ...(tipo === "revisar"
              ? [
                  { header: "Estoque", align: "right" as const, cell: (r: Row) => formatNumber(estoque.get(r.codigo) ?? 0) },
                  { header: "Valor atual", align: "right" as const, hideBelow: "md" as const, cell: (r: Row) => formatBRL(r.valor_unitario) },
                ]
              : []),
            { header: "Novo valor", align: "right", cell: (r) => <ValueInline id={r.id} atual={tipo === "revisar" ? r.valor_unitario : 0} rotulo={r.codigo} /> },
          ]}
        />
        <Pagination page={page} total={total ?? 0} pathname="/produtos/valores" params={{ ...(tipo === "revisar" ? { tipo } : {}), ...(q ? { q } : {}) }} pageSize={PAGE} />
      </Card>
    </>
  );
}
