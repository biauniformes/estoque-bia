import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import { listMovements, listUsersForFilter } from "@/services/movements";
import { listAuditEvents } from "@/services/audit";
import { AUDIT_ACTION_LABELS, CATEGORIES, REASON_LABELS } from "@/lib/constants";
import { cn, first, formatDateTime, formatNumber, signed, variantLabel } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Filters, type FilterField } from "@/components/shared/filters";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { MovementBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import type { AuditRow, MovementRow } from "@/types";

export const metadata = { title: "Auditoria" };

function MovementAuditCard({ m }: { m: MovementRow }) {
  const ajuste = ["ajuste_positivo", "ajuste_negativo", "correcao"].includes(m.motivo);
  return (
    <li className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold">{m.user_nome}</p>
          <p className="text-sm text-slate-500">
            {formatDateTime(m.created_at)} · {m.user_role === "admin" ? "Administrador" : "Operador"}
            {m.ip_address ? ` · IP ${m.ip_address}` : ""}
          </p>
        </div>
        <MovementBadge tipo={m.tipo} ajuste={ajuste} />
      </div>
      <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Produto</p>
          <p className="font-bold">{m.produto}</p>
          <p className="text-sm text-slate-600">{variantLabel(m.cor, m.tamanho) || m.codigo}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Quantidade</p>
          <p className={cn("text-2xl font-extrabold tabular-nums", m.tipo === "entrada" ? "text-emerald-700" : "text-rose-700")}>
            {signed(m.tipo, m.quantidade)} <span className="text-base font-semibold text-slate-500">unidades</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Motivo / OC</p>
          <p className="font-bold">{REASON_LABELS[m.motivo] ?? m.motivo}</p>
          {m.oc_number && <p className="text-sm text-slate-600">OC {m.oc_number}</p>}
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Estoque</p>
          <p className="font-bold tabular-nums">
            {formatNumber(m.estoque_anterior)} → {formatNumber(m.estoque_posterior)}
          </p>
          <p className="text-sm text-slate-600">anterior → posterior</p>
        </div>
      </div>
      {m.observacao && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">Observação: {m.observacao}</p>}
    </li>
  );
}

function describeEvent(e: AuditRow): string {
  const md = e.metadata ?? {};
  const rotulo = typeof md.rotulo === "string" ? md.rotulo : null;
  const alteracoes = md.alteracoes && typeof md.alteracoes === "object" ? Object.keys(md.alteracoes as object) : [];
  const parts: string[] = [];
  if (rotulo) parts.push(rotulo);
  if (alteracoes.length) parts.push(`campos: ${alteracoes.join(", ")}`);
  if (e.action === "operacao_invalida") {
    if (md.mensagem) parts.push(String(md.mensagem));
    if (md.motivo) parts.push(String(md.motivo).replaceAll("_", " "));
  }
  return parts.join(" · ");
}

function EventItem({ e }: { e: AuditRow }) {
  const warn = e.action === "operacao_invalida" || e.action === "permissao_alterada";
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-5">
      <div>
        <p className="text-lg font-extrabold">{e.user_nome ?? "Sistema"}</p>
        <p className="text-sm text-slate-500">
          {formatDateTime(e.created_at)}
          {e.ip_address ? ` · IP ${e.ip_address}` : ""}
        </p>
        {describeEvent(e) && <p className="mt-1 text-slate-700">{describeEvent(e)}</p>}
      </div>
      <Badge tone={warn ? "warning" : "neutral"}>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</Badge>
    </li>
  );
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireAdmin();
  const sp = await searchParams;
  const view = first(sp.view) === "eventos" ? "eventos" : "movimentos";
  const page = parsePage(first(sp.page));
  const users = await listUsersForFilter();

  const base = { q: first(sp.q), user: first(sp.user), from: first(sp.from), to: first(sp.to) };

  // registra o acesso administrativo (somente na abertura, sem filtros/paginação)
  if (![...Object.keys(sp)].some((k) => k !== "view")) {
    try {
      const supabase = await createClient();
      const { ip, ua } = await getRequestMeta();
      await supabase.rpc("log_audit_event", {
        p_action: "acesso_administrativo",
        p_entity_type: "rota",
        p_entity_id: null,
        p_metadata: { pagina: "auditoria", aba: view, usuario: profile.nome },
        p_ip: ip,
        p_ua: ua,
      });
    } catch {
      // melhor esforço
    }
  }

  let content: React.ReactNode;
  let total = 0;
  let activeParams: Record<string, string> = {};
  let fields: FilterField[];

  if (view === "movimentos") {
    const f = { ...base, tipo: first(sp.tipo), oc: first(sp.oc), categoria: first(sp.categoria) };
    const { rows, total: t } = await listMovements({ ...f, page });
    total = t;
    activeParams = Object.fromEntries(Object.entries({ ...f, view }).filter(([, v]) => v));
    fields = [
      { name: "q", label: "Busca", type: "search", placeholder: "Produto, usuário, OC…" },
      { name: "user", label: "Usuário", type: "select", options: users.map((u) => ({ value: u.id, label: u.nome })) },
      { name: "from", label: "Data inicial", type: "date" },
      { name: "to", label: "Data final", type: "date" },
      { name: "tipo", label: "Tipo", type: "select", options: [{ value: "entrada", label: "Entradas" }, { value: "saida", label: "Saídas" }, { value: "ajuste", label: "Ajustes" }] },
      { name: "oc", label: "OC", type: "search", placeholder: "Ex.: 22" },
      { name: "categoria", label: "Categoria", type: "select", options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
    ];
    content =
      rows.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros." />
      ) : (
        <ul className="divide-y divide-slate-200">{rows.map((m) => <MovementAuditCard key={m.id} m={m} />)}</ul>
      );
  } else {
    const f = { ...base, action: first(sp.action) };
    const { rows, total: t } = await listAuditEvents({ ...f, page });
    total = t;
    activeParams = Object.fromEntries(Object.entries({ ...f, view }).filter(([, v]) => v));
    const eventActions = Object.entries(AUDIT_ACTION_LABELS).filter(([k]) => !["entrada", "saida", "ajuste"].includes(k));
    fields = [
      { name: "q", label: "Busca", type: "search", placeholder: "Usuário ou ação…" },
      { name: "user", label: "Usuário", type: "select", options: users.map((u) => ({ value: u.id, label: u.nome })) },
      { name: "action", label: "Evento", type: "select", allLabel: "Todos os eventos", options: eventActions.map(([value, label]) => ({ value, label })) },
      { name: "from", label: "Data inicial", type: "date" },
      { name: "to", label: "Data final", type: "date" },
    ];
    content =
      rows.length === 0 ? (
        <EmptyState title="Nenhum evento encontrado" description="Ajuste os filtros." />
      ) : (
        <ul className="divide-y divide-slate-200">{rows.map((e) => <EventItem key={e.id} e={e} />)}</ul>
      );
  }

  const tab = (active: boolean) =>
    cn("flex h-12 items-center rounded-xl px-5 font-bold", active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-2 ring-slate-200 hover:bg-slate-100");

  return (
    <>
      <PageHeader title="Auditoria" description="Quem fez o quê, quando, e como estava o estoque antes e depois." />
      <div className="mb-4 flex gap-3">
        <Link href="/auditoria" className={tab(view === "movimentos")} prefetch={false}>Movimentações de estoque</Link>
        <Link href="/auditoria?view=eventos" className={tab(view === "eventos")} prefetch={false}>Eventos do sistema</Link>
      </div>
      <Card className="overflow-hidden">
        <Filters key={view} fields={fields} />
        {content}
        <Pagination page={page} total={total} pathname="/auditoria" params={activeParams} />
      </Card>
    </>
  );
}
