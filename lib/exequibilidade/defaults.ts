import type {
  Analise,
  Defesa,
  Encargos,
  Insumo,
  ParametrosBDI,
  TipoLicitacao,
  Tributos,
} from "@/lib/exequibilidade/types";

export function novoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const NOMES_TIPO: Record<TipoLicitacao, string> = {
  obras: "Obras e Serviços de Engenharia",
  servicos: "Serviços em Geral",
  fornecimento: "Fornecimento de Bens",
};

/**
 * Lei 14.133/2021, art. 59, §4º: 75% do valor orçado, SÓ para obras e serviços de
 * engenharia (TCU, Acórdão 963/2024). Bens e serviços em geral: IN SEGES/ME 73/2022,
 * art. 34 — abaixo de 50% é INDÍCIO de inexequibilidade (Executivo federal); outros
 * entes seguem o edital. Em qualquer caso a desclassificação exige diligência prévia.
 */
export const PERCENTUAL_PADRAO: Record<TipoLicitacao, number> = {
  obras: 75,
  servicos: 50,
  fornecimento: 50,
};

export const BDI_PADRAO: Record<TipoLicitacao, ParametrosBDI> = {
  // Referência: Acórdão TCU 2.622/2013-Plenário (edificações, valores médios).
  obras: {
    administracaoCentral: 4,
    seguro: 0.4,
    risco: 1.27,
    garantia: 0.4,
    despesasFinanceiras: 1.23,
    lucro: 7.4,
  },
  servicos: {
    administracaoCentral: 5,
    seguro: 0.5,
    risco: 1,
    garantia: 0.4,
    despesasFinanceiras: 1,
    lucro: 7,
  },
  fornecimento: {
    administracaoCentral: 3,
    seguro: 0.3,
    risco: 0.5,
    garantia: 0,
    despesasFinanceiras: 1,
    lucro: 6,
  },
};

/** Lucro Presumido como ponto de partida. Ajuste ao regime e ao município. */
export const TRIBUTOS_PADRAO: Record<TipoLicitacao, Tributos> = {
  obras: {
    regime: "presumido",
    simplesAliquota: 0,
    pis: 0.65,
    cofins: 3,
    iss: 3,
    icms: 0,
    cprb: 0,
    outros: 0,
    irpjAliquota: 15,
    irpjPresuncao: 8,
    csllAliquota: 9,
    csllPresuncao: 12,
  },
  servicos: {
    regime: "presumido",
    simplesAliquota: 0,
    pis: 0.65,
    cofins: 3,
    iss: 5,
    icms: 0,
    cprb: 0,
    outros: 0,
    irpjAliquota: 15,
    irpjPresuncao: 32,
    csllAliquota: 9,
    csllPresuncao: 32,
  },
  fornecimento: {
    regime: "presumido",
    simplesAliquota: 0,
    pis: 0.65,
    cofins: 3,
    iss: 0,
    icms: 12,
    cprb: 0,
    outros: 0,
    irpjAliquota: 15,
    irpjPresuncao: 8,
    csllAliquota: 9,
    csllPresuncao: 12,
  },
};

/** Encargos sociais de referência (mensalista). Valores editáveis. */
export function encargosPadrao(): Encargos {
  const i = (
    id: string,
    grupo: "A" | "B" | "C",
    descricao: string,
    percentual: number,
    incideGrupoA = false,
  ) => ({ id, grupo, descricao, percentual, incideGrupoA });
  return {
    modo: "detalhado",
    manualPercentual: 70,
    itens: [
      i("a1", "A", "INSS (patronal)", 20),
      i("a2", "A", "Salário-educação", 2.5),
      i("a3", "A", "SAT/RAT x FAP", 3),
      i("a4", "A", "SESI/SESC", 1.5),
      i("a5", "A", "SENAI/SENAC", 1),
      i("a6", "A", "INCRA", 0.2),
      i("a7", "A", "SEBRAE", 0.6),
      i("a8", "A", "FGTS", 8),
      i("b1", "B", "13º salário", 8.33, true),
      i("b2", "B", "Férias + 1/3 constitucional", 11.11, true),
      i("b3", "B", "Faltas legais e licenças", 0.8, true),
      i("b4", "B", "Auxílio-doença (15 primeiros dias)", 0.9, true),
      i("c1", "C", "Aviso prévio indenizado", 1.5),
      i("c2", "C", "Multa do FGTS na rescisão", 4),
    ],
  };
}

