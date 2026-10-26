"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { salvarLigacaoModeloAction, salvarLigacaoTamanhoAction } from "@/app/actions/oc";
import { TAMANHOS_NOSSOS } from "@/lib/oc";
import { cn, formatNumber } from "@/lib/utils";
import type { ModeloLigacao, ModeloNosso } from "@/services/oc";

export type TamanhoPendente = { cod: string; tam: string; desc: string; qtd: number; motivo: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function LinhaModelo({ lig, modelos, qtdPendente }: { lig: ModeloLigacao; modelos: ModeloNosso[]; qtdPendente: number }) {
  const router = useRouter();
  const nomeDe = React.useMemo(() => new Map(modelos.map((m) => [m.modelo, m.nome])), [modelos]);
  const [modelo, setModelo] = React.useState<string | null>(lig.modelo);
  const [query, setQuery] = React.useState(lig.modelo ? `${lig.modelo} · ${nomeDe.get(lig.modelo) ?? ""}` : "");
  const [aberto, setAberto] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const matches = React.useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    return modelos.filter((m) => tokens.every((t) => norm(`${m.modelo} ${m.nome}`).includes(t))).slice(0, 30);
  }, [query, modelos]);

  const mudou = modelo !== lig.modelo;
  const estado = !lig.modelo ? "sem" : lig.confirmado ? "ok" : "confirmar";

  async function salvar(confirmado: boolean) {
    setPending(true);
    const res = await salvarLigacaoModeloAction({ codCliente: lig.cod, modelo, confirmado });
    setPending(false);
    if (res.ok) {
      toast.success(modelo ? "Ligação salva." : "Ligação removida.");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-base font-extrabold">{lig.cod}</span>
        <span className="min-w-0 flex-1 font-semibold text-slate-800">{lig.descricao ?? "—"}</span>
        {qtdPendente > 0 && <span className="text-sm font-bold text-slate-500">{formatNumber(qtdPendente)} un. nas OCs pendentes</span>}
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-extrabold",
            estado === "sem" && "bg-red-100 text-red-800",
            estado === "confirmar" && "bg-amber-100 text-amber-800",
            estado === "ok" && "bg-emerald-100 text-emerald-800",
          )}
        >
          {estado === "sem" ? "Sem ligação" : estado === "confirmar" ? "A confirmar" : "Confirmada"}
        </span>
      </div>
      <div className="relative mt-2 flex flex-wrap items-start gap-2">
        <div className="relative min-w-64 flex-1">
          <input
            value={query}
            onFocus={() => setAberto(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setAberto(true);
              if (modelo) setModelo(null);
            }}
            placeholder="Buscar o nosso modelo (nome ou código)…"
            aria-label={`Nosso modelo para ${lig.cod}`}
            autoComplete="off"
            className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
          />
          {aberto && !modelo && (
            <>
              <button type="button" aria-label="Fechar lista" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setAberto(false)} />
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border-2 border-slate-200 bg-white shadow-lg" role="listbox">
                {matches.length === 0 && <p className="px-4 py-3 text-slate-500">Nenhum modelo encontrado.</p>}
                {matches.map((m) => (
                  <button
                    key={m.modelo}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setModelo(m.modelo);
                      setQuery(`${m.modelo} · ${m.nome}`);
                      setAberto(false);
                    }}
                    className="block min-h-12 w-full border-b border-slate-100 px-4 py-2 text-left last:border-0 hover:bg-orange-50"
                  >
                    <span className="font-mono text-xs text-slate-500">{m.modelo}</span>
                    <span className="block font-semibold">{m.nome}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <Button type="button" size="lg" loading={pending} disabled={!modelo || (!mudou && lig.confirmado)} onClick={() => salvar(true)}>
          <Check className="h-5 w-5" aria-hidden /> {mudou || !lig.modelo ? "Salvar e confirmar" : "Confirmar"}
        </Button>
        {lig.modelo && !query.trim() && (
          <Button type="button" variant="outline" size="lg" loading={pending} onClick={() => salvar(false)}>
            Remover ligação
          </Button>
        )}
      </div>
    </li>
  );
}

function LinhaTamanho({ p }: { p: TamanhoPendente }) {
  const router = useRouter();
  const [valor, setValor] = React.useState("");
  const [pending, setPending] = React.useState(false);
  async function salvar() {
    if (!valor) return;
    setPending(true);
    const res = await salvarLigacaoTamanhoAction({ codCliente: p.cod, tamanhoCliente: p.tam, tamanhoNosso: valor as (typeof TAMANHOS_NOSSOS)[number] });
    setPending(false);
    if (res.ok) {
      toast.success("Conversão salva.");
      router.refresh();
    } else toast.error(res.error);
  }
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p>
          <span className="font-mono font-extrabold">{p.cod}</span> · tamanho <span className="font-extrabold">{p.tam}</span> <span className="text-slate-500">({formatNumber(p.qtd)} un.)</span>
        </p>
        <p className="text-sm text-slate-600">{p.desc}</p>
        <p className="text-sm font-semibold text-amber-800">{p.motivo}</p>
      </div>
      <Select value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Nosso tamanho para ${p.cod} ${p.tam}`} className="w-44">
        <option value="">Nosso tamanho…</option>
        {TAMANHOS_NOSSOS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </Select>
      <Button type="button" size="lg" loading={pending} disabled={!valor} onClick={salvar}>
        Salvar
      </Button>
    </li>
  );
}

export function LigacoesEditor({ ligacoes, modelos, pendentesPorCod, tamanhos }: { ligacoes: ModeloLigacao[]; modelos: ModeloNosso[]; pendentesPorCod: Record<string, number>; tamanhos: TamanhoPendente[] }) {
  const [soAtencao, setSoAtencao] = React.useState(true);
  const lista = ligacoes
    .filter((l) => !soAtencao || !l.modelo || !l.confirmado)
    .sort((a, b) => Number(!!a.modelo) - Number(!!b.modelo) || Number(a.confirmado) - Number(b.confirmado) || (pendentesPorCod[b.cod] ?? 0) - (pendentesPorCod[a.cod] ?? 0) || a.cod.localeCompare(b.cod));
  const atencao = ligacoes.filter((l) => !l.modelo || !l.confirmado).length;

  return (
    <div className="space-y-6">
      {tamanhos.length > 0 && (
        <Card className="border-2 border-amber-400 p-5">
          <h2 className="text-lg font-extrabold">Tamanhos sem conversão</h2>
          <p className="mt-1 text-sm text-slate-600">O cliente usa um tamanho que não existe (ou não tem código) no nosso cadastro. Diga qual é o nosso tamanho equivalente.</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {tamanhos.map((p) => (
              <LinhaTamanho key={`${p.cod}|${p.tam}`} p={p} />
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Produtos do cliente</h2>
          <button
            type="button"
            onClick={() => setSoAtencao((v) => !v)}
            className="min-h-11 rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-brand hover:bg-orange-50"
          >
            {soAtencao ? `Mostrar todos (${ligacoes.length})` : `Mostrar só os que precisam de atenção (${atencao})`}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">Cada código do cliente (66.xxxx) é ligado a um modelo nosso uma única vez; os tamanhos se ajustam sozinhos. Itens “a confirmar” foram ligados só pelo nome.</p>
        {lista.length === 0 ? (
          <p className="py-8 text-center text-slate-500">Tudo ligado e confirmado.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {lista.map((l) => (
              <LinhaModelo key={`${l.cod}:${l.modelo}:${l.confirmado}`} lig={l} modelos={modelos} qtdPendente={pendentesPorCod[l.cod] ?? 0} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
