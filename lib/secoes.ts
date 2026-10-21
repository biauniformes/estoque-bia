/**
 * Seções (tipos de peça) usadas para filtrar a lista na Saída por OC.
 * A seção é deduzida do NOME do item; a primeira regra que combinar vence.
 */
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const SECOES = [
  { value: "camisetas", label: "Camisetas", re: /^camiseta\b/ },
  { value: "polo", label: "Camisas polo", re: /^camisa gola polo|^camisa polo/ },
  { value: "social_masc", label: "Camisa social masc.", re: /^camisa social masc/ },
  { value: "social_fem", label: "Camisa social fem.", re: /^(camisa social fem|camisete)/ },
  { value: "calca_social_masc", label: "Calça social masc.", re: /^calca social(\/sport)? masc/ },
  { value: "calca_social_fem", label: "Calça social fem.", re: /^calca social(\/sport)? fem/ },
  { value: "calcas", label: "Outras calças", re: /^calca\b/ },
  { value: "bermudas", label: "Bermudas", re: /^(bermuda|shorts)/ },
  { value: "jalecos", label: "Jalecos e aventais", re: /^(jaleco|guarda po|dolma|avental|chapeu|touca|mangote|batina|bata\b)/ },
  { value: "taticos", label: "Táticos e macacões", re: /^(camisa tatica|gandola|macacao|farda)/ },
  { value: "agasalhos", label: "Jaquetas, moletons e blazers", re: /^(jaqueta|moletom|sueter|blazer|colete|sobretudo|casaco|poncho|xale)/ },
  { value: "outros", label: "Outros", re: /./ },
] as const;

export type SecaoValue = (typeof SECOES)[number]["value"];

export function secaoDe(nome: string): SecaoValue {
  const n = semAcento(nome).trim();
  return SECOES.find((s) => s.re.test(n))!.value;
}
