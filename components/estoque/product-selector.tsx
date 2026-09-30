"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { categoryLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { StockRow } from "@/types";

export type ProductOption = { id: string; nome: string; codigo: string; categoria: string; variants: StockRow[] };

export function groupProducts(variants: StockRow[]): ProductOption[] {
  const map = new Map<string, ProductOption>();
  for (const v of variants) {
    const cur = map.get(v.product_id) ?? { id: v.product_id, nome: v.produto, codigo: v.codigo, categoria: v.categoria, variants: [] };
    cur.variants.push(v);
    map.set(v.product_id, cur);
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca com autocomplete ("jaqueta" → Jaqueta Operacional). Com o campo vazio lista os produtos para toque rápido. */
export function ProductSelector({
  products,
  value,
  onChange,
}: {
  products: ProductOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [q, setQ] = React.useState("");
  const selected = products.find((p) => p.id === value) ?? null;

  const matches = React.useMemo(() => {
    const t = norm(q.trim());
    if (!t) return products.slice(0, 8);
    return products
      .filter((p) => norm(`${p.nome} ${p.codigo} ${categoryLabel(p.categoria)}`).includes(t) || p.variants.some((v) => norm(v.sku).includes(t)))
      .slice(0, 8);
  }, [q, products]);

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
          placeholder="Digite o produto (ex.: jaqueta)"
          aria-label="Buscar produto"
          autoComplete="off"
          className="h-14 w-full rounded-2xl border-2 border-slate-300 bg-white pl-12 pr-4 text-lg placeholder:text-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
        />
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2" role="listbox" aria-label="Produtos encontrados">
        {matches.map((p) => (
          <li key={p.id} role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => onChange(p.id)}
              className={cn(
                "flex min-h-16 w-full flex-col justify-center rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-left hover:border-brand hover:bg-orange-50 active:scale-[0.99]",
              )}
            >
              <span className="text-lg font-bold text-slate-900">{p.nome}</span>
              <span className="text-sm text-slate-500">
                {p.codigo} · {p.variants.length} {p.variants.length === 1 ? "variação" : "variações"}
              </span>
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="px-2 py-4 text-slate-500 sm:col-span-2">Nenhum produto encontrado para “{q}”.</li>}
      </ul>
    </div>
  );
}
