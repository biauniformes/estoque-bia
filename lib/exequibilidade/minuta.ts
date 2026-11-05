import type {
  Analise,
  ChaveArgumento,
  ResultadoAnalise,
  StatusExequibilidade,
} from "@/lib/exequibilidade/types";
import { formatBRL, formatData, formatPct } from "./format";
import { NOMES_TIPO } from "./defaults";

export const ARGUMENTOS: Record<
  ChaveArgumento,
  { titulo: string; ajuda: string; temPercentual: boolean; rotuloPercentual?: string }
> = {
  escala: {
    titulo: "Compra de tecido e aviamentos em volume",
    ajuda: "Rolos/fardos direto da malharia ou fábrica, tabelas especiais de atacado.",
    temPercentual: true,
    rotuloPercentual: "Desconto médio obtido (%)",
  },
  produtividade: {
    titulo: "Produtividade da confecção em série",
    ajuda: "Enfesto e corte em escala, células de costura, menor tempo e perda por peça.",
    temPercentual: true,
    rotuloPercentual: "Ganho de produtividade (%)",
  },
  estrutura: {
    titulo: "Estrutura administrativa e operacional já instalada",
    ajuda: "Diluição de custos fixos e de administração central.",
    temPercentual: false,
  },
  equipamentos: {
    titulo: "Máquinas próprias (corte, costura, bordado)",
    ajuda: "Parque fabril já amortizado, sem custo de aquisição ou terceirização.",
    temPercentual: false,
  },
  logistica: {
    titulo: "Estoque de matéria-prima e logística compartilhada",
    ajuda: "Tecido já em estoque a custo antigo, entregas consolidadas com outros pedidos.",
    temPercentual: false,
  },
  margemReduzida: {
    titulo: "Opção comercial por margem de lucro reduzida",
    ajuda: "Lucro menor, mas positivo: não torna a proposta inexequível se os custos são cobertos.",
    temPercentual: false,
  },
};

const ROTULO_STATUS: Record<StatusExequibilidade, string> = {
  exequivel: "Exequível",
  alerta: "Zona de alerta / diligência",
  inexequivel: "Inexequível",
  acima_orcamento: "Acima do orçamento estimado",
  indefinido: "Indefinido",
};

export const rotuloStatus = (s: StatusExequibilidade) => ROTULO_STATUS[s];

const ou = (v: string, padrao: string) => (v.trim() ? v.trim() : padrao);

export interface Minuta {
  texto: string;
  avisos: string[];
}

