import type { TipoLicitacao } from "@/lib/exequibilidade/types";

/**
 * "BDI" é termo de obras. Para fornecimento de bens e serviços em geral o mesmo cálculo é
 * apresentado como "taxa de despesas indiretas, tributos e lucro" (mesma fórmula do
 * Acórdão TCU 2.622/2013, usada aqui só como estrutura de cálculo).
 */
export function rotulosTaxa(tipo: TipoLicitacao) {
  if (tipo === "obras")
    return {
      sigla: "BDI",
      nome: "BDI (Benefícios e Despesas Indiretas)",
      aba: "BDI e tributos",
      planilha: "BDI e Tributos",
      formula: "BDI = [(1 + AC + S + R + G) × (1 + DF) × (1 + L) ÷ (1 − I)] − 1 (fórmula do Acórdão TCU 2.622/2013-Plenário)",
    };
  return {
    sigla: "Taxa",
    nome: "Taxa de despesas indiretas, tributos e lucro",
    aba: "Despesas, tributos e lucro",
    planilha: "Despesas Tributos e Lucro",
    formula:
      "Taxa = [(1 + AC + S + R + G) × (1 + DF) × (1 + L) ÷ (1 − I)] − 1 (mesma estrutura de cálculo do BDI do Acórdão TCU 2.622/2013, aplicada à venda de bens)",
  };
}
