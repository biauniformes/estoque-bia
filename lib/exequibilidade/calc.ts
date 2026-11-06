import type {
  Analise,
  Cenario,
  DecomposicaoPreco,
  Encargos,
  Insumo,
  ParametrosBDI,
  ResultadoAnalise,
  ResultadoBDI,
  ResultadoCustos,
  ResultadoEncargos,
  StatusExequibilidade,
  Tributos,
} from "@/lib/exequibilidade/types";

export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

/* ------------------------- Encargos sociais ------------------------- */

export function calcularEncargos(e: Encargos): ResultadoEncargos {
  if (e.modo === "manual") {
    return {
      grupoA: 0,
      grupoB: 0,
      grupoC: 0,
      grupoD: 0,
      total: num(e.manualPercentual),
    };
  }
  const soma = (f: (i: Encargos["itens"][number]) => boolean) =>
    e.itens.filter(f).reduce((s, i) => s + num(i.percentual), 0);
  const grupoA = soma((i) => i.grupo === "A");
  const grupoB = soma((i) => i.grupo === "B");
  const grupoBIncidente = soma((i) => i.grupo === "B" && i.incideGrupoA);
  const grupoC = soma((i) => i.grupo === "C");
  // Grupo D: reincidência do Grupo A sobre os itens do Grupo B.
  const grupoD = (grupoA * grupoBIncidente) / 100;
  return {
    grupoA,
    grupoB,
    grupoC,
    grupoD,
    total: grupoA + grupoB + grupoC + grupoD,
  };
}

/* ------------------------------ Custos ------------------------------ */

export function custoInsumo(i: Insumo, encargosGlobal: number): number {
  const base = num(i.quantidade) * num(i.custoUnitario);
  if (i.categoria !== "mao_de_obra") return base;
  const enc = i.encargosPercentual ?? encargosGlobal;
  return base * (1 + num(enc) / 100);
}

export function calcularCustos(
  insumos: Insumo[],
  encargosGlobal: number,
): ResultadoCustos {
  const r: ResultadoCustos = {
    maoDeObra: 0,
    materiais: 0,
    equipamentos: 0,
    outros: 0,
    encargosValor: 0,
    custoDireto: 0,
    linhas: {},
  };
  for (const i of insumos) {
    const total = custoInsumo(i, encargosGlobal);
    r.linhas[i.id] = total;
    switch (i.categoria) {
      case "mao_de_obra": {
        r.maoDeObra += total;
        const base = num(i.quantidade) * num(i.custoUnitario);
        r.encargosValor += total - base;
        break;
      }
      case "material":
        r.materiais += total;
        break;
      case "equipamento":
        r.equipamentos += total;
        break;
      default:
        r.outros += total;
    }
  }
  r.custoDireto = r.maoDeObra + r.materiais + r.equipamentos + r.outros;
  return r;
}

/* --------------------------- BDI e tributos -------------------------- */

export function calcularBDI(b: ParametrosBDI, t: Tributos): ResultadoBDI {
  const simples = t.regime === "simples";
  const irpjEfetivo = simples ? 0 : (num(t.irpjAliquota) * num(t.irpjPresuncao)) / 100;
  const csllEfetivo = simples ? 0 : (num(t.csllAliquota) * num(t.csllPresuncao)) / 100;
  const somaTributos = simples
    ? num(t.simplesAliquota) + num(t.outros)
    : num(t.pis) +
      num(t.cofins) +
      num(t.iss) +
      num(t.icms) +
      num(t.cprb) +
      num(t.outros) +
      irpjEfetivo +
      csllEfetivo;
  if (somaTributos >= 100) {
    return {
      somaTributos,
      irpjEfetivo,
      csllEfetivo,
      bdi: 0,
      valido: false,
      erro: "A soma dos tributos incidentes sobre o preço deve ser inferior a 100%.",
    };
  }
  const ac = num(b.administracaoCentral) / 100;
  const s = num(b.seguro) / 100;
  const r = num(b.risco) / 100;
  const g = num(b.garantia) / 100;
  const df = num(b.despesasFinanceiras) / 100;
  const l = num(b.lucro) / 100;
  const i = somaTributos / 100;
  // Fórmula do Acórdão TCU 2.622/2013-Plenário.
  const bdi =
    (((1 + ac + s + r + g) * (1 + df) * (1 + l)) / (1 - i) - 1) * 100;
  return { somaTributos, irpjEfetivo, csllEfetivo, bdi, valido: true };
}

