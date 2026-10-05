"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { LoadingState } from "@/components/shared/states";
import { registerInitialCountAction } from "@/app/actions/movements";
import { CATEGORIES } from "@/lib/constants";
import { cn, formatBRL, formatNumber, newKey, variantLabel } from "@/lib/utils";
import type { StockRow } from "@/types";

const DRAFT_KEY = "estoque-bia:contagem-inicial:v1";
const PAGE_ROWS = 200;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function readDraft(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeDraft(draft: Record<string, string>) {
  try {
    const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v));
    if (Object.keys(clean).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(clean));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // sem armazenamento local: a contagem continua funcionando, só não guarda rascunho
  }
}

/** O rascunho vem do navegador; só renderiza depois da hidratação para não divergir do servidor. */
export function CountTable({ variants }: { variants: StockRow[] }) {
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <LoadingState label="Carregando itens…" />;
  return <CountTableInner variants={variants} />;
}

function CountTableInner({ variants }: { variants: StockRow[] }) {
  const router = useRouter();
  const [qty, setQty] = React.useState<Record<string, string>>(() => {
    const known = new Set(variants.map((v) => v.variant_id));
    return Object.fromEntries(Object.entries(readDraft()).filter(([id]) => known.has(id)));
  });
  const [search, setSearch] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [mode, setMode] = React.useState<"pendentes" | "todos">("pendentes");
  const [unlocked, setUnlocked] = React.useState<Set<string>>(new Set());
  const [limit, setLimit] = React.useState(PAGE_ROWS);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const keyRef = React.useRef(newKey());
  const lock = React.useRef(false);
  const tableRef = React.useRef<HTMLTableElement>(null);

  const byId = React.useMemo(() => new Map(variants.map((v) => [v.variant_id, v])), [variants]);

  const setValue = (id: string, value: string) => {
    keyRef.current = newKey(); // qualquer alteração invalida a chave do lote anterior
    setError(null);
    setQty((prev) => {
      const next = { ...prev, [id]: value.replace(/\D/g, "").slice(0, 7) };
      writeDraft(next);
      return next;
    });
  };

  const rows = React.useMemo(() => {
    const tokens = norm(search.trim()).split(/\s+/).filter(Boolean);
    return variants.filter((v) => {
      if (categoria && v.categoria !== categoria) return false;
      const counted = v.estoque > 0 && !unlocked.has(v.variant_id);
      if (mode === "pendentes" && counted && !qty[v.variant_id]) return false;
      if (tokens.length === 0) return true;
      const hay = norm(`${v.produto} ${v.codigo} ${v.sku}`);
      return tokens.every((t) => hay.includes(t));
    });
  }, [variants, search, categoria, mode, unlocked, qty]);

  const entries = Object.entries(qty)
    .map(([id, q]) => ({ id, n: parseInt(q || "0", 10) || 0 }))
    .filter((e) => e.n > 0 && byId.has(e.id));
  const pecas = entries.reduce((s, e) => s + e.n, 0);
  const valor = entries.reduce((s, e) => s + e.n * Number(byId.get(e.id)!.valor_unitario ?? 0), 0);
  const jaTinham = entries.filter((e) => byId.get(e.id)!.estoque > 0).length;
  const total = variants.length;
  const contados = variants.filter((v) => v.estoque > 0).length;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(tableRef.current?.querySelectorAll<HTMLInputElement>("input[data-count]:not(:disabled)") ?? []);
    const i = inputs.indexOf(e.currentTarget);
    (inputs[i + 1] ?? inputs[i])?.focus();
  }

  async function submit() {
    if (lock.current || entries.length === 0) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await registerInitialCountAction({
        key: keyRef.current,
        items: entries.map((e) => ({ variantId: e.id, quantidade: e.n })),
      });
      setConfirmOpen(false);
      if (res.ok) {
        toast.success(`Contagem lançada: ${formatNumber(res.data.lancados)} itens, ${formatNumber(res.data.pecas)} peças (${formatBRL(res.data.valor)}).`);
        setQty({});
        writeDraft({});
        setUnlocked(new Set());
        keyRef.current = newKey();
        router.refresh();
      } else {
        setError(res.error);
        keyRef.current = newKey();
      }
    } catch {
      setConfirmOpen(false);
      setError("Falha de conexão. Verifique a rede e tente lançar novamente — nada será duplicado.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  const shown = rows.slice(0, limit);

  return (
    <div className="pb-32">
      <Card className="overflow-hidden">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="c-busca" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Buscar item</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input id="c-busca" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE_ROWS); }} placeholder="Nome ou código (ex.: avental oxford)" className="pl-11" />
            </div>
          </div>
          <div>
            <label htmlFor="c-cat" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Categoria</label>
            <Select id="c-cat" value={categoria} onChange={(e) => { setCategoria(e.target.value); setLimit(PAGE_ROWS); }}>
              <option value="">Todas</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="c-modo" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Mostrar</label>
            <Select id="c-modo" value={mode} onChange={(e) => { setMode(e.target.value as "pendentes" | "todos"); setLimit(PAGE_ROWS); }}>
              <option value="pendentes">Só os que ainda não contei</option>
              <option value="todos">Todos os itens</option>
            </Select>
          </div>
        </div>

        <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          <strong>{formatNumber(contados)}</strong> de {formatNumber(total)} itens já têm estoque · {formatNumber(rows.length)} na lista
          {entries.length > 0 && <> · rascunho salvo neste aparelho</>}
        </p>

        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-slate-200 bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
                <th className="hidden px-4 py-3 md:table-cell">Código</th>
                <th className="px-4 py-3">Produto</th>
                <th className="hidden px-4 py-3 text-right lg:table-cell">Valor unit.</th>
                <th className="px-4 py-3 text-right">Já tem</th>
                <th className="px-4 py-3 text-right">Quantidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((v) => {
                const locked = v.estoque > 0 && !unlocked.has(v.variant_id);
                const value = qty[v.variant_id] ?? "";
                return (
                  <tr key={v.variant_id} className={cn("hover:bg-slate-50", value && "bg-orange-50")}>
                    <td className="hidden px-4 py-2.5 font-mono text-sm md:table-cell">{v.codigo}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold">{v.produto}</span>
                      {variantLabel(v.cor, v.tamanho) && <span className="ml-2 text-sm text-slate-500">{variantLabel(v.cor, v.tamanho)}</span>}
                      <span className="block font-mono text-xs text-slate-400 md:hidden">{v.codigo}</span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums lg:table-cell">{formatBRL(v.valor_unitario)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {v.estoque > 0 ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" aria-hidden /> {formatNumber(v.estoque)}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {locked ? (
                        <button
                          type="button"
                          onClick={() => setUnlocked((s) => new Set(s).add(v.variant_id))}
                          className="h-11 rounded-xl border-2 border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Somar mais
                        </button>
                      ) : (
                        <input
                          data-count
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          aria-label={`Quantidade de ${v.produto}`}
                          value={value}
                          placeholder="0"
                          onChange={(e) => setValue(v.variant_id, e.target.value)}
                          onKeyDown={onKeyDown}
                          onFocus={(e) => e.currentTarget.select()}
                          className="h-12 w-28 rounded-xl border-2 border-slate-300 bg-white px-3 text-right text-xl font-bold tabular-nums focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center text-slate-500">
                    Nenhum item na lista. {mode === "pendentes" && "Troque “Mostrar” para “Todos os itens” para ver os que já foram contados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > shown.length && (
          <div className="border-t border-slate-200 p-4 text-center">
            <Button type="button" variant="outline" onClick={() => setLimit((l) => l + PAGE_ROWS)}>
              Mostrar mais {Math.min(PAGE_ROWS, rows.length - shown.length)} (restam {formatNumber(rows.length - shown.length)})
            </Button>
          </div>
        )}
      </Card>

      {/* barra fixa com o resumo do que foi digitado */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-black bg-white/95 backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            {error && (
              <p role="alert" className="mb-1 flex items-center gap-2 text-sm font-bold text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              </p>
            )}
            <p className="text-lg font-extrabold tabular-nums">
              {formatNumber(entries.length)} {entries.length === 1 ? "item" : "itens"} · {formatNumber(pecas)} peças · {formatBRL(valor)}
            </p>
          </div>
          <div className="flex gap-2">
            {entries.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  if (window.confirm("Descartar tudo o que foi digitado (ainda não lançado)?")) {
                    keyRef.current = newKey();
                    setQty({});
                    writeDraft({});
                  }
                }}
              >
                <Trash2 className="h-5 w-5" aria-hidden /> Limpar
              </Button>
            )}
            <Button type="button" size="lg" disabled={entries.length === 0 || pending} onClick={() => setConfirmOpen(true)}>
              LANÇAR CONTAGEM
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Lançar contagem inicial?"
        description="Cada item preenchido vira uma entrada com o motivo “Contagem inicial”. O histórico não pode ser apagado; erros são corrigidos depois em Movimentações."
        confirmLabel="LANÇAR AGORA"
        loading={pending}
        onConfirm={submit}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl bg-slate-50 p-4 text-lg">
          <dt className="text-slate-500">Itens</dt><dd className="font-extrabold tabular-nums">{formatNumber(entries.length)}</dd>
          <dt className="text-slate-500">Peças</dt><dd className="font-extrabold tabular-nums">{formatNumber(pecas)}</dd>
          <dt className="text-slate-500">Valor</dt><dd className="font-extrabold tabular-nums">{formatBRL(valor)}</dd>
        </dl>
        {jaTinham > 0 && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {formatNumber(jaTinham)} {jaTinham === 1 ? "item já tem" : "itens já têm"} estoque: a quantidade digitada será SOMADA ao que existe.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
