import { requireUser } from "@/lib/auth/session";
import { listMovements, listUsersForFilter } from "@/services/movements";
import { CATEGORIES, REASON_LABELS } from "@/lib/constants";
import { first, formatDateTime, formatNumber, signed, variantLabel } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Filters, type FilterField } from "@/components/shared/filters";
import { DataTable } from "@/components/shared/data-table";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { MovementBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import { CorrectButton } from "@/components/movimentacoes/correct-button";
import type { MovementRow } from "@/types";

export const metadata = { title: "Movimentações" };

export default async function MovimentacoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireUser();
  const isAdmin = profile.role === "admin";
  const sp = await searchParams;
  const params = {
    q: first(sp.q),
    tipo: first(sp.tipo),
    user: isAdmin ? first(sp.user) : "",
    oc: isAdmin ? first(sp.oc) : "",
    categoria: isAdmin ? first(sp.categoria) : "",
    from: first(sp.from),
    to: first(sp.to),
  };
  const page = parsePage(first(sp.page));
  const [{ rows, total }, users] = await Promise.all([listMovements({ ...params, page }), isAdmin ? listUsersForFilter() : Promise.resolve([])]);
  const activeParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v));

  const fields: FilterField[] = [
    { name: "q", label: "Produto", type: "search", placeholder: "Produto, SKU ou OC" },
    { name: "tipo", label: "Tipo", type: "select", options: [{ value: "entrada", label: "Entradas" }, { value: "saida", label: "Saídas" }, { value: "ajuste", label: "Ajustes" }] },
    { name: "from", label: "De", type: "date" },
    { name: "to", label: "Até", type: "date" },
    ...(isAdmin
      ? ([
          { name: "user", label: "Usuário", type: "select", options: users.map((u) => ({ value: u.id, label: u.nome })) },
          { name: "oc", label: "OC", type: "search", placeholder: "Ex.: 22" },
          { name: "categoria", label: "Categoria", type: "select", options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
        ] as FilterField[])
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Movimentações"
        description={isAdmin ? "Histórico completo e imutável de entradas e saídas." : "Suas movimentações registradas."}
      />
      <Card className="overflow-hidden">
        <Filters fields={fields} />
        <DataTable<MovementRow>
          caption="Histórico de movimentações"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Nenhuma movimentação encontrada" description="Ajuste os filtros ou o período." />}
          columns={[
            { header: "Data", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
            {
              header: "Produto",
              cell: (r) => (
                <div>
                  <p className="font-bold">{r.produto}</p>
                  <p className="text-sm text-slate-500">
                    {[r.codigo, variantLabel(r.cor, r.tamanho), r.corrige_movement_id ? "correção" : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ),
            },
            { header: "Movimento", cell: (r) => <MovementBadge tipo={r.tipo} ajuste={["ajuste_positivo", "ajuste_negativo", "correcao"].includes(r.motivo)} /> },
            {
              header: "Quantidade",
              align: "right",
              cell: (r) => (
                <strong className={`text-xl ${r.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>{signed(r.tipo, r.quantidade)}</strong>
              ),
            },
            { header: "Motivo", hideBelow: "lg", cell: (r) => REASON_LABELS[r.motivo] ?? r.motivo },
            { header: "OC", cell: (r) => (r.oc_number ? `OC ${r.oc_number}` : "—") },
            { header: "Usuário", hideBelow: "md", cell: (r) => r.user_nome },
            ...(isAdmin
              ? [
                  {
                    header: "Estoque",
                    hideBelow: "lg" as const,
                    align: "right" as const,
                    cell: (r: MovementRow) => `${formatNumber(r.estoque_anterior)} → ${formatNumber(r.estoque_posterior)}`,
                  },
                  {
                    header: "Ação",
                    align: "right" as const,
                    cell: (r: MovementRow) =>
                      r.corrige_movement_id ? null : (
                        <CorrectButton
                          movementId={r.id}
                          tipo={r.tipo}
                          quantidade={r.quantidade}
                          label={`${r.produto} ${variantLabel(r.cor, r.tamanho)}`.trim()}
                        />
                      ),
                  },
                ]
              : []),
          ]}
        />
        <Pagination page={page} total={total} pathname="/movimentacoes" params={activeParams} />
      </Card>
    </>
  );
}
