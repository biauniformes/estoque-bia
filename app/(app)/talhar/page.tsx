import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import { GRUPOS_TALHAR, grupoTalharDe } from "@/lib/talhar";
import { cn, first, formatNumber, variantLabel } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { AbasTalhacao } from "@/components/talhacao/abas";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StockBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import type { StockRow } from "@/types";

export const metadata = { title: "Para talhar" };

export default async function TalharPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireUser();
  if (profile.role === "expedicao") redirect("/");
  const sp = await searchParams;
  const grupoSel = GRUPOS_TALHAR.find((g) => g.id === first(sp.grupo))?.id ?? "";
  const mostrarTodos = first(sp.todos) === "1";

  const variants = await listActiveVariants();
  const porGrupo = new Map<string, StockRow[]>(GRUPOS_TALHAR.map((g) => [g.id, []]));
  for (const v of variants) {
    const g = grupoTalharDe(v.produto);
    if (g) porGrupo.get(g.id)!.push(v);
  }
  const baixos = (rows: StockRow[]) => rows.filter((r) => r.estoque < r.estoque_minimo);

  const todosBaixos = GRUPOS_TALHAR.flatMap((g) => baixos(porGrupo.get(g.id)!));
  const faltam = todosBaixos.reduce((s, r) => s + (r.estoque_minimo - r.estoque), 0);
  const zerados = todosBaixos.filter((r) => r.estoque <= 0).length;

  const href = (grupo: string, todos = mostrarTodos) => {
    const q = new URLSearchParams();
    if (grupo) q.set("grupo", grupo);
    if (todos) q.set("todos", "1");
    const s = q.toString();
    return s ? `/talhar?${s}` : "/talhar";
  };

  const columns: Column<StockRow>[] = [
    {
      header: "Peça",
      cell: (r) => (
        <>
          <span className="font-bold text-slate-900">{r.produto}</span>
          {variantLabel(r.cor, r.tamanho) && <span className="block text-sm font-normal text-slate-500">{variantLabel(r.cor, r.tamanho)}</span>}
          <span className="block font-mono text-xs text-slate-400 md:hidden">{r.codigo}</span>
        </>
      ),
    },
    { header: "Código", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
    { header: "Estoque", align: "right", cell: (r) => <strong className="text-xl tabular-nums">{formatNumber(r.estoque)}</strong> },
    { header: "Mínimo", align: "right", hideBelow: "md", cell: (r) => formatNumber(r.estoque_minimo) },
    {
      header: "Talhar",
      align: "right",
      cell: (r) => {
        const falta = r.estoque_minimo - r.estoque;
        return falta > 0 ? <strong className="text-xl tabular-nums text-rose-700">{formatNumber(falta)}</strong> : <span className="text-slate-400">—</span>;
      },
    },
    { header: "Situação", cell: (r) => <StockBadge status={r.estoque <= 0 ? "zerado" : r.estoque < r.estoque_minimo ? "baixo" : "normal"} /> },
  ];

  const grupos = GRUPOS_TALHAR.filter((g) => !grupoSel || g.id === grupoSel);

  return (
    <>
      {profile.role === "admin" && <AbasTalhacao ativa="/talhar" />}
      <PageHeader
        title="Para talhar"
        description="Peças que mais saem e estão abaixo do estoque mínimo. A coluna “Talhar” é o quanto falta para chegar ao mínimo."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Itens abaixo do mínimo</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{formatNumber(todosBaixos.length)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Peças a talhar</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums text-rose-700">{formatNumber(faltam)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Itens zerados</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{formatNumber(zerados)}</p>
        </Card>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Chip href={href("")} active={!grupoSel}>
          Todos os grupos
        </Chip>
        {GRUPOS_TALHAR.map((g) => {
          const n = baixos(porGrupo.get(g.id)!).length;
          return (
            <Chip key={g.id} href={href(g.id)} active={grupoSel === g.id}>
              {g.label}
              {n > 0 && <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">{n}</span>}
            </Chip>
          );
        })}
        <Link
          href={href(grupoSel, !mostrarTodos)}
          className="ml-auto min-h-11 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 underline underline-offset-4 hover:text-orange-700"
        >
          {mostrarTodos ? "Mostrar só o que está baixo" : "Mostrar também os itens normais"}
        </Link>
      </div>

      <div className="space-y-6">
        {grupos.map((g) => {
          const todos = porGrupo.get(g.id)!;
          const rows = mostrarTodos ? todos : baixos(todos);
          const nBaixos = baixos(todos).length;
          return (
            <Card key={g.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-200 bg-slate-50 px-5 py-4">
                <h2 className="text-lg font-extrabold uppercase tracking-wide text-slate-800">{g.label}</h2>
                <p className="text-sm font-semibold text-slate-600">
                  {nBaixos > 0 ? <span className="text-rose-700">{formatNumber(nBaixos)} abaixo do mínimo</span> : "Tudo no mínimo ou acima"} · {formatNumber(todos.length)} itens no grupo
                </p>
              </div>
              <DataTable<StockRow>
                caption={g.label}
                rows={rows}
                rowKey={(r) => r.variant_id}
                empty={<EmptyState title={todos.length === 0 ? "Nenhum item cadastrado neste grupo" : "Nada para talhar neste grupo"} description={todos.length === 0 ? undefined : "Todos os itens estão no mínimo ou acima."} />}
                columns={columns}
              />
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-11 items-center rounded-xl border-2 px-4 text-sm font-bold transition-colors",
        active ? "border-black bg-black text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand hover:bg-orange-50",
      )}
    >
      {children}
    </Link>
  );
}
