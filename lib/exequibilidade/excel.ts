import "server-only";
import ExcelJS from "exceljs";
import { analisar } from "@/lib/exequibilidade/calc";
import { gerarMinuta, rotuloStatus } from "@/lib/exequibilidade/minuta";
import { NOMES_TIPO } from "@/lib/exequibilidade/defaults";
import {
  CHECKLIST,
  diasParaVencer,
  formatDataBR,
  rotuloCategoria,
  rotuloStatusLicitacao,
  type Anexo,
  type Checklist,
} from "@/lib/exequibilidade/licitacao";
import type { Analise, CategoriaInsumo } from "@/lib/exequibilidade/types";

const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const PCT = "0.00%";
const QTD = "#,##0.00";
const PRETO = "FF111111";
const AMARELO = "FFFFC107";
const CINZA = "FFF1F5F9";

const ROTULO_CAT: Record<CategoriaInsumo, string> = {
  mao_de_obra: "Mão de obra",
  material: "Material",
  equipamento: "Equipamento",
  outros: "Outros",
};

export interface DadosPlanilha {
  titulo: string;
  status: string;
  dataSessao: string | null;
  analise: Analise;
  checklist: Checklist;
  anexos: Anexo[];
  documentosEmpresa: Anexo[];
}

type Sheet = ExcelJS.Worksheet;

const ref = (sheet: string, cell: string) => `'${sheet}'!${cell}`;
const p = (n: number) => (Number.isFinite(n) ? n / 100 : 0); // % do sistema -> fração do Excel

function titulo(ws: Sheet, texto: string, sub: string, colunas: number) {
  if (colunas > 1) ws.mergeCells(1, 1, 1, colunas);
  const c = ws.getCell(1, 1);
  c.value = texto;
  c.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRETO } };
  c.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;
  if (colunas > 1) ws.mergeCells(2, 1, 2, colunas);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { italic: true, size: 10, color: { argb: "FF475569" } };
  s.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(2).height = 30;
}

