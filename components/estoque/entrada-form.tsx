"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ClipboardPaste, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registerEntradaLoteAction, type EntradaLoteResult } from "@/app/actions/movements";
import { ENTRADA_REASONS } from "@/lib/constants";
import { cn, formatNumber, newKey } from "@/lib/utils";
import { EMPRESAS, SEM_EMPRESA, empresaDe, empresaLabel } from "@/lib/empresas";
import { SECOES, secaoDe } from "@/lib/secoes";
import { agruparPorModelo, filtrarPorTexto, tamanhoDe, type GrupoModelo } from "@/lib/modelos";
import type { StockRow } from "@/types";

type Line = { id: string; qty: string };
type Motivo = (typeof ENTRADA_REASONS)[number]["value"];
type Grupo = GrupoModelo;

const EMPRESA_CHIPS = [...EMPRESAS, SEM_EMPRESA] as const;
const MAX_GRUPOS = 30;

/** "100.301.00 20" / "100.301.00;20" / "100.301.00<TAB>20" / "100.301.00 x 20" → {code, qty} */
function parseLine(line: string): { code: string; qty: number } | null {
  const m = line.trim().match(/^([0-9][0-9.\-]*)\s*(?:[;\t,:]|x|×|\s)\s*(\d{1,7})$/i);
  return m ? { code: m[1], qty: parseInt(m[2], 10) } : null;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-11 rounded-xl border-2 px-4 text-sm font-bold transition-colors",
        active ? "border-black bg-black text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand hover:bg-orange-50",
      )}
    >
      {children}
    </button>
  );
}

