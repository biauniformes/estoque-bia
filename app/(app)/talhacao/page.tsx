import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listActiveVariants } from "@/services/stock";
import { ordemTamanho, pecaBase } from "@/lib/talhacao";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { TalhacaoForm } from "@/components/talhacao/talhacao-form";
import { DeleteLoteButton } from "@/components/talhacao/delete-lote-button";

export const metadata = { title: "Talhação" };
export const dynamic = "force-dynamic";

type Linha = {
  lote_key: string;
  data: string;
  peca: string;
  tamanho: string;
  quantidade: number;
  observacao: string | null;
  user_id: string;
  user_nome: string;
  created_at: string;
  talhacao_funcionarias: { nome: string } | null;
};

export default async function TalhacaoPage() {
  const profile = await requireUser();
  if (profile.role === "expedicao") redirect("/");

  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const supabase = await createClient();
  const [variants, funcRes, linhasRes] = await Promise.all([
    listActiveVariants(),
    supabase.from("talhacao_funcionarias").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("talhacao_lancamentos")
      .select("lote_key, data, peca, tamanho, quantidade, observacao, user_id, user_nome, created_at, talhacao_funcionarias(nome)")
      .gte("created_at", `${hoje}T00:00:00-03:00`)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  if (funcRes.error || linhasRes.error) throw new Error((funcRes.error ?? linhasRes.error)!.message);

  const pecas = [...new Set(variants.map((v) => pecaBase(v.nome_base)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const funcionarias = (funcRes.data ?? []) as { id: string; nome: string }[];

  // um cartão por lançamento (mesma peça, vários tamanhos)
  const lotes = new Map<string, { key: string; func: string; peca: string; data: string; obs: string | null; userId: string; userNome: string; at: string; itens: { t: string; q: number }[] }>();
  for (const l of (linhasRes.data ?? []) as unknown as Linha[]) {
    const g = lotes.get(l.lote_key) ?? {
      key: l.lote_key,
      func: l.talhacao_funcionarias?.nome ?? "—",
      peca: l.peca,
      data: l.data,
      obs: l.observacao,
      userId: l.user_id,
      userNome: l.user_nome,
      at: l.created_at,
      itens: [],
    };
    g.itens.push({ t: l.tamanho, q: l.quantidade });
    lotes.set(l.lote_key, g);
  }
  const lista = [...lotes.values()];
  const totalHoje = lista.reduce((s, g) => s + g.itens.reduce((a, i) => a + i.q, 0), 0);
  const fmtHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const fmtData = (d: string) => d.split("-").reverse().join("/");

  return (
    <>
      <PageHeader title="Talhação" description="Registre o que cada funcionária talhou. Isso não altera o estoque — é o controle da produção do corte." />
      <div className="mx-auto max-w-3xl space-y-6">
        <TalhacaoForm funcionarias={funcionarias} pecas={pecas} hoje={hoje} />

        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-extrabold">Lançamentos de hoje — Talhação</h2>
            {lista.length > 0 && <p className="text-sm font-bold text-slate-600">{formatNumber(totalHoje)} peças no dia</p>}
          </div>
          {lista.length === 0 ? (
            <p className="py-6 text-center text-slate-500">Nenhum lançamento ainda hoje nesta área.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lista.map((g) => {
                const itens = g.itens.slice().sort((a, b) => ordemTamanho(a.t) - ordemTamanho(b.t));
                const total = itens.reduce((s, i) => s + i.q, 0);
                const podeExcluir = profile.role === "admin" || g.userId === profile.id;
                return (
                  <li key={g.key} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900">{g.peca}</p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {g.func} · {fmtHora(g.at)}
                        {g.data !== hoje && <span className="font-semibold text-amber-700"> · data {fmtData(g.data)}</span>}
                        {g.userId !== profile.id && <span className="text-slate-400"> · lançado por {g.userNome}</span>}
                      </p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {itens.map((i) => (
                          <span key={i.t} className="rounded-lg bg-orange-50 px-2.5 py-1 text-sm font-bold text-slate-800">
                            {i.t}: <span className="tabular-nums">{formatNumber(i.q)}</span>
                          </span>
                        ))}
                      </p>
                      {g.obs && <p className="mt-1 text-sm italic text-slate-500">{g.obs}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-2xl font-extrabold tabular-nums">{formatNumber(total)}</span>
                      {podeExcluir && <DeleteLoteButton loteKey={g.key} resumo={`${g.func} · ${g.peca} · ${formatNumber(total)} peças`} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