function cabecalho(ws: Sheet, linha: number, titulos: string[]) {
  const row = ws.getRow(linha);
  titulos.forEach((t, i) => {
    const c = row.getCell(i + 1);
    c.value = t;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
    c.border = { bottom: { style: "thin" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 22;
}

function secao(ws: Sheet, linha: number, texto: string, colunas: number) {
  ws.mergeCells(linha, 1, linha, colunas);
  const c = ws.getCell(linha, 1);
  c.value = texto;
  c.font = { bold: true, size: 12 };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
}

function bordas(ws: Sheet, de: number, ate: number, colunas: number) {
  for (let r = de; r <= ate; r++)
    for (let c = 1; c <= colunas; c++)
      ws.getCell(r, c).border = {
        top: { style: "hair" },
        bottom: { style: "hair" },
        left: { style: "hair" },
        right: { style: "hair" },
      };
}

function f(formula: string, result: number | string): ExcelJS.CellFormulaValue {
  return { formula, result };
}

function configurarImpressao(ws: Sheet, paisagem = true) {
  ws.pageSetup = { orientation: paisagem ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: "&L&A&RPágina &P de &N" };
}

export async function montarPlanilha(d: DadosPlanilha): Promise<Buffer> {
  const a = d.analise;
  const r = analisar(a);
  const id = a.identificacao;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estoque Bia";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const wsResumo = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  const wsCustos = wb.addWorksheet("Custos", { views: [{ state: "frozen", ySplit: 4 }] });
  const wsEnc = wb.addWorksheet("Encargos");
  const wsBdi = wb.addWorksheet("BDI e Tributos");
  const wsComp = wb.addWorksheet("Composição do Preço");
  const wsExeq = wb.addWorksheet("Exequibilidade");
  const wsDef = wb.addWorksheet("Defesa");
  const wsHab = wb.addWorksheet("Habilitação");
  const wsAnx = wb.addWorksheet("Anexos");

  /* ===================== ENCARGOS ===================== */
  titulo(wsEnc, "Encargos sociais e trabalhistas (mão de obra)", "Percentuais aplicados sobre o custo da mão de obra. O Grupo D é a incidência do Grupo A sobre os itens do Grupo B marcados como incidentes.", 4);
  wsEnc.columns = [{ width: 10 }, { width: 52 }, { width: 14 }, { width: 22 }];
  cabecalho(wsEnc, 4, ["Grupo", "Encargo", "Percentual", "Incide Grupo A?"]);
  let encTotalCell: string;
  let linhaEnc = 5;
  if (a.encargos.modo === "manual") {
    wsEnc.getRow(linhaEnc).values = ["—", "Percentual total informado manualmente", p(a.encargos.manualPercentual), ""];
    wsEnc.getCell(linhaEnc, 3).numFmt = PCT;
    bordas(wsEnc, 5, 5, 4);
    wsEnc.getCell(7, 2).value = "TOTAL DE ENCARGOS";
    wsEnc.getCell(7, 2).font = { bold: true };
    wsEnc.getCell(7, 3).value = f("C5", p(r.encargos.total));
    wsEnc.getCell(7, 3).numFmt = PCT;
    wsEnc.getCell(7, 3).font = { bold: true };
    encTotalCell = "C7";
  } else {
    const ini = linhaEnc;
    for (const e of a.encargos.itens) {
      wsEnc.getRow(linhaEnc).values = [e.grupo, e.descricao, p(e.percentual), e.grupo === "B" ? (e.incideGrupoA ? "Sim" : "Não") : ""];
      wsEnc.getCell(linhaEnc, 3).numFmt = PCT;
      linhaEnc++;
    }
    const fim = Math.max(linhaEnc - 1, ini);
    bordas(wsEnc, ini, fim, 4);
    const G = `$A$${ini}:$A$${fim}`;
    const C = `$C$${ini}:$C$${fim}`;
    const Dn = `$D$${ini}:$D$${fim}`;
    let l = fim + 2;
    const linhas: [string, ExcelJS.CellFormulaValue][] = [
      ["Grupo A — encargos sociais básicos", f(`SUMIF(${G},"A",${C})`, p(r.encargos.grupoA))],
      ["Grupo B — tempo não trabalhado", f(`SUMIF(${G},"B",${C})`, p(r.encargos.grupoB))],
      ["   Grupo B sobre os quais incide o Grupo A", f(`SUMIFS(${C},${G},"B",${Dn},"Sim")`, p(r.encargos.grupoB === 0 ? 0 : a.encargos.itens.filter((i) => i.grupo === "B" && i.incideGrupoA).reduce((s, i) => s + i.percentual, 0)))],
      ["Grupo C — indenizações", f(`SUMIF(${G},"C",${C})`, p(r.encargos.grupoC))],
    ];
    const celA = `C${l}`;
    const celBinc = `C${l + 2}`;
    linhas.forEach(([rot, v], i) => {
      wsEnc.getCell(l + i, 2).value = rot;
      wsEnc.getCell(l + i, 3).value = v;
      wsEnc.getCell(l + i, 3).numFmt = PCT;
    });
    l += linhas.length;
    wsEnc.getCell(l, 2).value = "Grupo D — Grupo A sobre Grupo B";
    wsEnc.getCell(l, 3).value = f(`${celA}*${celBinc}`, p(r.encargos.grupoD));
    wsEnc.getCell(l, 3).numFmt = PCT;
    const celD = `C${l}`;
    l += 1;
    wsEnc.getCell(l, 2).value = "TOTAL DE ENCARGOS";
    wsEnc.getCell(l, 2).font = { bold: true };
    wsEnc.getCell(l, 3).value = f(`${celA}+C${l - 4}+C${l - 2}+${celD}`, p(r.encargos.total));
    wsEnc.getCell(l, 3).numFmt = PCT;
    wsEnc.getCell(l, 3).font = { bold: true };
    encTotalCell = `C${l}`;
  }
  const encRef = ref("Encargos", `$${encTotalCell[0]}$${encTotalCell.slice(1)}`);

  /* ===================== CUSTOS ===================== */
  titulo(wsCustos, "Planilha de custos e formação de preços — custos diretos", `Quantidades totais do contrato. Na mão de obra o total inclui os encargos sociais: Total = Qtd × Custo unit. × (1 + Encargos). Demais categorias: Total = Qtd × Custo unit.`, 8);
  wsCustos.columns = [{ width: 6 }, { width: 50 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 18 }];
  cabecalho(wsCustos, 4, ["Item", "Descrição", "Categoria", "Un.", "Quantidade", "Custo unitário", "Encargos", "Total"]);
  const iniC = 5;
  let lc = iniC;
  a.insumos.forEach((i, n) => {
    const mo = i.categoria === "mao_de_obra";
    wsCustos.getRow(lc).values = [n + 1, i.descricao || "—", ROTULO_CAT[i.categoria], i.unidade, i.quantidade, i.custoUnitario, "", ""];
    wsCustos.getCell(lc, 5).numFmt = QTD;
    wsCustos.getCell(lc, 6).numFmt = BRL;
    if (mo) {
      wsCustos.getCell(lc, 7).value = i.encargosPercentual === null ? f(encRef, p(r.encargos.total)) : p(i.encargosPercentual);
      wsCustos.getCell(lc, 7).numFmt = PCT;
      wsCustos.getCell(lc, 8).value = f(`E${lc}*F${lc}*(1+G${lc})`, r.custos.linhas[i.id] ?? 0);
    } else {
      wsCustos.getCell(lc, 7).value = "—";
      wsCustos.getCell(lc, 7).alignment = { horizontal: "center" };
      wsCustos.getCell(lc, 8).value = f(`E${lc}*F${lc}`, r.custos.linhas[i.id] ?? 0);
    }
    wsCustos.getCell(lc, 8).numFmt = BRL;
    lc++;
  });
  const fimC = Math.max(lc - 1, iniC);
  bordas(wsCustos, iniC, fimC, 8);
  const CAT = `$C$${iniC}:$C$${fimC}`;
  const TOT = `$H$${iniC}:$H$${fimC}`;
  lc += 1;
  secao(wsCustos, lc, "Resumo dos custos diretos", 8);
  lc++;
  const subt: [CategoriaInsumo, number][] = [
    ["mao_de_obra", r.custos.maoDeObra],
    ["material", r.custos.materiais],
    ["equipamento", r.custos.equipamentos],
    ["outros", r.custos.outros],
  ];
  const iniS = lc;
  for (const [cat, val] of subt) {
    wsCustos.getCell(lc, 2).value = ROTULO_CAT[cat] + (cat === "mao_de_obra" ? " (com encargos)" : "");
    wsCustos.getCell(lc, 8).value = f(`SUMIF(${CAT},"${ROTULO_CAT[cat]}",${TOT})`, val);
    wsCustos.getCell(lc, 8).numFmt = BRL;
    lc++;
  }
  wsCustos.getCell(lc, 2).value = "CUSTO DIRETO TOTAL";
  wsCustos.getCell(lc, 2).font = { bold: true };
  wsCustos.getCell(lc, 8).value = f(`SUM(H${iniS}:H${lc - 1})`, r.custos.custoDireto);
  wsCustos.getCell(lc, 8).numFmt = BRL;
  wsCustos.getCell(lc, 8).font = { bold: true };
  const cdRef = ref("Custos", `$H$${lc}`);
  configurarImpressao(wsCustos);

  /* ===================== BDI E TRIBUTOS ===================== */
  const t = a.tributos;
  titulo(wsBdi, "BDI e tributos", "BDI = [(1 + AC + S + R + G) × (1 + DF) × (1 + L) ÷ (1 − I)] − 1 (fórmula do Acórdão TCU 2.622/2013-Plenário). Percentuais de despesas incidem sobre o custo direto; tributos sobre o preço de venda.", 3);
  wsBdi.columns = [{ width: 52 }, { width: 18 }, { width: 46 }];
  cabecalho(wsBdi, 4, ["Componente", "Percentual", "Observação"]);
  const linhasBdi: [string, number, string][] = [
    ["Administração central (AC)", a.bdi.administracaoCentral, "Sobre o custo direto"],
    ["Seguros (S)", a.bdi.seguro, "Sobre o custo direto"],
    ["Riscos (R)", a.bdi.risco, "Sobre o custo direto"],
    ["Garantia contratual (G)", a.bdi.garantia, "Sobre o custo direto"],
    ["Despesas financeiras (DF)", a.bdi.despesasFinanceiras, "Sobre custo direto + indiretos"],
    ["Lucro (L)", a.bdi.lucro, "Margem-alvo da empresa"],
  ];
  let lb = 5;
  linhasBdi.forEach(([rot, v, obs]) => {
    wsBdi.getRow(lb).values = [rot, p(v), obs];
    wsBdi.getCell(lb, 2).numFmt = PCT;
    lb++;
  });
  bordas(wsBdi, 5, lb - 1, 3);
  const [rAC, rS, rR, rG, rDF, rL] = [5, 6, 7, 8, 9, 10];
  lb++;
  secao(wsBdi, lb, `Tributos sobre o faturamento — regime: ${t.regime === "simples" ? "Simples Nacional" : "Lucro Presumido"}`, 3);
  lb++;
  const iniT = lb;
  if (t.regime === "simples") {
    wsBdi.getRow(lb).values = ["Alíquota efetiva do Simples Nacional (DAS)", p(t.simplesAliquota), "Já inclui PIS, COFINS, IRPJ, CSLL, CPP e ICMS/ISS"];
    lb++;
    wsBdi.getRow(lb).values = ["Outros tributos fora do DAS", p(t.outros), ""];
    wsBdi.getCell(iniT, 2).numFmt = PCT;
    wsBdi.getCell(lb, 2).numFmt = PCT;
    lb++;
    wsBdi.getCell(lb, 1).value = "CARGA TRIBUTÁRIA TOTAL (I)";
    wsBdi.getCell(lb, 1).font = { bold: true };
    wsBdi.getCell(lb, 2).value = f(`B${iniT}+B${iniT + 1}`, p(r.bdi.somaTributos));
  } else {
    const trib: [string, number][] = [
      ["PIS", t.pis],
      ["COFINS", t.cofins],
      ["ISS (municipal)", t.iss],
      ["ICMS", t.icms],
      ["CPRB", t.cprb],
      ["Outros", t.outros],
    ];
    trib.forEach(([rot, v]) => {
      wsBdi.getRow(lb).values = [rot, p(v), ""];
      wsBdi.getCell(lb, 2).numFmt = PCT;
      lb++;
    });
    const linhaIrpj: [string, number, number][] = [
      ["IRPJ", t.irpjAliquota, t.irpjPresuncao],
      ["CSLL", t.csllAliquota, t.csllPresuncao],
    ];
    const efetivos: string[] = [];
    for (const [rot, aliq, pres] of linhaIrpj) {
      wsBdi.getRow(lb).values = [`${rot} — alíquota`, p(aliq), ""];
      wsBdi.getCell(lb, 2).numFmt = PCT;
      wsBdi.getRow(lb + 1).values = [`${rot} — presunção sobre a receita`, p(pres), ""];
      wsBdi.getCell(lb + 1, 2).numFmt = PCT;
      wsBdi.getCell(lb + 2, 1).value = `${rot} efetivo (alíquota × presunção)`;
      wsBdi.getCell(lb + 2, 2).value = f(`B${lb}*B${lb + 1}`, p((aliq * pres) / 100));
      wsBdi.getCell(lb + 2, 2).numFmt = PCT;
      efetivos.push(`B${lb + 2}`);
      lb += 3;
    }
    wsBdi.getCell(lb, 1).value = "CARGA TRIBUTÁRIA TOTAL (I)";
    wsBdi.getCell(lb, 1).font = { bold: true };
    wsBdi.getCell(lb, 2).value = f(`SUM(B${iniT}:B${iniT + 5})+${efetivos.join("+")}`, p(r.bdi.somaTributos));
  }
  wsBdi.getCell(lb, 2).numFmt = PCT;
  wsBdi.getCell(lb, 2).font = { bold: true };
  const celI = `B${lb}`;
  bordas(wsBdi, iniT, lb, 3);
  lb += 2;
  secao(wsBdi, lb, "Resultado do BDI", 3);
  lb++;
  wsBdi.getCell(lb, 1).value = "BDI";
  wsBdi.getCell(lb, 1).font = { bold: true };
  wsBdi.getCell(lb, 2).value = f(`(1+B${rAC}+B${rS}+B${rR}+B${rG})*(1+B${rDF})*(1+B${rL})/(1-${celI})-1`, p(r.bdi.bdi));
  wsBdi.getCell(lb, 2).numFmt = PCT;
  wsBdi.getCell(lb, 2).font = { bold: true };
  const celBDI = `B${lb}`;
  lb++;
  wsBdi.getCell(lb, 1).value = "Preço de referência = Custo direto × (1 + BDI)";
  wsBdi.getCell(lb, 2).value = f(`${cdRef}*(1+${celBDI})`, r.precoReferencia);
  wsBdi.getCell(lb, 2).numFmt = BRL;
  configurarImpressao(wsBdi, false);
  const A = (c: string) => ref("BDI e Tributos", `$B$${c}`);
  const iRef = ref("BDI e Tributos", `$${celI[0]}$${celI.slice(1)}`);

  /* ===================== COMPOSIÇÃO DO PREÇO ===================== */
  titulo(wsComp, "Composição do preço ofertado", "Demonstra como o preço ofertado cobre custos, despesas, tributos e lucro. Todos os valores são fórmulas ligadas às planilhas de custos e de BDI.", 3);
  wsComp.columns = [{ width: 56 }, { width: 20 }, { width: 48 }];
  cabecalho(wsComp, 4, ["Item", "Valor", "Cálculo"]);
  const dec = r.decomposicao;
  const rows: [string, ExcelJS.CellValue, string, string?][] = [
    ["Preço ofertado", a.parametros.precoOfertado, "Informado nos parâmetros da licitação", BRL],
    ["(−) Tributos sobre o faturamento", f(`B5*${iRef}`, dec.tributos), "Preço × carga tributária (I)", BRL],
    ["(−) Custo direto", f(cdRef, dec.custoDireto), "Planilha de custos", BRL],
    ["(−) Custos indiretos (AC + S + R + G)", f(`B7*(${A(String(rAC))}+${A(String(rS))}+${A(String(rR))}+${A(String(rG))})`, dec.custosIndiretos), "Custo direto × (AC + S + R + G)", BRL],
    ["(−) Despesas financeiras", f(`(B7+B8)*${A(String(rDF))}`, dec.despesasFinanceiras), "(Custo direto + indiretos) × DF", BRL],
    ["= LUCRO LÍQUIDO", f("B5-B6-B7-B8-B9", dec.lucro), "Preço − tributos − custos − despesas", BRL],
    ["Margem líquida sobre o preço", f("IF(B5>0,B10/B5,0)", dec.margemSobrePreco / 100), "Lucro ÷ preço", PCT],
    ["Margem sobre o custo", f("IF((B7+B8+B9)>0,B10/(B7+B8+B9),0)", dec.margemSobreCusto / 100), "Lucro ÷ (custo direto + indiretos + despesas)", PCT],
    ["Preço de equilíbrio (lucro zero)", f(`(B7+B8+B9)/(1-${iRef})`, r.precoEquilibrio ?? 0), "Custos ÷ (1 − I)", BRL],
    ["Preço com a margem mínima desejada", f(`(B7+B8+B9)/(1-(${iRef}+${p(a.parametros.margemMinima)}))`, r.precoMargemMinima ?? 0), `Custos ÷ (1 − (I + ${a.parametros.margemMinima}%))`, BRL],
  ];
  rows.forEach(([rot, v, calc, fmt], i) => {
    const l = 5 + i;
    wsComp.getCell(l, 1).value = rot;
    wsComp.getCell(l, 2).value = v;
    wsComp.getCell(l, 3).value = calc;
    if (fmt) wsComp.getCell(l, 2).numFmt = fmt;
    if (rot.startsWith("=") || rot === "Preço ofertado") {
      wsComp.getCell(l, 1).font = { bold: true };
      wsComp.getCell(l, 2).font = { bold: true };
    }
  });
  bordas(wsComp, 5, 5 + rows.length - 1, 3);
  configurarImpressao(wsComp, false);

  /* ===================== EXEQUIBILIDADE ===================== */
  const par = a.parametros;
  titulo(wsExeq, "Análise de exequibilidade", "Lei 14.133/2021, art. 59, III, IV e §§2º e 4º; IN SEGES/ME 73/2022, art. 34 (bens e serviços em geral: abaixo de 50% do orçado é indício de inexequibilidade, sempre com diligência prévia); Súmula TCU 262.", 6);
  wsExeq.columns = [{ width: 44 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 22 }, { width: 18 }];
  cabecalho(wsExeq, 4, ["Parâmetro", "Valor", "", "", "", ""]);
  const crit = par.criterio === "percentual" ? "Percentual do orçamento" : par.criterio === "estatistico" ? "Estatístico (referência histórica)" : "O mais rigoroso entre os dois";
  const pr: [string, ExcelJS.CellValue, string?][] = [
    ["Tipo de objeto", NOMES_TIPO[par.tipo]],
    ["Valor estimado pela Administração", par.valorEstimado, BRL],
    ["Preço ofertado", par.precoOfertado, BRL],
    ["Preço ofertado como % do estimado", f("IF(B6>0,B7/B6,0)", r.percentualDoEstimado !== null ? r.percentualDoEstimado / 100 : 0), PCT],
    ["Limite de inexequibilidade adotado (% do estimado)", p(par.percentualInexequibilidade), PCT],
    ["Critério", crit],
    [
      "Limite de inexequibilidade em R$",
      par.criterio === "percentual" ? f("B6*B9", r.limiteLegal) : r.limiteLegal,
      BRL,
    ],
    ["Faixa de alerta (pontos percentuais acima do limite)", p(par.faixaAlertaPontos), PCT],
    ["Margem líquida mínima desejada", p(par.margemMinima), PCT],
    ["SITUAÇÃO EM RELAÇÃO AO LIMITE LEGAL", rotuloStatus(r.statusLegal)],
    ["VIABILIDADE ECONÔMICA (custos cobertos)", rotuloStatus(r.statusEconomico)],
    ["CONCLUSÃO GERAL", rotuloStatus(r.statusGeral)],
  ];
  pr.forEach(([rot, v, fmt], i) => {
    const l = 5 + i;
    wsExeq.getCell(l, 1).value = rot;
    wsExeq.getCell(l, 2).value = v;
    if (fmt) wsExeq.getCell(l, 2).numFmt = fmt;
    if (rot === rot.toUpperCase()) {
      wsExeq.getCell(l, 1).font = { bold: true };
      wsExeq.getCell(l, 2).font = { bold: true };
    }
  });
  bordas(wsExeq, 5, 5 + pr.length - 1, 2);
  let le = 5 + pr.length + 1;
  secao(wsExeq, le, "Simulação em cenários de preço (a situação é calculada pelo sistema; os valores de lucro e margem são fórmulas)", 6);
  le++;
  cabecalho(wsExeq, le, ["% do valor estimado", "Preço", "Lucro líquido", "Margem s/ preço", "Situação legal", "Viabilidade"]);
  le++;
  const iniCe = le;
  for (const c of r.cenarios) {
    wsExeq.getCell(le, 1).value = c.percentualDoEstimado / 100;
    wsExeq.getCell(le, 1).numFmt = PCT;
    wsExeq.getCell(le, 2).value = f(`$B$6*A${le}`, c.preco);
    wsExeq.getCell(le, 3).value = f(
      `B${le}*(1-${iRef})-(${cdRef}*(1+${A(String(rAC))}+${A(String(rS))}+${A(String(rR))}+${A(String(rG))})*(1+${A(String(rDF))}))`,
      c.lucro,
    );
    wsExeq.getCell(le, 4).value = f(`IF(B${le}>0,C${le}/B${le},0)`, c.margemSobrePreco / 100);
    wsExeq.getCell(le, 5).value = rotuloStatus(c.statusLegal);
    wsExeq.getCell(le, 6).value = rotuloStatus(c.statusEconomico);
    wsExeq.getCell(le, 2).numFmt = BRL;
    wsExeq.getCell(le, 3).numFmt = BRL;
    wsExeq.getCell(le, 4).numFmt = PCT;
    if (c.atual) for (let k = 1; k <= 6; k++) wsExeq.getCell(le, k).font = { bold: true };
    le++;
  }
  if (r.cenarios.length) bordas(wsExeq, iniCe, le - 1, 6);
  le++;
  if (a.concorrentes.length) {
    secao(wsExeq, le, "Propostas de concorrentes conhecidas", 6);
    le++;
    cabecalho(wsExeq, le, ["Licitante", "Valor", "% do estimado", "", "", ""]);
    le++;
    const ini = le;
    for (const c of a.concorrentes) {
      wsExeq.getCell(le, 1).value = c.nome || "—";
      wsExeq.getCell(le, 2).value = c.valor;
      wsExeq.getCell(le, 2).numFmt = BRL;
      wsExeq.getCell(le, 3).value = f(`IF($B$6>0,B${le}/$B$6,0)`, par.valorEstimado > 0 ? c.valor / par.valorEstimado : 0);
      wsExeq.getCell(le, 3).numFmt = PCT;
      le++;
    }
    bordas(wsExeq, ini, le - 1, 3);
    le++;
  }
  if (r.avisos.length) {
    secao(wsExeq, le, "Avisos da análise", 6);
    le++;
    for (const v of r.avisos) {
      wsExeq.mergeCells(le, 1, le, 6);
      wsExeq.getCell(le, 1).value = `• ${v}`;
      wsExeq.getCell(le, 1).alignment = { wrapText: true, vertical: "top" };
      wsExeq.getRow(le).height = 30;
      le++;
    }
  }
  configurarImpressao(wsExeq);

  /* ===================== DEFESA ===================== */
  titulo(wsDef, "Defesa de exequibilidade (minuta)", "Texto gerado a partir dos números desta planilha. Revise com seu assessor jurídico antes de protocolar.", 1);
  wsDef.columns = [{ width: 120 }];
  const minuta = gerarMinuta(a, r, new Date());
  let ld = 4;
  for (const linha of minuta.texto.split("\n")) {
    const c = wsDef.getCell(ld, 1);
    c.value = linha;
    c.alignment = { wrapText: true, vertical: "top" };
    if (/^[IVX]+ — /.test(linha)) c.font = { bold: true };
    // estima altura para linhas longas (a planilha não recalcula altura de célula com quebra)
    wsDef.getRow(ld).height = Math.max(15, Math.ceil(linha.length / 115) * 15);
    ld++;
  }
  configurarImpressao(wsDef, false);

  /* ===================== HABILITAÇÃO ===================== */
  titulo(wsHab, "Habilitação e prova de exequibilidade (Lei 14.133/2021, arts. 59 e 62 a 70)", "A Administração só pode exigir o que estiver no edital. Itens “se o edital exigir” podem não se aplicar.", 6);
  wsHab.columns = [{ width: 30 }, { width: 62 }, { width: 22 }, { width: 14 }, { width: 18 }, { width: 40 }];
  cabecalho(wsHab, 4, ["Grupo", "Item", "Base legal", "Situação", "Documentos no índice", "Observação"]);
  const todos = [...d.anexos, ...d.documentosEmpresa];
  let lh = 5;
  const iniH = lh;
  for (const g of CHECKLIST)
    for (const i of g.itens) {
      const docs = todos.filter((x) => x.item === i.chave).length;
      wsHab.getRow(lh).values = [
        g.titulo,
        i.titulo,
        i.base + (i.condicional ? " · se o edital exigir" : ""),
        d.checklist[i.chave]?.ok ? "Pronto" : "Pendente",
        docs,
        d.checklist[i.chave]?.obs ?? "",
      ];
      wsHab.getCell(lh, 4).font = { bold: true, color: { argb: d.checklist[i.chave]?.ok ? "FF047857" : "FFB45309" } };
      for (const c of [1, 2, 3, 6]) wsHab.getCell(lh, c).alignment = { wrapText: true, vertical: "top" };
      lh++;
    }
  bordas(wsHab, iniH, lh - 1, 6);
  lh++;
  wsHab.getCell(lh, 2).value = "Itens prontos";
  wsHab.getCell(lh, 4).value = f(`COUNTIF(D${iniH}:D${lh - 2},"Pronto")`, CHECKLIST.flatMap((g) => g.itens).filter((i) => d.checklist[i.chave]?.ok).length);
  wsHab.getCell(lh, 5).value = f(`"de "&COUNTA(D${iniH}:D${lh - 2})`, `de ${CHECKLIST.flatMap((g) => g.itens).length}`);
  wsHab.getCell(lh, 2).font = { bold: true };
  configurarImpressao(wsHab);

  /* ===================== ANEXOS ===================== */
  titulo(wsAnx, "Índice de anexos", "Junte os arquivos na ordem deste índice. Documentos da empresa (certidões, balanço, atestados) valem para todas as licitações.", 8);
  wsAnx.columns = [{ width: 6 }, { width: 48 }, { width: 28 }, { width: 28 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 38 }];
  cabecalho(wsAnx, 4, ["Nº", "Documento", "Tipo", "Emitido por", "Número", "Validade", "Situação", "Arquivo"]);
  const indice: { x: Anexo; origem: string }[] = [
    ...d.anexos.map((x) => ({ x, origem: "" })),
    ...d.documentosEmpresa.map((x) => ({ x, origem: " (empresa)" })),
  ];
  let la = 5;
  indice.forEach(({ x, origem }, n) => {
    const dias = diasParaVencer(x.validade);
    wsAnx.getRow(la).values = [
      n + 1,
      x.descricao + origem,
      rotuloCategoria(x.categoria),
      x.emissor ?? "",
      x.numero ?? "",
      x.validade ? formatDataBR(x.validade) : "—",
      dias === null ? "Sem validade" : dias < 0 ? "VENCIDO" : dias <= 30 ? `Vence em ${dias} d` : "Em dia",
      x.arquivo_nome,
    ];
    if (dias !== null && dias < 0) wsAnx.getCell(la, 7).font = { bold: true, color: { argb: "FFB91C1C" } };
    la++;
  });
  if (indice.length) bordas(wsAnx, 5, la - 1, 8);
  else wsAnx.getCell(5, 2).value = "Nenhum documento guardado.";
  configurarImpressao(wsAnx);

  /* ===================== RESUMO ===================== */
  titulo(wsResumo, "Planilha de custos e formação de preços — resumo", `${d.titulo}  ·  Emitida em ${new Date().toLocaleDateString("pt-BR")}`, 3);
  wsResumo.columns = [{ width: 46 }, { width: 28 }, { width: 60 }];
  const ident: [string, string][] = [
    ["Licitante", id.empresa || "—"],
    ["CNPJ", id.cnpj || "—"],
    ["Representante legal", id.representante || "—"],
    ["Órgão licitante", id.orgao || "—"],
    ["Edital / modalidade", id.edital || "—"],
    ["Processo administrativo", id.processo || "—"],
    ["Objeto", id.objeto || "—"],
    ["Cidade/UF", id.cidade || "—"],
    ["Data da sessão", formatDataBR(d.dataSessao)],
    ["Situação da licitação", rotuloStatusLicitacao(d.status)],
  ];
  secao(wsResumo, 4, "Identificação", 3);
  ident.forEach(([k, v], i) => {
    wsResumo.getCell(5 + i, 1).value = k;
    wsResumo.getCell(5 + i, 1).font = { bold: true };
    wsResumo.mergeCells(5 + i, 2, 5 + i, 3);
    wsResumo.getCell(5 + i, 2).value = v;
    wsResumo.getCell(5 + i, 2).alignment = { wrapText: true, vertical: "top" };
  });
  let lr = 5 + ident.length + 1;
  secao(wsResumo, lr, "Resultado (valores ligados às demais abas)", 3);
  lr++;
  const xr = (c: string) => ref("Exequibilidade", c);
  const cr = (c: string) => ref("Composição do Preço", c);
  const res: [string, ExcelJS.CellValue, string, string?][] = [
    ["Valor estimado pela Administração", f(xr("$B$6"), par.valorEstimado), BRL],
    ["Preço ofertado", f(xr("$B$7"), par.precoOfertado), BRL],
    ["Preço ofertado como % do estimado", f(xr("$B$8"), r.percentualDoEstimado !== null ? r.percentualDoEstimado / 100 : 0), PCT],
    ["Limite de inexequibilidade", f(xr("$B$11"), r.limiteLegal), BRL],
    ["Custo direto total", f(cdRef, r.custos.custoDireto), BRL],
    ["Encargos sociais (mão de obra)", f(encRef, p(r.encargos.total)), PCT],
    ["BDI", f(A(celBDI.slice(1)), p(r.bdi.bdi)), PCT],
    ["Carga tributária sobre o preço", f(iRef, p(r.bdi.somaTributos)), PCT],
    ["Lucro líquido", f(cr("$B$10"), dec.lucro), BRL],
    ["Margem líquida sobre o preço", f(cr("$B$11"), dec.margemSobrePreco / 100), PCT],
    ["Preço de equilíbrio (lucro zero)", f(cr("$B$13"), r.precoEquilibrio ?? 0), BRL],
    ["Situação em relação ao limite legal", rotuloStatus(r.statusLegal), ""],
    ["Viabilidade econômica", rotuloStatus(r.statusEconomico), ""],
    ["CONCLUSÃO", rotuloStatus(r.statusGeral), ""],
  ];
  const iniR = lr;
  res.forEach(([k, v, fmt], i) => {
    const l = lr + i;
    wsResumo.getCell(l, 1).value = k;
    wsResumo.getCell(l, 2).value = v;
    if (fmt) wsResumo.getCell(l, 2).numFmt = fmt;
    wsResumo.getCell(l, 2).alignment = { horizontal: "right" };
    if (k === "CONCLUSÃO") {
      wsResumo.getCell(l, 1).font = { bold: true };
      wsResumo.getCell(l, 2).font = { bold: true };
    }
  });
  bordas(wsResumo, iniR, lr + res.length - 1, 2);
  lr += res.length + 1;
  secao(wsResumo, lr, "Conteúdo das abas", 3);
  lr++;
  const abas = [
    ["Custos", "Insumos, quantidades, custos unitários e totais por categoria"],
    ["Encargos", "Encargos sociais e trabalhistas (Grupos A, B, C e D)"],
    ["BDI e Tributos", "Componentes do BDI, tributos e fórmula do BDI"],
    ["Composição do Preço", "Do preço ofertado ao lucro líquido, com ponto de equilíbrio"],
    ["Exequibilidade", "Limite legal, situação, cenários de preço e concorrentes"],
    ["Defesa", "Minuta da defesa de exequibilidade"],
    ["Habilitação", "Checklist de habilitação e prova de exequibilidade"],
    ["Anexos", "Índice dos documentos de prova"],
  ];
  abas.forEach(([n, desc], i) => {
    wsResumo.getCell(lr + i, 1).value = n;
    wsResumo.getCell(lr + i, 1).font = { bold: true };
    wsResumo.mergeCells(lr + i, 2, lr + i, 3);
    wsResumo.getCell(lr + i, 2).value = desc;
  });
  configurarImpressao(wsResumo, false);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