export function gerarMinuta(a: Analise, r: ResultadoAnalise, data = new Date()): Minuta {
  const id = a.identificacao;
  const p = a.parametros;
  const d = r.decomposicao;
  const avisos: string[] = [];

  if (r.statusEconomico === "inexequivel")
    avisos.push(
      "A planilha aponta PREJUÍZO no preço ofertado. Uma defesa de exequibilidade com custos que não fecham pode ser indeferida e gerar responsabilização por declaração inverídica. Revise custos, BDI ou preço antes de protocolar.",
    );
  if (r.statusLegal === "acima_orcamento")
    avisos.push(
      "O preço está acima do valor estimado: o caso é de desclassificação por sobrepreço (art. 59, III), não de exequibilidade. Esta minuta não se aplica.",
    );
  if (!a.insumos.length)
    avisos.push("Sem insumos informados, a minuta não consegue demonstrar a composição de custos.");
  if (!id.empresa.trim() || !id.objeto.trim())
    avisos.push("Preencha a identificação (empresa, órgão, edital e objeto) para um documento pronto para protocolo.");
  if (!Object.values(a.defesa).some((x) => x.ativo))
    avisos.push("Nenhum fundamento de exequibilidade foi marcado: selecione os que correspondem à realidade da empresa.");

  const empresa = ou(id.empresa, "[RAZÃO SOCIAL]");
  const L: string[] = [];
  const push = (...s: string[]) => L.push(...s);

  push(
    "AO(À) ILMO(A). SR(A). PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO",
    ou(id.orgao, "[ÓRGÃO LICITANTE]"),
    "",
    `Ref.: ${ou(id.edital, "[EDITAL]")}${id.processo.trim() ? " — " + id.processo.trim() : ""}`,
    `Objeto: ${ou(id.objeto, "[OBJETO DA LICITAÇÃO]")}`,
    "",
    "ASSUNTO: RESPOSTA À DILIGÊNCIA E DEMONSTRAÇÃO DE EXEQUIBILIDADE DA PROPOSTA",
    "",
    `${empresa}${id.cnpj.trim() ? `, inscrita no CNPJ sob o nº ${id.cnpj.trim()}` : ""}, vem, respeitosamente, por seu representante legal, apresentar a presente DEMONSTRAÇÃO DE EXEQUIBILIDADE de sua proposta, nos termos a seguir.`,
    "",
    "I — DOS FATOS",
    "",
    `A licitante ofertou o valor global de ${formatBRL(p.precoOfertado)}, correspondente a ${r.percentualDoEstimado !== null ? formatPct(r.percentualDoEstimado) : "[—]"} do valor estimado pela Administração (${formatBRL(p.valorEstimado)}), ou seja, ${r.percentualDoEstimado !== null ? formatPct(100 - r.percentualDoEstimado) : "[—]"} abaixo do orçamento de referência, no tipo de objeto "${NOMES_TIPO[p.tipo]}".`,
    "",
    `O limite de aceitabilidade adotado nesta análise é de ${formatBRL(r.limiteLegal)}${p.criterio === "percentual" ? ` (${formatPct(p.percentualInexequibilidade, 0)} do valor estimado)` : ""}. Em relação a esse limite, a proposta situa-se na condição: ${rotuloStatus(r.statusLegal)}.`,
    "",
    "II — DO DIREITO",
    "",
    "A Lei nº 14.133/2021 determina a desclassificação de propostas com preços inexequíveis (art. 59, III) e faculta à Administração realizar diligências para aferir a exequibilidade ou exigir que ela seja demonstrada pelo licitante (art. 59, §2º).",
  );
  if (p.tipo === "obras") {
    push(
      "",
      "Para obras e serviços de engenharia, a lei considera inexequíveis as propostas com valores inferiores a 75% do valor orçado pela Administração (art. 59, §4º). A mesma lógica de aferição exige, contudo, que se faculte ao licitante demonstrar a viabilidade de seus preços, em linha com o entendimento consolidado do Tribunal de Contas da União de que o critério numérico gera presunção relativa de inexequibilidade (Súmula TCU nº 262).",
    );
  } else {
    push(
      "",
      "A lei não fixa percentual único de inexequibilidade para este tipo de objeto, cabendo ao edital e à análise do caso concreto aferir se os preços ofertados remuneram os custos do contrato. O entendimento do Tribunal de Contas da União é de que o critério numérico gera mera presunção relativa de inexequibilidade, devendo ser oportunizada ao licitante a demonstração de viabilidade de sua proposta (Súmula TCU nº 262).",
    );
  }
  push(
    "",
    "Prestigia-se, assim, o princípio da seleção da proposta apta a gerar o resultado de contratação mais vantajoso (art. 11, I), afastando-se a exclusão automática de ofertas que, embora inferiores ao orçamento, são comprovadamente capazes de ser executadas.",
    "",
    "III — DA COMPOSIÇÃO DE CUSTOS",
    "",
    `A proposta foi formada a partir de planilha de custos com ${a.insumos.length} insumo(s), cujo custo direto totaliza ${formatBRL(r.custos.custoDireto)}, assim distribuído:`,
    `  • Mão de obra (incluindo ${formatPct(r.encargos.total)} de encargos sociais): ${formatBRL(r.custos.maoDeObra)}`,
    `  • Materiais: ${formatBRL(r.custos.materiais)}`,
    `  • Equipamentos: ${formatBRL(r.custos.equipamentos)}`,
    `  • Outros custos diretos: ${formatBRL(r.custos.outros)}`,
    "",
    `Sobre o custo direto incidem: administração central (${formatPct(a.bdi.administracaoCentral)}), seguro (${formatPct(a.bdi.seguro)}), risco (${formatPct(a.bdi.risco)}), garantia (${formatPct(a.bdi.garantia)}) e despesas financeiras (${formatPct(a.bdi.despesasFinanceiras)}), além dos tributos incidentes sobre o faturamento, que somam ${formatPct(r.bdi.somaTributos)} (PIS ${formatPct(a.tributos.pis)}, COFINS ${formatPct(a.tributos.cofins)}, ISS ${formatPct(a.tributos.iss)}${a.tributos.icms ? `, ICMS ${formatPct(a.tributos.icms)}` : ""}, IRPJ ${formatPct(r.bdi.irpjEfetivo)} e CSLL ${formatPct(r.bdi.csllEfetivo)} efetivos).`,
    "",
    "Demonstrativo do preço ofertado:",
    `  Custo direto ............................ ${formatBRL(d.custoDireto)}`,
    `  Custos indiretos (AC + S + R + G) ....... ${formatBRL(d.custosIndiretos)}`,
    `  Despesas financeiras .................... ${formatBRL(d.despesasFinanceiras)}`,
    `  Tributos sobre o faturamento ............ ${formatBRL(d.tributos)}`,
    `  Lucro líquido resultante ................ ${formatBRL(d.lucro)}`,
    `  (+) PREÇO OFERTADO ...................... ${formatBRL(d.preco)}`,
    "",
    d.lucro >= 0
      ? `O preço ofertado cobre integralmente todos os custos e tributos e preserva lucro de ${formatBRL(d.lucro)}, equivalente a ${formatPct(d.margemSobrePreco)} do preço (${formatPct(d.margemSobreCusto)} sobre o custo), ${r.precoEquilibrio !== null ? `ficando ${formatPct(((d.preco - r.precoEquilibrio) / r.precoEquilibrio) * 100)} acima do ponto de equilíbrio da contratação (${formatBRL(r.precoEquilibrio)}).` : "."}`
      : `[ATENÇÃO: a planilha resulta em resultado negativo de ${formatBRL(d.lucro)}; revise antes de protocolar.]`,
  );

  const ativos = (Object.keys(a.defesa) as ChaveArgumento[]).filter((k) => a.defesa[k].ativo);
  push("", "IV — DOS FUNDAMENTOS DA EXEQUIBILIDADE", "");
  if (ativos.length === 0) {
    push("[Selecione ao menos um fundamento de exequibilidade na aba \"Minuta de defesa\".]");
  } else {
    push("A exequibilidade da proposta decorre dos seguintes fatores, que reduzem os custos da licitante em relação ao orçamento de referência:", "");
    ativos.forEach((k, i) => {
      const arg = a.defesa[k];
      const romano = `${i + 1}.`;
      let t = "";
      switch (k) {
        case "escala":
          t = `Ganhos de escala: a licitante adquire tecidos e aviamentos em volume (rolos e fardos) diretamente de fabricantes e distribuidores${arg.percentual > 0 ? `, obtendo desconto médio de ${formatPct(arg.percentual)} sobre os preços de referência` : ""}, o que reduz o custo de matéria-prima por peça.`;
          break;
        case "produtividade":
          t = `Produtividade: a licitante emprega produção em série (enfesto e corte em escala, células de costura) que${arg.percentual > 0 ? `, conforme sua experiência, proporcionam produtividade ${formatPct(arg.percentual)} superior ao referencial do orçamento,` : ""} reduzindo o tempo de produção e a perda de tecido por peça.`;
          break;
        case "estrutura":
          t = "Eficiência operacional: a empresa já possui estrutura administrativa, técnica e operacional instalada, diluindo custos fixos e de administração central entre seus contratos, sem acréscimo proporcional de despesas para este objeto.";
          break;
        case "equipamentos":
          t = "Ativos próprios: as máquinas de corte, costura e bordado integram o patrimônio da licitante, já amortizadas ou disponíveis, o que dispensa custos de aquisição, locação ou terceirização considerados no orçamento de referência.";
          break;
        case "logistica":
          t = "Estoque e logística: parte da matéria-prima já se encontra em estoque da licitante e as entregas são consolidadas com outros pedidos, reduzindo custos de aquisição e de frete.";
          break;
        case "margemReduzida":
          t = `Estratégia comercial: a licitante optou por reduzir sua margem de lucro para ${formatPct(d.margemSobrePreco)} sobre o preço, mantendo todos os custos e tributos integralmente cobertos. A redução voluntária do lucro, desde que positivo o resultado, é prerrogativa empresarial e não torna a proposta inexequível.`;
          break;
      }
      push(`${romano} ${t}`);
      if (arg.detalhe.trim()) push(`   ${arg.detalhe.trim()}`);
      push("");
    });
  }

  push(
    "V — DO PEDIDO",
    "",
    "Diante do exposto, a licitante requer o recebimento desta demonstração, a aceitação da proposta como exequível e, por consequência, a manutenção de sua classificação no certame, colocando-se à disposição para apresentar documentos complementares (cotações, notas fiscais, contratos de fornecimento, comprovantes de propriedade de máquinas e demais elementos solicitados em diligência).",
    "",
    "Nestes termos, pede deferimento.",
    "",
    `${ou(id.cidade, "[LOCAL]")}, ${formatData(data)}.`,
    "",
    "",
    "______________________________________",
    empresa,
    ou(id.representante, "[REPRESENTANTE LEGAL]"),
    id.cnpj.trim() ? `CNPJ ${id.cnpj.trim()}` : "",
  );

  return { texto: L.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n", avisos };
}
