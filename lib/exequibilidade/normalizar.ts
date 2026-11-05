import type { Analise } from "@/lib/exequibilidade/types";
import { analiseVazia, defesaPadrao, encargosPadrao } from "@/lib/exequibilidade/defaults";

/** Mescla dados salvos/importados com os padrões, tolerando versões antigas. */
export function normalizar(bruto: unknown): Analise | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Partial<Analise>;
  if (!b.parametros || !Array.isArray(b.insumos)) return null;
  const base = analiseVazia(b.parametros.tipo ?? "obras");
  return {
    ...base,
    ...b,
    versao: 1,
    identificacao: { ...base.identificacao, ...b.identificacao },
    parametros: { ...base.parametros, ...b.parametros },
    encargos: {
      ...base.encargos,
      ...b.encargos,
      itens: b.encargos?.itens?.length ? b.encargos.itens : encargosPadrao().itens,
    },
    bdi: { ...base.bdi, ...b.bdi },
    tributos: { ...base.tributos, ...b.tributos },
    concorrentes: Array.isArray(b.concorrentes) ? b.concorrentes : [],
    defesa: { ...defesaPadrao(), ...b.defesa },
  };
}
