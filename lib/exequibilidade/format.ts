const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const formatBRL = (n: number): string =>
  brl.format(Number.isFinite(n) ? n : 0);

export const formatNumero = (n: number, casas = 2): string =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(Number.isFinite(n) ? n : 0);

export const formatPct = (n: number, casas = 2): string =>
  `${formatNumero(n, casas)}%`;

/** Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56". */
export function parseNumeroBR(texto: string): number | null {
  let s = texto.replace(/[R$\s%]/g, "");
  if (s === "" || s === "-") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatData(d = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}
