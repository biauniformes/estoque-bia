/**
 * Quadro de cotações: prova de onde sai cada custo unitário da planilha.
 * Na diligência de exequibilidade de bens (Lei 14.133/2021, art. 59, §2º; IN SEGES/ME 73/2022,
 * art. 34) o licitante precisa mostrar que o seu custo cabe no preço: cotações de fornecedores,
 * notas fiscais e contratos são a prova mais usada.
 */
import type { Analise, Cotacao, CriterioCotacao, Insumo } from "@/lib/exequibilidade/types";

/** Referência de "cotação recente": a Administração usa orçamentos de até 6 meses na pesquisa de preços. */
export const COTACAO_VALIDADE_DIAS = 180;
/** Coeficiente de variação acima do qual os preços são considerados muito diferentes entre si. */
export const COTACAO_CV_ALTO = 25;
/** Quantidade de cotações recomendada por insumo. */
export const COTACOES_RECOMENDADAS = 3;

export const CRITERIOS_COTACAO: { value: CriterioCotacao; label: string; curto: string }[] = [
  { value: "menor", label: "Menor preço cotado", curto: "menor cotação" },
  { value: "mediana", label: "Preço do meio (mediana)", curto: "mediana das cotações" },
  { value: "media", label: "Média das cotações", curto: "média das cotações" },
  { value: "manual", label: "Digitar o custo manualmente", curto: "valor informado" },
];

export const rotuloCriterio = (c: CriterioCotacao | undefined) =>
  CRITERIOS_COTACAO.find((x) => x.value === (c ?? "menor"))?.curto ?? "";

export interface ResumoCotacoes {
  n: number;
  fornecedores: number;
  menor: number;
  maior: number;
  mediana: number;
  media: number;
  /** Coeficiente de variação (desvio-padrão ÷ média), em %. */
  cv: number;
  /** Idade da cotação mais antiga, em dias (null se nenhuma tem data). */
  maisAntigaDias: number | null;
  semData: number;
  semDocumento: number;
}

function diasDesde(iso: string, hoje: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const alvo = Date.UTC(y, m - 1, d);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((base - alvo) / 86400000);
}

export const cotacoesValidas = (cs: Cotacao[] | undefined) =>
  (cs ?? []).filter((c) => Number.isFinite(c.valor) && c.valor > 0);

export function resumoCotacoes(cs: Cotacao[] | undefined, hoje = new Date()): ResumoCotacoes | null {
  const v = cotacoesValidas(cs);
  if (!v.length) return null;
  const valores = v.map((c) => c.valor).sort((x, y) => x - y);
  const n = valores.length;
  const media = valores.reduce((s, x) => s + x, 0) / n;
  const mediana = n % 2 ? valores[(n - 1) / 2] : (valores[n / 2 - 1] + valores[n / 2]) / 2;
  const desvio = Math.sqrt(valores.reduce((s, x) => s + (x - media) ** 2, 0) / n);
  const idades = v.map((c) => diasDesde(c.data, hoje)).filter((x): x is number => x !== null);
  return {
    n,
    fornecedores: new Set(v.map((c) => c.fornecedor.trim().toLowerCase()).filter(Boolean)).size,
    menor: valores[0],
    maior: valores[n - 1],
    mediana,
    media,
    cv: media > 0 ? (desvio / media) * 100 : 0,
    maisAntigaDias: idades.length ? Math.max(...idades) : null,
    semData: v.length - idades.length,
    semDocumento: v.filter((c) => !c.anexoId).length,
  };
}

export function valorPorCriterio(r: ResumoCotacoes | null, criterio: CriterioCotacao | undefined): number | null {
  if (!r) return null;
  switch (criterio ?? "menor") {
    case "menor":
      return r.menor;
    case "mediana":
      return r.mediana;
    case "media":
      return Math.round(r.media * 100) / 100;
    default:
      return null;
  }
}

/** Atualiza o custo unitário do insumo a partir das cotações (quando o critério não é manual). */
export function aplicarCotacoes(i: Insumo): Insumo {
  const v = valorPorCriterio(resumoCotacoes(i.cotacoes), i.criterioCotacao);
  return v === null ? i : { ...i, custoUnitario: v };
}

export const usaCotacoes = (i: Insumo) => cotacoesValidas(i.cotacoes).length > 0 && (i.criterioCotacao ?? "menor") !== "manual";

export interface ProblemaCotacao {
  insumoId: string;
  descricao: string;
  tipo: "sem_cotacao" | "poucas" | "abaixo_menor" | "antiga" | "dispersao" | "sem_documento";
  texto: string;
}

/** Pontos fracos da prova de custos, por insumo (para a tela; não vão para documentos do órgão). */
export function problemasCotacoes(a: Analise, hoje = new Date()): ProblemaCotacao[] {
  const out: ProblemaCotacao[] = [];
  for (const i of a.insumos) {
    if (i.categoria === "mao_de_obra" || !(i.custoUnitario > 0)) continue;
    const nome = i.descricao.trim() || "Insumo sem descrição";
    const r = resumoCotacoes(i.cotacoes, hoje);
    const add = (tipo: ProblemaCotacao["tipo"], texto: string) => out.push({ insumoId: i.id, descricao: nome, tipo, texto });
    if (!r) {
      add("sem_cotacao", "sem cotação registrada");
      continue;
    }
    if (r.n < COTACOES_RECOMENDADAS) add("poucas", `${r.n} cotação(ões); o recomendado é ${COTACOES_RECOMENDADAS}`);
    if (i.custoUnitario < r.menor - 0.005) add("abaixo_menor", "custo usado está ABAIXO da menor cotação: esse valor não está comprovado");
    if (r.maisAntigaDias !== null && r.maisAntigaDias > COTACAO_VALIDADE_DIAS) add("antiga", `cotação com ${r.maisAntigaDias} dias; renove (referência: até ${COTACAO_VALIDADE_DIAS} dias)`);
    if (r.n >= 2 && r.cv > COTACAO_CV_ALTO) add("dispersao", `preços muito diferentes entre si (variação de ${r.cv.toFixed(0)}%); confira se é o mesmo produto e unidade`);
    if (r.semDocumento > 0) add("sem_documento", `${r.semDocumento} cotação(ões) sem documento anexado`);
  }
  return out;
}

/** Totais para a minuta e o dossiê. */
export function estatisticaCotacoes(a: Analise) {
  let insumos = 0;
  let cotacoes = 0;
  const fornecedores = new Set<string>();
  for (const i of a.insumos) {
    const v = cotacoesValidas(i.cotacoes);
    if (!v.length) continue;
    insumos++;
    cotacoes += v.length;
    v.forEach((c) => c.fornecedor.trim() && fornecedores.add(c.fornecedor.trim().toLowerCase()));
  }
  return { insumos, cotacoes, fornecedores: fornecedores.size };
}