export function EntradaForm({ variants, initialVariantId }: { variants: StockRow[]; initialVariantId?: string }) {
  const router = useRouter();
  const [lines, setLines] = React.useState<Line[]>(() =>
    initialVariantId && variants.some((v) => v.variant_id === initialVariantId) ? [{ id: initialVariantId, qty: "" }] : [],
  );
  const [motivo, setMotivo] = React.useState<Motivo>(ENTRADA_REASONS[0].value);
  const [obs, setObs] = React.useState("");
  const [showObs, setShowObs] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [empresa, setEmpresa] = React.useState("");
  const [secao, setSecao] = React.useState("");
  const [overrides, setOverrides] = React.useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<EntradaLoteResult | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");

  const keyRef = React.useRef(newKey());
  const lock = React.useRef(false);
  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const searchRef = React.useRef<HTMLInputElement>(null);

  const byId = React.useMemo(() => new Map(variants.map((v) => [v.variant_id, v])), [variants]);
  const byCode = React.useMemo(() => new Map(variants.map((v) => [v.codigo.toUpperCase(), v])), [variants]);
  const order = React.useMemo(() => new Map(variants.map((v, i) => [v.variant_id, i])), [variants]);
  const stockOf = (v: StockRow) => overrides[v.variant_id] ?? v.estoque;

  const touch = () => {
    keyRef.current = newKey(); // qualquer alteração invalida a chave do envio anterior
    setError(null);
  };

  const tags = React.useMemo(
    () => new Map(variants.map((v) => [v.variant_id, { empresa: empresaDe(v.produto) as string, secao: secaoDe(v.produto) as string }])),
    [variants],
  );
  const filtering = Boolean(empresa || secao);
  const listOpen = Boolean(search.trim()) || filtering;

  /** Resultados agrupados por modelo: todos os tamanhos de cada modelo juntos, sem corte por quantidade de peças. */
  const grupos = React.useMemo<Grupo[]>(() => {
    if (!listOpen) return [];
    const filtrados = filtrarPorTexto(variants, search).filter((v) => {
      const t = tags.get(v.variant_id)!;
      return (!empresa || t.empresa === empresa) && (!secao || t.secao === secao);
    });
    return agruparPorModelo(filtrados);
  }, [listOpen, search, empresa, secao, variants, tags]);
  const gruposVisiveis = grupos.slice(0, MAX_GRUPOS);
  const totalItens = grupos.reduce((s, g) => s + g.itens.length, 0);

  const has = (id: string) => lines.some((l) => l.id === id);

  function toggleItem(id: string) {
    touch();
    setLines((prev) => (prev.some((l) => l.id === id) ? prev.filter((l) => l.id !== id) : [...prev, { id, qty: "" }]));
  }

  function toggleGroup(g: Grupo) {
    touch();
    setLines((prev) => {
      const ids = g.itens.map((v) => v.variant_id);
      const todos = ids.every((id) => prev.some((l) => l.id === id));
      if (todos) return prev.filter((l) => !ids.includes(l.id));
      const tem = new Set(prev.map((l) => l.id));
      return [...prev, ...ids.filter((id) => !tem.has(id)).map((id) => ({ id, qty: "" }))];
    });
  }

  function finishPicking() {
    setSearch("");
    setEmpresa("");
    setSecao("");
    const primeiro = rows.find((r) => r.n < 1);
    if (primeiro) setTimeout(() => inputs.current[primeiro.id]?.focus(), 0);
  }

  function setQty(id: string, value: string) {
    touch();
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty: value.replace(/\D/g, "").slice(0, 7) } : l)));
  }

  function removeLine(id: string) {
    touch();
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  /** Mesma quantidade em todas as peças ainda em branco (ex.: 10 de cada tamanho). */
  function preencherVazias(valor: number) {
    if (valor < 1) return;
    touch();
    setLines((prev) => prev.map((l) => ((parseInt(l.qty || "0", 10) || 0) > 0 ? l : { ...l, qty: String(valor) })));
  }
  const [padrao, setPadrao] = React.useState("");

  // ---- colar lista de códigos
  const parsed = React.useMemo(() => {
    const ok: { v: StockRow; qty: number }[] = [];
    const bad: string[] = [];
    for (const raw of pasteText.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const p = parseLine(raw);
      const v = p ? byCode.get(p.code.toUpperCase()) : undefined;
      if (p && v && p.qty > 0) ok.push({ v, qty: p.qty });
      else bad.push(raw.trim());
    }
    return { ok, bad };
  }, [pasteText, byCode]);

  function applyPaste() {
    if (parsed.ok.length === 0) return;
    touch();
    setLines((prev) => {
      const next = [...prev];
      for (const { v, qty } of parsed.ok) {
        const i = next.findIndex((l) => l.id === v.variant_id);
        if (i >= 0) next[i] = { ...next[i], qty: String((parseInt(next[i].qty || "0", 10) || 0) + qty) };
        else next.push({ id: v.variant_id, qty: String(qty) });
      }
      return next;
    });
    setPasteText(parsed.bad.join("\n"));
    if (parsed.bad.length === 0) setPasteOpen(false);
  }

  // ---- totais
  const rows = lines
    .map((l) => ({ ...l, v: byId.get(l.id)!, n: parseInt(l.qty || "0", 10) || 0 }))
    .filter((l) => l.v)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)); // mesma ordem do catálogo: modelo e tamanhos PP…G5
  const pecas = rows.reduce((s, r) => s + r.n, 0);
  const semQtd = rows.filter((r) => r.n < 1).length;
  const blocker = rows.length === 0 ? "Adicione ao menos uma peça" : semQtd > 0 ? "Preencha a quantidade de todas as peças (ou remova as que não chegaram)" : null;

  async function submit() {
    if (lock.current || blocker) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await registerEntradaLoteAction({
        motivo,
        key: keyRef.current,
        observacao: obs,
        items: rows.map((r) => ({ variantId: r.id, quantidade: r.n })),
      });
      setConfirmOpen(false);
      if (res.ok) {
        setOverrides((o) => ({ ...o, ...Object.fromEntries(res.data.itens.map((i) => [i.variant_id, i.estoque_posterior])) }));
        setResult(res.data);
      } else {
        // as que já entraram saem da lista, para não lançar duas vezes ao tentar de novo
        const feitas = new Set(res.lancadosParcial ?? []);
        if (feitas.size) setLines((prev) => prev.filter((l) => !feitas.has(l.id)));
        setError(res.error);
        keyRef.current = newKey();
      }
    } catch {
      setConfirmOpen(false);
      setError("Falha de conexão. Verifique a rede e confirme novamente — a entrada não será duplicada.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  function reset() {
    keyRef.current = newKey();
    setResult(null);
    setLines([]);
    setMotivo(ENTRADA_REASONS[0].value);
    setObs("");
    setShowObs(false);
    setSearch("");
    setError(null);
    router.refresh();
  }

  // ---------------------------------------------------------------- sucesso
  if (result) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center" role="status" aria-live="polite">
        <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-600" aria-hidden />
        <h2 className="mt-4 text-3xl font-extrabold">Entrada registrada!</h2>
        <p className="mt-4 text-6xl font-extrabold tabular-nums text-emerald-600">
          +{formatNumber(result.lancados > 0 ? result.pecas : 0)}
          <span className="ml-2 text-2xl font-bold text-slate-500">peças</span>
        </p>
        <p className="mt-3 text-xl text-slate-700">
          {formatNumber(result.lancados || result.itens.length)} {(result.lancados || result.itens.length) === 1 ? "item" : "itens"} nesta entrada
        </p>
        {result.repetidos > 0 && result.lancados === 0 && (
          <p className="mt-3 text-sm text-slate-500">Esta entrada já havia sido registrada — nada foi duplicado.</p>
        )}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button size="lg" variant="outline" onClick={reset}>
            Registrar outra entrada
          </Button>
          <Button size="lg" asChild>
            <Link href="/">Voltar ao início</Link>
          </Button>
        </div>
      </Card>
    );
  }

  // ---------------------------------------------------------------- formulário
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-32">
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-extrabold uppercase tracking-wide text-slate-700">Peças que chegaram</h2>
          <Button type="button" variant="outline" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="h-5 w-5" aria-hidden /> Colar lista de códigos
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-500">Empresa</p>
            <div className="flex flex-wrap gap-2">
              {["", ...EMPRESA_CHIPS].map((e) => (
                <FilterChip key={e || "todas"} active={empresa === e} onClick={() => setEmpresa(e)}>
                  {e ? empresaLabel(e) : "Todas"}
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-500">Seção</p>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={secao === ""} onClick={() => setSecao("")}>
                Todas
              </FilterChip>
              {SECOES.map((s) => (
                <FilterChip key={s.value} active={secao === s.value} onClick={() => setSecao(s.value)}>
                  {s.label}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar peça (ex.: camiseta pv mc orbenk azul) — ou escolha empresa e seção acima"
            aria-label="Buscar peça para adicionar"
            autoComplete="off"
            className="h-14 w-full rounded-2xl border-2 border-slate-300 bg-white pl-12 pr-4 text-lg placeholder:text-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
          />
        </div>

        {listOpen && (
          <div className="mt-2 overflow-hidden rounded-2xl border-2 border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-sm text-slate-600">
                <strong>{formatNumber(grupos.length)}</strong> {grupos.length === 1 ? "modelo" : "modelos"} · {formatNumber(totalItens)} peças ·{" "}
                <strong>{formatNumber(grupos.reduce((s, g) => s + g.itens.filter((v) => has(v.variant_id)).length, 0))}</strong> na lista
                {grupos.length > gruposVisiveis.length && <> · mostrando {gruposVisiveis.length} (refine a busca para ver os outros)</>}
              </p>
              <Button type="button" size="sm" onClick={finishPicking}>
                Concluir
              </Button>
            </div>
            <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto" aria-label="Modelos encontrados">
              {gruposVisiveis.length === 0 && <li className="px-4 py-4 text-slate-500">Nenhuma peça encontrada{search.trim() ? <> para “{search}”</> : null}.</li>}
              {gruposVisiveis.map((g) => {
                const marcadas = g.itens.filter((v) => has(v.variant_id)).length;
                const todas = marcadas === g.itens.length;
                return (
                  <li key={g.prefixo} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold">{g.nome}</p>
                        <p className="font-mono text-xs text-slate-500">{g.prefixo}</p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleGroup(g)}>
                        {todas ? <><Trash2 className="h-4 w-4" aria-hidden /> Tirar todos</> : <><Plus className="h-4 w-4" aria-hidden /> Todos os tamanhos ({g.itens.length})</>}
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {g.itens.map((v) => {
                        const on = has(v.variant_id);
                        return (
                          <button
                            key={v.variant_id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleItem(v.variant_id)}
                            title={`${v.codigo} · ${formatNumber(stockOf(v))} em estoque`}
                            className={cn(
                              "min-h-14 min-w-16 rounded-xl border-2 px-3 py-1 text-center transition-colors active:scale-95",
                              on ? "border-brand bg-brand text-black" : "border-slate-300 bg-white text-slate-800 hover:border-brand hover:bg-orange-50",
                            )}
                          >
                            <span className="flex items-center justify-center gap-1 text-base font-extrabold leading-tight">
                              {on && <Check className="h-4 w-4" aria-hidden />}
                              {tamanhoDe(v, g.nome)}
                            </span>
                            <span className={cn("block text-xs font-semibold tabular-nums", on ? "opacity-80" : "text-slate-500")}>{formatNumber(stockOf(v))} un.</span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 py-10 text-center text-slate-500">
            Nenhuma peça ainda. Busque acima, toque nos tamanhos que chegaram ou cole uma lista de códigos.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50 p-3">
              <div>
                <label htmlFor="padrao" className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-slate-500">Mesma quantidade nas que estão em branco</label>
                <div className="flex gap-2">
                  <input
                    id="padrao"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={padrao}
                    placeholder="ex.: 10"
                    onChange={(e) => setPadrao(e.target.value.replace(/\D/g, "").slice(0, 7))}
                    className="h-11 w-28 rounded-xl border-2 border-slate-300 bg-white px-3 text-right text-lg font-bold tabular-nums focus-visible:border-brand focus-visible:outline-none"
                  />
                  <Button type="button" variant="outline" disabled={!(parseInt(padrao || "0", 10) > 0)} onClick={() => preencherVazias(parseInt(padrao, 10))}>
                    Preencher
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="ml-auto text-red-700"
                onClick={() => {
                  touch();
                  setLines([]);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Limpar lista
              </Button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">Peça</th>
                    <th className="px-3 py-3 text-right">Estoque</th>
                    <th className="px-3 py-3 text-right">Chegou</th>
                    <th className="px-3 py-3" aria-label="Remover" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, idx) => (
                    <tr key={r.id} className={cn(r.n > 0 && "bg-emerald-50/50")}>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold">{r.v.produto}</span>
                        <span className="block font-mono text-xs text-slate-400">{r.v.codigo}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-lg font-bold tabular-nums">{formatNumber(stockOf(r.v))}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          ref={(el) => {
                            inputs.current[r.id] = el;
                          }}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          aria-label={`Quantidade que chegou de ${r.v.produto}`}
                          value={r.qty}
                          placeholder="0"
                          onChange={(e) => setQty(r.id, e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const prox = rows[idx + 1];
                            if (prox) inputs.current[prox.id]?.focus();
                            else searchRef.current?.focus();
                          }}
                          className="h-12 w-28 rounded-xl border-2 border-slate-300 bg-white px-3 text-right text-xl font-bold tabular-nums focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(r.id)}
                          aria-label={`Remover ${r.v.produto}`}
                          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-extrabold uppercase tracking-wide text-slate-700">Motivo</h2>
        <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-3">
          {ENTRADA_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={motivo === r.value}
              onClick={() => {
                touch();
                setMotivo(r.value);
              }}
              className={cn(
                "min-h-14 min-w-16 rounded-2xl border-2 px-5 text-lg font-bold transition-colors active:scale-95",
                motivo === r.value ? "border-brand bg-brand text-black" : "border-slate-300 bg-white text-slate-800 hover:border-brand hover:bg-orange-50",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {showObs ? (
            <>
              <label htmlFor="obs" className="mb-1.5 block text-sm font-bold text-slate-700">Observação (opcional, vale para todas as peças)</label>
              <Textarea id="obs" value={obs} maxLength={500} onChange={(e) => { touch(); setObs(e.target.value); }} className="min-h-20" />
            </>
          ) : (
            <button type="button" onClick={() => setShowObs(true)} className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
              <ChevronDown className="h-4 w-4" aria-hidden /> Adicionar observação
            </button>
          )}
        </div>
      </Card>

      {/* barra fixa */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-black bg-white/95 backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            {error && (
              <p role="alert" className="mb-1 flex items-center gap-2 text-sm font-bold text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              </p>
            )}
            <p className="text-lg font-extrabold tabular-nums">
              {formatNumber(rows.length)} {rows.length === 1 ? "peça" : "peças diferentes"} · {formatNumber(pecas)} un.
            </p>
            {blocker && rows.length > 0 && <p className="text-sm text-slate-500">{blocker}</p>}
          </div>
          <Button type="button" size="xl" variant="entrada" disabled={!!blocker || pending} loading={pending} onClick={() => setConfirmOpen(true)}>
            REVISAR ENTRADA
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirmar entrada?</DialogTitle>
            <DialogDescription>
              Motivo: <strong>{ENTRADA_REASONS.find((r) => r.value === motivo)?.label}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-2xl bg-slate-50">
            <ul className="divide-y divide-slate-200">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 truncate font-semibold">{r.v.produto}</span>
                  <span className="shrink-0 font-extrabold tabular-nums text-emerald-700">+{formatNumber(r.n)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-lg font-bold">
            {formatNumber(rows.length)} {rows.length === 1 ? "item" : "itens"} · {formatNumber(pecas)} peças
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Voltar
            </Button>
            <Button type="button" size="lg" variant="entrada" loading={pending} onClick={submit}>
              CONFIRMAR ENTRADA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Colar lista de códigos</DialogTitle>
            <DialogDescription>Uma peça por linha: código e quantidade. Ex.: <code>100.301.00 20</code> (também vale tab, ; ou x entre os dois).</DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"420.003.16 20\n420.003.17 15\n420.003.18 8"}
            className="min-h-48 font-mono"
            autoFocus
          />
          {pasteText.trim() && (
            <div className="mt-3 text-sm">
              <p className="font-semibold text-emerald-700">{formatNumber(parsed.ok.length)} linhas reconhecidas</p>
              {parsed.bad.length > 0 && (
                <div role="alert" className="mt-1 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-red-800">
                  <p className="font-bold">{formatNumber(parsed.bad.length)} linhas não reconhecidas (código inexistente ou formato errado):</p>
                  <ul className="mt-1 max-h-24 overflow-y-auto font-mono text-xs">
                    {parsed.bad.slice(0, 10).map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={() => setPasteOpen(false)}>Fechar</Button>
            <Button type="button" size="lg" disabled={parsed.ok.length === 0} onClick={applyPaste}>
              Adicionar à lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
