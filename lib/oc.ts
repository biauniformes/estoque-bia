/**
 * Ligação entre os códigos do cliente (Orbenk: 66.0042 + tamanho) e os nossos (NNN.NNN.SS).
 * Nosso código = modelo (NNN.NNN) + sufixo do tamanho: PP 16 · P 17 · M 18 · G 19 · GG 20 · XG 21 ·
 * G1 22 … G5 26 · numeral = o próprio número (34, 36…) · único 00 · tamanho especial 99.
 */
const SUFIXO_LETRAS: Record<string, string> = {
  PP: "16", P: "17", M: "18", G: "19", GG: "20", XG: "21",
  G1: "22", G2: "23", G3: "24", G4: "25", G5: "26",
  U: "00", UNICO: "00", ÚNICO: "00", ESPECIAL: "99",
};

/** Tamanhos que podem ser escolhidos na conversão (valor gravado → rótulo). */
export const TAMANHOS_NOSSOS = [
  "PP", "P", "M", "G", "GG", "XG", "G1", "G2", "G3", "G4", "G5",
  "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64", "74",
  "ÚNICO", "ESPECIAL",
] as const;

export function sufixoTamanho(tamanhoNosso: string): string | null {
  const t = tamanhoNosso.trim().toUpperCase();
  if (SUFIXO_LETRAS[t]) return SUFIXO_LETRAS[t];
  return /^\d{2}$/.test(t) ? t : null;
}

export type MapaOc = {
  modelos: Map<string, { modelo: string | null; confirmado: boolean }>; // cod_cliente -> modelo
  tamanhos: Map<string, string>; // `${cod_cliente|*}|${tamanho_cliente}` -> tamanho nosso
};

export type ItemResolvido =
  | { status: "ok" | "nao_confirmado"; codigo: string; produto: string; estoque: number }
  | { status: "sem_modelo" }
  | { status: "sem_tamanho"; tamanhoNosso: string | null }
  | { status: "sem_produto"; codigo: string };

export type CatalogoOc = Map<string, { produto: string; estoque: number }>;

export function tamanhoNosso(mapa: MapaOc, codCliente: string, tamanhoCliente: string): string | null {
  const t = tamanhoCliente.trim().toUpperCase();
  return mapa.tamanhos.get(`${codCliente}|${t}`) ?? mapa.tamanhos.get(`*|${t}`) ?? (sufixoTamanho(t) ? t : null);
}

export function resolverItem(mapa: MapaOc, catalogo: CatalogoOc, codCliente: string, tamanhoCliente: string): ItemResolvido {
  const m = mapa.modelos.get(codCliente);
  if (!m?.modelo) return { status: "sem_modelo" };
  const tn = tamanhoNosso(mapa, codCliente, tamanhoCliente);
  const suf = tn ? sufixoTamanho(tn) : null;
  if (!tn || !suf) return { status: "sem_tamanho", tamanhoNosso: tn };
  const codigo = `${m.modelo}.${suf}`;
  const p = catalogo.get(codigo);
  if (!p) return { status: "sem_produto", codigo };
  return { status: m.confirmado ? "ok" : "nao_confirmado", codigo, produto: p.produto, estoque: p.estoque };
}

/** Avisos que aparecem na lista de separar (e na impressão), por modelo nosso. */
export const OBSERVACAO_POR_MODELO: Record<string, string> = {
  "630.002": "Jaqueta sem capuz, com bolso",
  "630.003": "Jaqueta sem capuz, com bolso",
  "680.002": "Jaqueta com capuz e bolso",
  "680.003": "Jaqueta com capuz e bolso",
};
