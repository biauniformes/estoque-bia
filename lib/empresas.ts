/**
 * Empresas (clientes/marcas) que aparecem no NOME dos itens da lista de preços.
 * Para incluir outra empresa nos relatórios, acrescente o nome aqui (em maiúsculas, sem acento).
 */
export const EMPRESAS = ["ORBENK", "SEPAT", "PROFISER", "GLOBALSEG"] as const;
export type Empresa = (typeof EMPRESAS)[number];

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

/** Empresa do item (primeira que aparece no nome) ou "SEM". */
export function empresaDe(nome: string): Empresa | typeof SEM_EMPRESA {
  const n = semAcento(nome);
  return (EMPRESAS.find((e) => n.includes(e)) ?? SEM_EMPRESA) as Empresa | typeof SEM_EMPRESA;
}

export function combinaEmpresa(nome: string, filtro: FiltroEmpresa) {
  if (!filtro) return true;
  return empresaDe(nome) === filtro;
}

/** Aplica o filtro de empresa a uma consulta (coluna `produto`). */
export function applyEmpresa<Q extends { ilike: (c: string, p: string) => Q; not: (c: string, op: string, v: string) => Q }>(
  query: Q,
  filtro: FiltroEmpresa,
  coluna = "produto",
): Q {
  if (!filtro) return query;
  if (filtro === SEM_EMPRESA) {
    let q = query;
    for (const e of EMPRESAS) q = q.not(coluna, "ilike", `%${e}%`);
    return q;
  }
  return query.ilike(coluna, `%${filtro}%`);
}
