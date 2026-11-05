/** Modelos de dados do sistema de exequibilidade (Lei 14.133/2021). */

export type TipoLicitacao = "obras" | "servicos" | "fornecimento";

export type CategoriaInsumo =
  | "mao_de_obra"
  | "material"
  | "equipamento"
  | "outros";

export interface Insumo {
  id: string;
  descricao: string;
  categoria: CategoriaInsumo;
  unidade: string;
  /** Quantidade TOTAL no contrato (ex.: 3 postos x 12 meses = 36 "mês"). */
  quantidade: number;
  custoUnitario: number;
  /** Só mão de obra: sobrescreve o % global de encargos sociais. null = usar global. */
  encargosPercentual: number | null;
}

export type GrupoEncargo = "A" | "B" | "C";

export interface ItemEncargo {
  id: string;
  grupo: GrupoEncargo;
  descricao: string;
  /** Percentual (ex.: 8 = 8%). */
  percentual: number;
  /** Só grupo B: sobre este item incide o Grupo A (gera o Grupo D). */
  incideGrupoA: boolean;
}

export interface Encargos {
  modo: "detalhado" | "manual";
  manualPercentual: number;
  itens: ItemEncargo[];
}

/** Componentes do BDI em % (aplicados sobre o custo direto). */
export interface ParametrosBDI {
  administracaoCentral: number;
  seguro: number;
  risco: number;
  garantia: number;
  despesasFinanceiras: number;
  lucro: number;
}

/** Tributos em % sobre o preço de venda (faturamento). */
export interface Tributos {
  pis: number;
  cofins: number;
  iss: number;
  icms: number;
  cprb: number;
  outros: number;
  irpjAliquota: number;
  irpjPresuncao: number;
  csllAliquota: number;
  csllPresuncao: number;
}

export type CriterioInexequibilidade =
  | "percentual"
  | "estatistico"
  | "mais_rigoroso";

export interface Identificacao {
  empresa: string;
  cnpj: string;
  representante: string;
  orgao: string;
  edital: string;
  processo: string;
  objeto: string;
  cidade: string;
}

export interface Concorrente {
  id: string;
  nome: string;
  valor: number;
}

export interface ParametrosGerais {
  tipo: TipoLicitacao;
  valorEstimado: number;
  precoOfertado: number;
  /** % do valor estimado abaixo do qual a proposta é inexequível (ex.: 75). */
  percentualInexequibilidade: number;
  /** Pontos percentuais acima do limite considerados "zona de alerta". */
  faixaAlertaPontos: number;
  /** Margem líquida mínima desejada sobre o preço (%). */
  margemMinima: number;
  criterio: CriterioInexequibilidade;
}

export interface ArgumentoDefesa {
  ativo: boolean;
  /** Percentual informativo (ex.: desconto obtido). */
  percentual: number;
  detalhe: string;
}

export type ChaveArgumento =
  | "escala"
  | "produtividade"
  | "estrutura"
  | "equipamentos"
  | "logistica"
  | "margemReduzida";

export type Defesa = Record<ChaveArgumento, ArgumentoDefesa>;

export interface Analise {
  versao: 1;
  identificacao: Identificacao;
  parametros: ParametrosGerais;
  insumos: Insumo[];
  encargos: Encargos;
  bdi: ParametrosBDI;
  tributos: Tributos;
  concorrentes: Concorrente[];
  defesa: Defesa;
}

/* ---------------------------- Resultados ---------------------------- */

export type StatusExequibilidade =
  | "exequivel"
  | "alerta"
  | "inexequivel"
  | "acima_orcamento"
  | "indefinido";

export interface ResultadoEncargos {
  grupoA: number;
  grupoB: number;
  grupoC: number;
  grupoD: number;
  total: number;
}

export interface ResultadoCustos {
  maoDeObra: number;
  materiais: number;
  equipamentos: number;
  outros: number;
  /** Parcela de encargos sociais já embutida em maoDeObra. */
  encargosValor: number;
  custoDireto: number;
  linhas: Record<string, number>;
}

export interface ResultadoBDI {
  somaTributos: number;
  irpjEfetivo: number;
  csllEfetivo: number;
  /** BDI em % (fórmula do Acórdão TCU 2.622/2013). */
  bdi: number;
  valido: boolean;
  erro?: string;
}

export interface DecomposicaoPreco {
  preco: number;
  tributos: number;
  custoDireto: number;
  custosIndiretos: number;
  despesasFinanceiras: number;
  lucro: number;
  /** Lucro / preço, em %. */
  margemSobrePreco: number;
  /** Lucro / (custos + despesas), em %. */
  margemSobreCusto: number;
}

export interface Cenario {
  percentualDoEstimado: number;
  preco: number;
  statusLegal: StatusExequibilidade;
  statusEconomico: StatusExequibilidade;
  statusGeral: StatusExequibilidade;
  lucro: number;
  margemSobrePreco: number;
  atual?: boolean;
}

export interface ResultadoAnalise {
  encargos: ResultadoEncargos;
  custos: ResultadoCustos;
  bdi: ResultadoBDI;
  precoReferencia: number;
  decomposicao: DecomposicaoPreco;
  percentualDoEstimado: number | null;
  limitePercentual: number;
  limiteEstatistico: number | null;
  baseEstatistica: number | null;
  limiteLegal: number;
  limiteAlerta: number;
  precoEquilibrio: number | null;
  precoMargemMinima: number | null;
  pisoRecomendado: number | null;
  faixaViavel: boolean;
  statusLegal: StatusExequibilidade;
  statusEconomico: StatusExequibilidade;
  statusGeral: StatusExequibilidade;
  cenarios: Cenario[];
  avisos: string[];
}
