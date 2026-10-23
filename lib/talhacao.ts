/** Tamanhos oferecidos no lançamento da Talhação (na ordem em que aparecem). */
export const TAMANHOS_TALHACAO = [
  "PP", "P", "M", "G", "GG", "XG", "G1", "G2", "G3", "G4", "G5",
  "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64",
  "Único",
] as const;

export const ordemTamanho = (t: string) => {
  const i = TAMANHOS_TALHACAO.findIndex((x) => x.toUpperCase() === t.toUpperCase());
  return i < 0 ? 999 : i;
};

/** Nome da peça sem o tamanho (agrupa a grade): "…AZUL TAM ESPECIAL" vira "…AZUL". */
export const pecaBase = (nomeBase: string) => nomeBase.replace(/\s+TAM\.?\s*ESPECIAL$/i, "").trim();
