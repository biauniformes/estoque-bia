import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ordemTamanho } from "@/lib/talhacao";
import { first, formatNumber, isDate, isUuid } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { AbasTalhacao } from "@/components/talhacao/abas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

export const metadata = { title: "Histórico da talhação" };
export const dynamic = "force-dynamic";

type Linha = {
  lote_key: string;
  data: string;
  peca: string;
  tamanho: string;
  quantidade: number;
  funcionaria_id: string;
  talhacao_funcionarias: { nome: string } | null;
};

const hojeBR = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtData = (d: string) => d.split("-").reverse().join("/");

export default async function HistoricoTalhacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const hoje = hojeBR();
  const toP = first(sp.to);
  const fromP = first(sp.from);
  const to = isDate(toP) ? toP : hoje;
  const from = isDate(fromP) ? fromP : addDias(to, -6);
  const funcP = first(sp.func);
  const func = isUuid(funcP) ? funcP : "";

  const supabase = await createClient();
  let q = supabase
    .from("talhacao_lancamentos")
    .select("lote_key, data, peca, tamanho, quantidade, funcionaria_id, talhacao_funcionarias(nome)")
    .gte("data", from)
    .lte("data", to)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (func) q = q.eq("funcionaria_id", func);
  const [{ data: linhasRaw, error }, { data: funcs }] = await Promise.all([q, supabase.from("talhacao_funcionarias").select("id, nome").order("nome")]);
  if (error) throw new Error(error.message);
  const linhas = (linhasRaw ?? []) as unknown as Linha[];

  const total = linhas.reduce((s, l) => s + l.quantidade, 0);
  const porFunc = new Map<string, number>();
  const porPeca = new Map<string, number>();
  const porDia = new Map<string, Map<string, { data: string; func: string; peca: string; itens: { t: string; q: number }[] }>>();
  for (const l of linhas) {
    const nome = l.talhacao_funcionarias?.nome ?? "—";
    porFunc.set(nome, (porFunc.get(nome) ?? 0) + l.quantidade);
    porPeca.set(l.peca, (porPeca.get(l.peca) ?? 0) + l.quantidade);
    const dia = porDia.get(l.data) ?? new Map();
    const g = dia.get(l.lote_key) ?? { data: l.data, func: nome, peca: l.peca, itens: [] };
    g.itens.push({ t: l.tamanho, q: l.quantidade });
    dia.set(l.lote_key, g);
    porDia.set(l.data, dia);
  }
  const rank = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const maisDeCincoMil = linhas.length >= 5000;

  return (
    <>
      <AbasTalhacao ativa="/talhacao/historico" />
      <PageHeader title="Histórico da talhação" description="O que foi talhado no período, por funcionária e por peça." />

      <Card className="mb-6 p-5">
        <form method="get" className="flex flex-wrap items-end gap-4">
          <Field label="De" htmlFor="h-from"><Input id="h-from" type="date" name="from" defaultValue={from} max={hoje} className="h-12" /></Field>
          <Field label="Até" htmlFor="h-to"><Input id="h-to" type="date" name="to" defaultValue={to} max={hoje} className="h-12" /></Field>
          <Field label="Funcionária" htmlFor="h-func">
            <Select id="h-func" name="func" defaultValue={func} className="min-w-52">
              <option value="">Todas</option>
              {(funcs ?? []).map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" size="lg">Filtrar</Button>
          <Link href="/talhacao/historico" className="min-h-12 px-2 py-3 text-sm font-bold text-slate-600 underline underline-offset-4 hover:text-orange-700">Últimos 7 dias</Link>
        </form>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Peças talhadas</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{formatNumber(total)}</p>
          <p className="mt-1 text-sm text-slate-500">{fmtData(from)} a {fmtData(to)}</p>
        </Card>
        <Card className="p-5 sm:col-span-2">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Por funcionária</p>
          {porFunc.size === 0 ? (
            <p className="text-slate-500">Nenhum lançamento no período.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {rank(porFunc).map(([nome, n]) => (
                <li key={nome} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <span className="font-semibold">{nome}</span>
                  <span className="font-extrabold tabular-nums">{formatNumber(n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {maisDeCincoMil && <p className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Mostrando só os 5.000 registros mais recentes. Reduza o período para ver tudo.</p>}

      {porPeca.size > 0 && (
        <Card className="mb-6 p-5">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Por peça</p>
          <ul className="grid gap-x-8 gap-y-1 lg:grid-cols-2">
            {rank(porPeca).map(([peca, n]) => (
              <li key={peca} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                <span className="min-w-0 truncate font-semibold" title={peca}>{peca}</span>
                <span className="font-extrabold tabular-nums">{formatNumber(n)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-6">
        {[...porDia.entries()].map(([dia, lotes]) => {
          const totalDia = [...lotes.values()].reduce((s, g) => s + g.itens.reduce((a, i) => a + i.q, 0), 0);
          return (
            <Card key={dia} className="overflow-hidden">
              <div className="flex items-baseline justify-between border-b-2 border-slate-200 bg-slate-50 px-5 py-3">
                <h2 className="text-base font-extrabold">{fmtData(dia)}</h2>
                <p className="text-sm font-bold text-slate-600">{formatNumber(totalDia)} peças</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {[...lotes.entries()].map(([key, g]) => {
                  const itens = g.itens.slice().sort((a, b) => ordemTamanho(a.t) - ordemTamanho(b.t));
                  return (
                    <li key={key} className="px-5 py-3">
                      <p className="font-bold">{g.peca}</p>
                      <p className="text-sm text-slate-600">{g.func}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {itens.map((i) => (
                          <span key={i.t} className="rounded-lg bg-orange-50 px-2.5 py-1 text-sm font-bold">
                            {i.t}: <span className="tabular-nums">{formatNumber(i.q)}</span>
                          </span>
                        ))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
