"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { registerOcExitAction, type OcExitResult } from "@/app/actions/movements";
import { cn, formatNumber, newKey, normalizeOc, variantLabel } from "@/lib/utils";
import type { StockRow } from "@/types";

type Line = { id: string; qty: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "100.301.00 20" / "100.301.00;20" / "100.301.00<TAB>20" / "100.301.00 x 20" → {code, qty} */
function parseLine(line: string): { code: string; qty: number } | null {
  const m = line.trim().match(/^([0-9][0-9.\-]*)\s*(?:[;\t,:]|x|×|\s)\s*(\d{1,7})$/i);
  return m ? { code: m[1], qty: parseInt(m[2], 10) } : null;
}

export function OcExitForm({ variants, isAdmin }: { variants: StockRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [oc, setOc] = React.useState("");
  const [obs, setObs] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [search, setSearch] = React.useState("");
  const [overrides, setOverrides] = React.useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ocError, setOcError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<OcExitResult | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");

  const keyRef = React.useRef(newKey());
  const lock = React.useRef(false);
  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const searchRef = React.useRef<HTMLInputElement>(null);

  const byId = React.useMemo(() => new Map(variants.map((v) => [v.variant_id, v])), [variants]);
  const byCode = React.useMemo(() => new Map(variants.map((v) => [v.codigo.toUpperCase(), v])), [variants]);
  const stockOf = (v: StockRow) => overrides[v.variant_id] ?? v.estoque;

  const touch = () => {
    keyRef.current = newKey(); // qualquer alteração invalida a chave do envio anterior
    setError(null);
  };

  const matches = React.useMemo(() => {
    const tokens = norm(search.trim()).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return variants
      .filter((v) => {
        const hay = norm(`${v.produto} ${v.codigo} ${v.sku}`);
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 8);
  }, [search, variants]);

  function focusQty(id: string) {
    setTimeout(() => {
      inputs.current[id]?.focus();
      inputs.current[id]?.select();
    }, 0);
  }

  function addItem(id: string) {
    touch();
    setLines((prev) => (prev.some((l) => l.id === id) ? prev : [...prev, { id, qty: "" }]));
    setSearch("");
    focusQty(id);
  }

  function setQty(id: string, value: string) {
    touch();
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty: value.replace(/\D/g, "").slice(0, 7) } : l)));
  }

  function removeLine(id: string) {
    touch();
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

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
    // mantém só as linhas que não foram reconhecidas, para o usuário corrigir
    setPasteText(parsed.bad.join("\n"));
    if (parsed.bad.length === 0) setPasteOpen(false);
  }

  // ---- totais e conferência
  const ocClean = normalizeOc(oc);
  const rows = lines
    .map((l) => ({ ...l, v: byId.get(l.id)!, n: parseInt(l.qty || "0", 10) || 0 }))
    .filter((l) => l.v);
  const pecas = rows.reduce((s, r) => s + r.n, 0);
  const semQtd = rows.filter((r) => r.n < 1).length;
  const faltando = rows.filter((r) => r.n > stockOf(r.v));
  const blocker =
    !ocClean ? "Informe o número da OC" : rows.length === 0 ? "Adicione ao menos uma peça" : semQtd > 0 ? "Preencha a quantidade de todas as peças" : faltando.length > 0 ? "Há peças sem estoque suficiente" : null;

  async function submit() {
    if (lock.current || blocker) return;
    lock.current = true;
    setPending(true);
    setError(null);
    setOcError(null);
    try {
      const res = await registerOcExitAction({
        oc,
        key: keyRef.current,
        observacao: obs,
        items: rows.map((r) => ({ variantId: r.id, quantidade: r.n })),
      });
      setConfirmOpen(false);
      if (res.ok) {
        setResult(res.data);
      } else {
        if (res.fieldErrors?.oc) setOcError(res.fieldErrors.oc);
        const itens = (res.detail as { itens?: { variant_id: string; disponivel: number }[] } | undefined)?.itens;
        if (itens) setOverrides((o) => ({ ...o, ...Object.fromEntries(itens.map((i) => [i.variant_id, i.disponivel])) }));
        setError(res.error);
        keyRef.current = newKey();
      }
    } catch {
      setConfirmOpen(false);
      setError("Falha de conexão. Verifique a rede e confirme novamente — a saída não será duplicada.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  function reset() {
    keyRef.current = newKey();
    setResult(null);
    setLines([]);
    setOc("");
    setObs("");
    setSearch("");
    setError(null);
    setOcError(null);
    router.refresh();
  }

  // ---------------------------------------------------------------- sucesso
  if (result) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center" role="status" aria-live="polite">
        <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-600" aria-hidden />
        <h2 className="mt-4 text-3xl font-extrabold">Saída registrada!</h2>
        <p className="mt-2 text-2xl font-bold">OC {result.oc}</p>
        <p className="mt-4 text-6xl font-extrabold tabular-nums text-rose-600">
          −{formatNumber(result.pecas)}
          <span className="ml-2 text-2xl font-bold text-slate-500">peças</span>
        </p>
        <p className="mt-3 text-xl text-slate-700">
          {formatNumber(result.lancados || result.itens.length)} {(result.lancados || result.itens.length) === 1 ? "item" : "itens"} nesta saída
        </p>
        {result.repetidos > 0 && result.lancados === 0 && (
          <p className="mt-3 text-sm text-slate-500">Esta saída já havia sido registrada — nada foi duplicado.</p>
        )}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button size="lg" variant="outline" onClick={reset}>
            Nova saída por OC
          </Button>
          {isAdmin ? (
            <Button size="lg" asChild>
              <Link href={`/ocs/${encodeURIComponent(result.oc)}`}>Ver a OC {result.oc}</Link>
            </Button>
          ) : (
            <Button size="lg" asChild>
              <Link href="/">Voltar ao início</Link>
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // ---------------------------------------------------------------- formulário
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-32">
      <Card className="p-5">
        <label htmlFor="oc" className="mb-1.5 block text-sm font-extrabold uppercase tracking-wide text-slate-700">
          Número da OC <span className="text-red-600">*</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="flex h-16 items-center rounded-2xl bg-slate-900 px-5 text-2xl font-extrabold text-white">OC</span>
          <Input
            id="oc"
            value={oc}
            onChange={(e) => {
              touch();
              setOcError(null);
              setOc(e.target.value.replace(/^\s*oc[\s._-]*/i, "").toUpperCase());
            }}
            placeholder="22"
            autoComplete="off"
            maxLength={20}
            aria-invalid={!!ocError || undefined}
            className="h-16 text-2xl font-bold"
          />
        </div>
        {ocError && <p className="mt-1 text-sm font-medium text-red-600">{ocError}</p>}
        <p className="mt-1 text-sm text-slate-500">Todas as peças abaixo saem para esta OC.</p>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-extrabold uppercase tracking-wide text-slate-700">Peças da OC</h2>
          <Button type="button" variant="outline" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="h-5 w-5" aria-hidden /> Colar lista de códigos
          </Button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                addItem(matches[0].variant_id);
              }
            }}
            placeholder="Buscar peça para adicionar (nome ou código) — Enter adiciona a primeira"
            aria-label="Buscar peça para adicionar"
            autoComplete="off"
            className="h-14 w-full rounded-2xl border-2 border-slate-300 bg-white pl-12 pr-4 text-lg placeholder:text-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
          />
        </div>
        {search.trim() && (
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border-2 border-slate-200" role="listbox" aria-label="Peças encontradas">
            {matches.length === 0 && <li className="px-4 py-4 text-slate-500">Nenhuma peça encontrada para “{search}”.</li>}
            {matches.map((v) => {
              const jaTem = lines.some((l) => l.id === v.variant_id);
              return (
                <li key={v.variant_id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => addItem(v.variant_id)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-orange-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold">
                        {v.produto}
                        {variantLabel(v.cor, v.tamanho) && <span className="ml-2 font-normal text-slate-500">{variantLabel(v.cor, v.tamanho)}</span>}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{v.codigo}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className={cn("font-bold tabular-nums", stockOf(v) === 0 ? "text-red-600" : "text-slate-700")}>{formatNumber(stockOf(v))} em estoque</span>
                      {jaTem && <span className="block text-xs font-semibold text-orange-700">já na lista</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 py-10 text-center text-slate-500">
            Nenhuma peça ainda. Busque acima ou cole uma lista de códigos.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Peça</th>
                  <th className="px-3 py-3 text-right">Estoque</th>
                  <th className="px-3 py-3 text-right">Quantidade</th>
                  <th className="px-3 py-3" aria-label="Remover" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const falta = r.n - stockOf(r.v);
                  return (
                    <tr key={r.id} className={cn(falta > 0 && "bg-red-50")}>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold">{r.v.produto}</span>
                        {variantLabel(r.v.cor, r.v.tamanho) && <span className="ml-2 text-sm text-slate-500">{variantLabel(r.v.cor, r.v.tamanho)}</span>}
                        <span className="block font-mono text-xs text-slate-400">{r.v.codigo}</span>
                        {falta > 0 && (
                          <span role="alert" className="mt-1 flex items-center gap-1 text-sm font-bold text-red-700">
                            <AlertTriangle className="h-4 w-4" aria-hidden /> Estoque insuficiente — faltam {formatNumber(falta)}
                          </span>
                        )}
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
                          aria-label={`Quantidade de ${r.v.produto}`}
                          value={r.qty}
                          placeholder="0"
                          aria-invalid={falta > 0 || undefined}
                          onChange={(e) => setQty(r.id, e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              searchRef.current?.focus();
                            }
                          }}
                          className={cn(
                            "h-12 w-28 rounded-xl border-2 bg-white px-3 text-right text-xl font-bold tabular-nums focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
                            falta > 0 ? "border-red-500" : "border-slate-300",
                          )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <label htmlFor="obs" className="mb-1.5 block text-sm font-bold text-slate-700">Observação (opcional)</label>
        <Textarea id="obs" value={obs} maxLength={500} onChange={(e) => { touch(); setObs(e.target.value); }} className="min-h-20" />
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
              {ocClean ? `OC ${ocClean} · ` : ""}
              {formatNumber(rows.length)} {rows.length === 1 ? "peça" : "peças diferentes"} · {formatNumber(pecas)} un.
            </p>
            {blocker && rows.length + oc.length > 0 && <p className="text-sm text-slate-500">{blocker}</p>}
          </div>
          <Button type="button" size="lg" variant="saida" disabled={!!blocker || pending} onClick={() => setConfirmOpen(true)}>
            REVISAR SAÍDA
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Confirmar saída para a OC ${ocClean}?`}
        confirmLabel="CONFIRMAR SAÍDA"
        variant="saida"
        loading={pending}
        onConfirm={submit}
      >
        <div className="max-h-72 overflow-y-auto rounded-2xl bg-slate-50">
          <ul className="divide-y divide-slate-200">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate font-semibold">{r.v.produto} {variantLabel(r.v.cor, r.v.tamanho)}</span>
                <span className="shrink-0 font-extrabold tabular-nums text-rose-600">−{formatNumber(r.n)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-lg font-bold">
          {formatNumber(rows.length)} {rows.length === 1 ? "item" : "itens"} · {formatNumber(pecas)} peças
        </p>
      </ConfirmDialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Colar lista de códigos</DialogTitle>
            <DialogDescription>Uma peça por linha: código e quantidade. Ex.: <code>100.301.00 20</code> (também vale tab, ; ou x entre os dois).</DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"100.301.00 20\n100.302.00 15\n260.302.04 8"}
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
