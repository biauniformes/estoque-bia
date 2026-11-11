import { variantLabel } from "@/lib/utils";
import type { StockRow } from "@/types";

/**
 * No catálogo cada tamanho é um produto próprio (NNN.NNN.SS). Para a busca, os tamanhos do mesmo
 * modelo ficam juntos: o modelo é identificado pelo "NNN.NNN" do código.
 */
export type GrupoModelo = { prefixo: string; nome: string; itens: StockRow[] };

export const prefixoDe = (codigo: string) => codigo.split(".").slice(0, 2).join(".");

export const normBusca = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Rótulo curto do tamanho: o que sobra do nome depois do nome-base ("… AZUL PP" → "PP"). */
export function tamanhoDe(v: StockRow, base: string) {
  const resto = v.produto.startsWith(base) ? v.produto.slice(base.length).trim() : v.produto;
  return resto || variantLabel(v.cor, v.tamanho) || "Único";
}

/** Agrupa por modelo mantendo a ordem recebida (o banco já ordena por modelo e tamanho). */
export function agruparPorModelo(itens: StockRow[]): GrupoModelo[] {
  const map = new Map<string, GrupoModelo>();
  for (const v of itens) {
    const p = prefixoDe(v.codigo);
    const g = map.get(p) ?? { prefixo: p, nome: v.nome_base || v.produto, itens: [] };
    g.itens.push(v);
    map.set(p, g);
  }
  return [...map.values()];
}

/** Itens que contêm TODAS as palavras digitadas (nome, código ou SKU, sem acento). */
export function filtrarPorTexto(itens: StockRow[], texto: string) {
  const tokens = normBusca(texto.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return itens;
  return itens.filter((v) => {
    const hay = normBusca(`${v.produto} ${v.codigo} ${v.sku}`);
    return tokens.every((t) => hay.includes(t));
  });
}
