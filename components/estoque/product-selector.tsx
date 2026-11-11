"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { categoryLabel } from "@/lib/constants";
import { agruparPorModelo, filtrarPorTexto, tamanhoDe } from "@/lib/modelos";
import { cn, formatNumber } from "@/lib/utils";
import type { StockRow } from "@/types";

export type ProductOption = { id: string; nome: string; codigo: string; categoria: string; variants: StockRow[] };

export function groupProducts(variants: StockRow[]): ProductOption[] {
  const map = new Map<string, ProductOption>();
  for (const v of variants) {
    const cur = map.get(v.product_id) ?? { id: v.product_id, nome: v.produto, codigo: v.codigo, categoria: v.categoria, variants: [] };
    cur.variants.push(v);
    map.set(v.product_id, cur);
  }
  return [...map.values()]; // já vem ordenado pelo banco (modelo e depois tamanho: PP, P, M, G, GG…)
}

/** Cada tamanho é um produto próprio no catálogo: a lista mostra o MODELO com todos os tamanhos juntos. */
const MAX_MODELOS = 30;

/**
 * Busca de uma peça (Saída): digite o nome (ou código), veja os modelos encontrados e toque no tamanho.
 * Com o campo vazio só mostra a lista se o catálogo for pequeno.
 */
export function ProductSelector({
  products,
  value,
  onChange,
  onPickVariant,
}: {
  products: ProductOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Escolheu um tamanho/variação específico na lista de modelos. */
  onPickVariant?: (v: StockRow) => void;
}) {
  const [q, setQ] = React.useState("");
  const selected = products.find((p) => p.id === value) ?? null;
  const todas = React.useMemo(() => products.flatMap((p) => p.variants), [products]);

  const grupos = React.useMemo(() => {
    if (!q.trim()) return products.length <= 12 ? agruparPorModelo(todas) : [];
    return agruparPorModelo(filtrarPorTexto(todas, q));
  }, [q, products, todas]);
  const visiveis = grupos.slice(0, MAX_MODELOS);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-brand bg-orange-50 p-4">
        <Check className="h-6 w-6 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold text-slate-900">{selected.nome}</p>
          <p className="text-sm text-slate-600">
            {selected.codigo} · {categoryLabel(selected.categoria)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQ("");
          }}
          className="flex h-11 items-center gap-1 rounded-xl border-2 border-slate-300 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-100"
        >
          <X className="h-4 w-4" aria-hidden /> Trocar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Digite o produto (ex.: camiseta pv mc orbenk azul)"
          aria-label="Buscar produto"
          autoComplete="off"
          className="h-14 w-full rounded-2xl border-2 border-slate-300 bg-white pl-12 pr-4 text-lg placeholder:text-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
        />
      </div>
      {q.trim() && grupos.length > 0 && (
        <p className="mt-2 text-sm text-slate-600">
          <strong>{formatNumber(grupos.length)}</strong> {grupos.length === 1 ? "modelo encontrado" : "modelos encontrados"}
          {grupos.length > visiveis.length && <> · mostrando {visiveis.length} (digite mais palavras para refinar)</>}
        </p>
      )}
      <ul className="mt-2 grid max-h-[34rem] gap-2 overflow-y-auto" aria-label="Modelos encontrados">
        {visiveis.map((g) => (
          <li key={g.prefixo} className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-3">
            <p className="text-lg font-bold text-slate-900">{g.nome}</p>
            <p className="font-mono text-xs text-slate-500">{g.prefixo}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {g.itens.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  title={`${v.codigo} · ${formatNumber(v.estoque)} em estoque`}
                  onClick={() => (onPickVariant ? onPickVariant(v) : onChange(v.product_id))}
                  className={cn(
                    "min-h-14 min-w-16 rounded-xl border-2 border-slate-300 bg-white px-3 py-1 text-center transition-colors hover:border-brand hover:bg-orange-50 active:scale-95",
                  )}
                >
                  <span className="block text-base font-extrabold leading-tight">{tamanhoDe(v, g.nome)}</span>
                  <span className={cn("block text-xs font-semibold tabular-nums", v.estoque > 0 ? "text-slate-500" : "text-red-600")}>{formatNumber(v.estoque)} un.</span>
                </button>
              ))}
            </div>
          </li>
        ))}
        {visiveis.length === 0 && (
          <li className="px-2 py-4 text-slate-500">
            {q.trim() ? `Nenhum produto encontrado para “${q}”.` : "Digite o nome ou o código do produto para buscar."}
          </li>
        )}
      </ul>
    </div>
  );
}