/* ------------------------ Decomposição do preço ----------------------- */

export function decomporPreco(
  preco: number,
  custoDireto: number,
  b: ParametrosBDI,
  somaTributos: number,
): DecomposicaoPreco {
  const indiretosPct =
    (num(b.administracaoCentral) +
      num(b.seguro) +
      num(b.risco) +
      num(b.garantia)) /
    100;
  const custosIndiretos = custoDireto * indiretosPct;
  const despesasFinanceiras =
    (custoDireto + custosIndiretos) * (num(b.despesasFinanceiras) / 100);
  const tributos = preco * (somaTributos / 100);
  const base = custoDireto + custosIndiretos + despesasFinanceiras;
  const lucro = preco - tributos - base;
  return {
    preco,
    tributos,
    custoDireto,
    custosIndiretos,
    despesasFinanceiras,
    lucro,
    margemSobrePreco: preco > 0 ? (lucro / preco) * 100 : 0,
    margemSobreCusto: base > 0 ? (lucro / base) * 100 : 0,
  };
}

/** Preço que entrega margem líquida `m` (%) sobre o próprio preço. */
export function precoParaMargem(
  custoDireto: number,
  b: ParametrosBDI,
  somaTributos: number,
  m: number,
): number | null {
  if (custoDireto <= 0) return null;
  const base = decomporPreco(0, custoDireto, b, 0);
  const custoTotal =
    custoDireto + base.custosIndiretos + base.despesasFinanceiras;
  const denom = 1 - (somaTributos + m) / 100;
  if (denom <= 0) return null;
  return custoTotal / denom;
}

/* ------------------- Critério estatístico (referência) ---------------- */

/**
 * Critério histórico da Lei 8.666/93, art. 48, §1º: 70% do menor valor entre a
 * média das propostas acima de 50% do orçamento e o próprio orçamento.
 * Mantido como referência complementar (não consta da Lei 14.133/2021).
 */
export function limiteEstatistico(
  valorEstimado: number,
  propostas: number[],
): { base: number; limite: number } | null {
  if (valorEstimado <= 0) return null;
  const elegiveis = propostas.filter((v) => v > valorEstimado * 0.5);
  if (elegiveis.length === 0) return null;
  const media = elegiveis.reduce((s, v) => s + v, 0) / elegiveis.length;
  const base = Math.min(media, valorEstimado);
  return { base, limite: base * 0.7 };
}

/* ----------------------------- Status ------------------------------- */

const SEVERIDADE: Record<StatusExequibilidade, number> = {
  indefinido: 0,
  exequivel: 1,
  alerta: 2,
  inexequivel: 3,
  acima_orcamento: 3,
};

export function piorStatus(
  a: StatusExequibilidade,
  b: StatusExequibilidade,
): StatusExequibilidade {
  if (a === "indefinido") return b;
  if (b === "indefinido") return a;
  return SEVERIDADE[b] > SEVERIDADE[a] ? b : a;
}

export function statusLegal(
  preco: number,
  estimado: number,
  limite: number,
  limiteAlerta: number,
): StatusExequibilidade {
  if (estimado <= 0 || preco <= 0) return "indefinido";
  const p = round2(preco);
  if (p > round2(estimado)) return "acima_orcamento";
  if (p < round2(limite)) return "inexequivel";
  if (p < round2(limiteAlerta)) return "alerta";
  return "exequivel";
}

export function statusEconomico(
  lucro: number,
  margemPct: number,
  margemMinima: number,
  temCustos: boolean,
): StatusExequibilidade {
  if (!temCustos) return "indefinido";
  if (round2(lucro) < 0) return "inexequivel";
  if (margemPct < margemMinima) return "alerta";
  return "exequivel";
}

/* --------------------------- Análise completa ------------------------ */

export const CENARIOS_PERCENTUAIS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];

