import { buscaNorm } from "@/lib/utils";

/**
 * Peças que mais saem — a tela "Para talhar" mostra, dentro de cada grupo, o que está ABAIXO do mínimo.
 * A peça entra no grupo pelo NOME (sem acento, minúsculas). Para mudar o que aparece, ajuste os testes abaixo.
 */
export type GrupoTalhar = { id: string; label: string; test: (nome: string) => boolean };

const tem = (n: string, re: RegExp) => re.test(n);

export const GRUPOS_TALHAR: GrupoTalhar[] = [
  {
    id: "camiseta-pv",
    label: "Camiseta PV Orbenk · Branca e Azul · MC e ML",
    test: (n) =>
      tem(n, /^camiseta basica\b/) && tem(n, /\bpv\b/) && tem(n, /\borbenk\b/) && tem(n, /\b(azul|branca)\b/) && tem(n, /\b(mc|ml)\b/) &&
      !tem(n, /refletivo|carregador|medianeira/),
  },
  {
    id: "elastico-orbenk-azul",
    label: "Calça elástico com cordão brim Orbenk azul",
    test: (n) => tem(n, /^calca elastico com cordao brim\b/) && tem(n, /\borbenk\b/) && tem(n, /\bazul\b/),
  },
  {
    id: "elastico-sepat-branca",
    label: "Calça elástico com cordão brim Sepat branca",
    test: (n) => tem(n, /^calca elastico com cordao brim\b/) && tem(n, /\bsepat\b/) && tem(n, /\bbranca\b/),
  },
  {
    id: "jaqueta-operacional",
    label: "Jaqueta operacional Orbenk brim · Azul e Branca",
    test: (n) => tem(n, /^jaqueta operacional\b/) && tem(n, /\borbenk\b/) && tem(n, /\bbrim\b/) && tem(n, /\b(azul|branca)\b/),
  },
  { id: "jeans", label: "Calça jeans · Masculina e Feminina", test: (n) => tem(n, /^calca jeans (masc|fem)\b/) },
  { id: "ziper-meio", label: "Calça zíper meio elástico", test: (n) => tem(n, /^calca ziper meio\b/) },
  {
    id: "camisa-ripstop",
    label: "Camisa rip stop · MC e ML",
    test: (n) => tem(n, /^camisa tatica (mc|ml)\b/) && tem(n, /rip stop/),
  },
  {
    id: "calca-ripstop",
    label: "Calça rip stop · Azul e Preta",
    test: (n) => tem(n, /^calca tatica\b/) && tem(n, /rip stop/) && tem(n, /\b(azul|preta|preto)\b/),
  },
];

export function grupoTalharDe(produto: string): GrupoTalhar | undefined {
  const n = buscaNorm(produto).trim();
  return GRUPOS_TALHAR.find((g) => g.test(n));
}
