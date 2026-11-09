/**
 * Empresas (clientes/marcas) que aparecem no NOME dos itens da lista de preços.
 * Para incluir outra empresa nos relatórios, acrescente o nome aqui (em maiúsculas, sem acento).
 *
 * A ORDEM importa: um item com duas empresas no nome fica com a PRIMEIRA desta lista
 * (ex.: "… KINDERFULL SEPAT" conta como KINDERFULL, não como SEPAT).
 */
export const EMPRESAS = ["ORBENK", "KINDERFULL", "SEPAT", "PROFISER", "BREITKOPF", "GLOBALSEG"] as const;
export type Empresa = (typeof EMPRESAS)[number];

/** Trecho procurado no nome quando difere do nome da empresa (a lista de preços às vezes escreve "KINDERFUL"). */
const TERMO: Partial<Record<Empresa, string>> = { KINDERFULL: "KINDERFUL" };
const termo = (e: Empresa) => TERMO[e] ?? e;

/** Itens que não têm nenhuma empresa no nome (genéricos). */
export const SEM_EMPRESA = "SEM" as const;
export type FiltroEmpresa = Empresa | typeof SEM_EMPRESA | "";

export const empresaLabel = (e: string) => (e === SEM_EMPRESA ? "Sem empresa" : e);

export function parseEmpresa(v: string | null | undefined): FiltroEmpresa {
  const u = (v ?? "").trim().toUpperCase();
  if (u === SEM_EMPRESA) return SEM_EMPRESA;
  return (EMPRESAS as readonly string[]).includes(u) ? (u as Empresa) : "";
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Empresa do item (primeira da lista que aparece no nome) ou "SEM". */
export function empresaDe(nome: string): Empresa | typeof SEM_EMPRESA {
  const n = semAcento(nome);
  return EMPRESAS.find((e) => n.includes(termo(e))) ?? SEM_EMPRESA;
}

export function combinaEmpresa(nome: string, filtro: FiltroEmpresa) {
  if (!filtro) return true;
  return empresaDe(nome) === filtro;
}

/**
 * Aplica o filtro de empresa a uma consulta (coluna `produto`), com a mesma regra de `empresaDe`:
 * contém o nome da empresa e NÃO contém nenhuma empresa que vem antes na lista.
 */
export function applyEmpresa<Q extends { ilike: (c: string, p: string) => Q; not: (c: string, op: string, v: string) => Q }>(
  query: Q,
  filtro: FiltroEmpresa,
  coluna = "produto",
): Q {
  if (!filtro) return query;
  let q = query;
  if (filtro === SEM_EMPRESA) {
    for (const e of EMPRESAS) q = q.not(coluna, "ilike", `%${termo(e)}%`);
    return q;
  }
  for (const e of EMPRESAS.slice(0, EMPRESAS.indexOf(filtro))) q = q.not(coluna, "ilike", `%${termo(e)}%`);
  return q.ilike(coluna, `%${termo(filtro)}%`);
}