export function analisar(a: Analise): ResultadoAnalise {
  const p = a.parametros;
  const avisos: string[] = [];

  const encargos = calcularEncargos(a.encargos);
  const custos = calcularCustos(a.insumos, encargos.total);
  const bdi = calcularBDI(a.bdi, a.tributos);
  if (!bdi.valido && bdi.erro) avisos.push(bdi.erro);
  if (
    a.tributos.regime === "simples" &&
    a.encargos.modo === "detalhado" &&
    a.insumos.some((i) => i.categoria === "mao_de_obra") &&
    a.encargos.itens.some((i) => ["a1", "a2", "a3", "a4", "a5", "a6", "a7"].includes(i.id) && num(i.percentual) > 0)
  )
    avisos.push(
      "Simples Nacional: INSS patronal e contribuições ao Sistema S (salário-educação, SESI/SENAI, INCRA, SEBRAE) costumam estar dentro do DAS nos anexos I a III. Se for o seu caso, zere esses itens nos encargos para não contar duas vezes (confirme com o contador).",
    );

  const E = num(p.valorEstimado);
  const P = num(p.precoOfertado);
  const CD = custos.custoDireto;
  const temCustos = CD > 0;
  const trib = bdi.valido ? bdi.somaTributos : 0;

  if (E <= 0) avisos.push("Informe o valor estimado pela Administração.");
  if (P <= 0) avisos.push("Informe o preço ofertado.");
  if (!temCustos)
    avisos.push(
      "Nenhum insumo informado: a análise econômica depende da planilha de custos.",
    );

  const precoReferencia = bdi.valido ? CD * (1 + bdi.bdi / 100) : 0;

  const limitePercentual = (E * num(p.percentualInexequibilidade)) / 100;
  const est = limiteEstatistico(E, [
    ...a.concorrentes.map((c) => num(c.valor)),
    ...(P > 0 ? [P] : []),
  ]);
  const limiteEst = est?.limite ?? null;

  let limiteLegal = limitePercentual;
  if (p.criterio === "estatistico") {
    if (limiteEst !== null) limiteLegal = limiteEst;
    else
      avisos.push(
        "Critério estatístico sem propostas acima de 50% do orçamento: usando o percentual.",
      );
  } else if (p.criterio === "mais_rigoroso" && limiteEst !== null) {
    limiteLegal = Math.max(limitePercentual, limiteEst);
  }
  const limiteAlerta = limiteLegal + (E * num(p.faixaAlertaPontos)) / 100;

  const margemMin = num(p.margemMinima);
  const avaliar = (preco: number) => {
    const d = decomporPreco(preco, CD, a.bdi, trib);
    const sl = statusLegal(preco, E, limiteLegal, limiteAlerta);
    const se = bdi.valido
      ? statusEconomico(d.lucro, d.margemSobrePreco, margemMin, temCustos)
      : "indefinido";
    return { d, sl, se, sg: piorStatus(sl, se) };
  };

  const atual = avaliar(P);

  const precoEquilibrio = bdi.valido
    ? precoParaMargem(CD, a.bdi, trib, 0)
    : null;
  const precoMargemMinima = bdi.valido
    ? precoParaMargem(CD, a.bdi, trib, margemMin)
    : null;

  let pisoRecomendado: number | null = null;
  if (E > 0) {
    pisoRecomendado = Math.max(limiteLegal, precoMargemMinima ?? 0);
  }
  const faixaViavel = pisoRecomendado !== null && pisoRecomendado <= E;

  const cenarios: Cenario[] = [];
  if (E > 0) {
    for (const pct of CENARIOS_PERCENTUAIS) {
      const preco = (E * pct) / 100;
      const r = avaliar(preco);
      cenarios.push({
        percentualDoEstimado: pct,
        preco,
        statusLegal: r.sl,
        statusEconomico: r.se,
        statusGeral: r.sg,
        lucro: r.d.lucro,
        margemSobrePreco: r.d.margemSobrePreco,
      });
    }
    if (P > 0) {
      cenarios.push({
        percentualDoEstimado: (P / E) * 100,
        preco: P,
        statusLegal: atual.sl,
        statusEconomico: atual.se,
        statusGeral: atual.sg,
        lucro: atual.d.lucro,
        margemSobrePreco: atual.d.margemSobrePreco,
        atual: true,
      });
      cenarios.sort((x, y) => y.percentualDoEstimado - x.percentualDoEstimado);
    }
  }

  return {
    encargos,
    custos,
    bdi,
    precoReferencia,
    decomposicao: atual.d,
    percentualDoEstimado: E > 0 && P > 0 ? (P / E) * 100 : null,
    limitePercentual,
    limiteEstatistico: limiteEst,
    baseEstatistica: est?.base ?? null,
    limiteLegal,
    limiteAlerta,
    precoEquilibrio,
    precoMargemMinima,
    pisoRecomendado,
    faixaViavel,
    statusLegal: atual.sl,
    statusEconomico: atual.se,
    statusGeral: atual.sg,
    cenarios,
    avisos,
  };
}
