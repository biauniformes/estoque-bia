import type { Insumo } from "@/lib/exequibilidade/types";
import { novoId } from "./defaults";

/** Ficha técnica simplificada de uma peça de uniforme. */
export interface FichaPeca {
  nome: string;
  /** Quantidade total da peça no edital. */
  quantidade: number;
  /** Consumo de tecido por peça (metros). */
  consumoTecidoM: number;
  precoTecidoM: number;
  /** Perda de corte/enfesto sobre o consumo (%). */
  perdaPercentual: number;
  /** Aviamentos por peça (linha, botão, zíper, etiqueta, elástico). R$ */
  aviamentos: number;
  /** Minutos de corte + costura + acabamento por peça. */
  minutosProducao: number;
  /** Salário-base por hora produtiva (sem encargos). */
  custoHora: number;
  /** Bordado / estampa / serigrafia por peça. R$ */
  personalizacao: number;
  /** Embalagem por peça. R$ */
  embalagem: number;
}

export const FICHA_VAZIA: FichaPeca = {
  nome: "",
  quantidade: 0,
  consumoTecidoM: 0,
  precoTecidoM: 0,
  perdaPercentual: 8,
  aviamentos: 0,
  minutosProducao: 0,
  custoHora: 0,
  personalizacao: 0,
  embalagem: 0,
};

/** Converte a ficha em linhas da planilha de custos (somente as com valor). */
export function insumosDaFicha(f: FichaPeca): Insumo[] {
  const n = f.nome.trim() || "Peça";
  const q = f.quantidade;
  const linha = (
    descricao: string,
    categoria: Insumo["categoria"],
    unidade: string,
    quantidade: number,
    custoUnitario: number,
  ): Insumo => ({
    id: novoId(),
    descricao: `${n} — ${descricao}`,
    categoria,
    unidade,
    quantidade,
    custoUnitario,
    encargosPercentual: null,
  });
  const r: Insumo[] = [];
  const metros = q * f.consumoTecidoM * (1 + f.perdaPercentual / 100);
  if (metros > 0 && f.precoTecidoM > 0)
    r.push(linha("tecido (com perda)", "material", "m", metros, f.precoTecidoM));
  if (q > 0 && f.aviamentos > 0)
    r.push(linha("aviamentos", "material", "un", q, f.aviamentos));
  const horas = (q * f.minutosProducao) / 60;
  if (horas > 0 && f.custoHora > 0)
    r.push(linha("corte, costura e acabamento", "mao_de_obra", "h", horas, f.custoHora));
  if (q > 0 && f.personalizacao > 0)
    r.push(linha("bordado/estampa", "outros", "un", q, f.personalizacao));
  if (q > 0 && f.embalagem > 0)
    r.push(linha("embalagem", "material", "un", q, f.embalagem));
  return r;
}