export function defesaPadrao(): Defesa {
  const a = (percentual = 0) => ({ ativo: false, percentual, detalhe: "" });
  return {
    escala: a(),
    produtividade: a(),
    estrutura: a(),
    equipamentos: a(),
    logistica: a(),
    margemReduzida: a(),
  };
}

export function analiseVazia(tipo: TipoLicitacao = "fornecimento"): Analise {
  return {
    versao: 1,
    identificacao: {
      empresa: "",
      cnpj: "",
      representante: "",
      orgao: "",
      edital: "",
      processo: "",
      objeto: "",
      cidade: "",
    },
    parametros: {
      tipo,
      valorEstimado: 0,
      precoOfertado: 0,
      percentualInexequibilidade: PERCENTUAL_PADRAO[tipo],
      faixaAlertaPontos: 10,
      margemMinima: 3,
      criterio: "percentual",
    },
    insumos: [],
    encargos: encargosPadrao(),
    bdi: { ...BDI_PADRAO[tipo] },
    tributos: { ...TRIBUTOS_PADRAO[tipo] },
    concorrentes: [],
    defesa: defesaPadrao(),
  };
}

/** Cotações fictícias do exemplo: [fornecedor, dias atrás, preço]. */
function comCotacoes(i: Insumo, cs: [string, number, number][]): Insumo {
  const dia = (atras: number) => {
    const d = new Date(Date.now() - atras * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return {
    ...i,
    criterioCotacao: "menor",
    cotacoes: cs.map(([fornecedor, atras, valor]) => ({ id: novoId(), fornecedor, data: dia(atras), valor, anexoId: null })),
  };
}

export function exemplo(): Analise {
  const base = analiseVazia("fornecimento");
  const ins = (
    descricao: string,
    categoria: Insumo["categoria"],
    unidade: string,
    quantidade: number,
    custoUnitario: number,
  ): Insumo => ({
    id: novoId(),
    descricao,
    categoria,
    unidade,
    quantidade,
    custoUnitario,
    encargosPercentual: null,
  });
  return {
    ...base,
    identificacao: {
      empresa: "Confecções Exemplo Ltda.",
      cnpj: "00.000.000/0001-00",
      representante: "Nome do Representante Legal",
      orgao: "Prefeitura Municipal de Exemplo",
      edital: "Pregão Eletrônico nº 00/2026",
      processo: "Processo Administrativo nº 0000/2026",
      objeto: "Fornecimento de uniformes escolares (camisetas, bermudas e jaquetas)",
      cidade: "Exemplo/UF",
    },
    parametros: {
      ...base.parametros,
      valorEstimado: 480_000,
      precoOfertado: 330_000,
    },
    insumos: [
      comCotacoes(ins("Camiseta — malha PV (com perda)", "material", "m", 2000 * 0.9 * 1.08, 18.5), [
        ["Malharia Exemplo A", 5, 18.5],
        ["Malharia Exemplo B", 8, 19.2],
        ["Distribuidora Exemplo C", 12, 21],
      ]),
      ins("Camiseta — aviamentos", "material", "un", 2000, 1.2),
      ins("Camiseta — corte, costura e acabamento", "mao_de_obra", "h", (2000 * 12) / 60, 9.5),
      ins("Camiseta — serigrafia", "outros", "un", 2000, 2.8),
      comCotacoes(ins("Bermuda — tecido tactel (com perda)", "material", "m", 1500 * 1.1 * 1.08, 21), [
        ["Tecelagem Exemplo D", 3, 21],
        ["Malharia Exemplo A", 5, 22.4],
        ["Distribuidora Exemplo C", 12, 23.1],
      ]),
      ins("Bermuda — aviamentos", "material", "un", 1500, 3.4),
      ins("Bermuda — corte, costura e acabamento", "mao_de_obra", "h", (1500 * 25) / 60, 9.5),
      ins("Jaqueta — tecido e forro (com perda)", "material", "m", 800 * 2.2 * 1.08, 26),
      ins("Jaqueta — zíper e aviamentos", "material", "un", 800, 9.5),
      ins("Jaqueta — corte, costura e acabamento", "mao_de_obra", "h", (800 * 55) / 60, 9.5),
      ins("Jaqueta — bordado do brasão", "outros", "un", 800, 6),
      ins("Embalagem individual", "material", "un", 4300, 0.6),
      ins("Frete e entrega", "outros", "vb", 1, 4500),
    ],
    concorrentes: [
      { id: novoId(), nome: "Concorrente A", valor: 395_000 },
      { id: novoId(), nome: "Concorrente B", valor: 430_000 },
    ],
  };
}
