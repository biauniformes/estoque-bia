import { describe, it } from "node:test";
import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expect(v: any) {
  return {
    toBe: (e: unknown) => assert.equal(v, e),
    toBeNull: () => assert.equal(v, null),
    toContain: (e: unknown) => assert.ok(v.includes(e), `${JSON.stringify(v)} contém ${e}`),
    toBeGreaterThan: (n: number) => assert.ok(v > n, `${v} > ${n}`),
    toBeCloseTo: (e: number, d = 2) => assert.ok(Math.abs(v - e) < 10 ** -d / 2, `${v} ≈ ${e}`),
  };
}
import { aplicarCotacoes, problemasCotacoes, resumoCotacoes, valorPorCriterio } from "./cotacoes";
import { analiseVazia, exemplo } from "./defaults";
import { analisar } from "./calc";
import { nivelPrazo, textoContagem, type Prazo } from "./licitacao";
import type { Insumo } from "./types";

const hoje = new Date(2026, 10, 6);
const cot = (valor: number, data = "2026-11-01", anexoId: string | null = "x") => ({ id: String(valor), fornecedor: `F${valor}`, data, valor, anexoId });
const insumo = (patch: Partial<Insumo> = {}): Insumo => ({
  id: "i1",
  descricao: "Malha PV",
  categoria: "material",
  unidade: "m",
  quantidade: 100,
  custoUnitario: 0,
  encargosPercentual: null,
  ...patch,
});

describe("quadro de cotações", () => {
  it("calcula menor, mediana, média, maior e variação", () => {
    const r = resumoCotacoes([cot(17), cot(18.5), cot(22)], hoje)!;
    expect(r.n).toBe(3);
    expect(r.menor).toBe(17);
    expect(r.mediana).toBe(18.5);
    expect(r.maior).toBe(22);
    expect(r.media).toBeCloseTo(19.1667, 3);
    expect(r.cv).toBeGreaterThan(10);
    expect(r.maisAntigaDias).toBe(5);
  });

  it("mediana de quantidade par e cotações sem valor ignoradas", () => {
    const r = resumoCotacoes([cot(10), cot(20), cot(0), cot(30), cot(40)], hoje)!;
    expect(r.n).toBe(4);
    expect(r.mediana).toBe(25);
  });

  it("aplica o critério no custo unitário e respeita o manual", () => {
    const cs = [cot(17), cot(18.5), cot(22)];
    expect(aplicarCotacoes(insumo({ cotacoes: cs })).custoUnitario).toBe(17);
    expect(aplicarCotacoes(insumo({ cotacoes: cs, criterioCotacao: "mediana" })).custoUnitario).toBe(18.5);
    expect(aplicarCotacoes(insumo({ cotacoes: cs, criterioCotacao: "media" })).custoUnitario).toBe(19.17);
    expect(aplicarCotacoes(insumo({ cotacoes: cs, criterioCotacao: "manual", custoUnitario: 15 })).custoUnitario).toBe(15);
    expect(valorPorCriterio(null, "menor")).toBeNull();
  });

  it("aponta custo sem prova, cotação antiga, poucas cotações e falta de documento", () => {
    const a = analiseVazia();
    a.insumos = [
      insumo({ id: "a", custoUnitario: 15, criterioCotacao: "manual", cotacoes: [cot(17), cot(18.5), cot(22)] }),
      insumo({ id: "b", descricao: "Aviamento", custoUnitario: 2 }),
      insumo({ id: "c", descricao: "Zíper", custoUnitario: 3, cotacoes: [cot(3, "2026-01-02", null)] }),
      insumo({ id: "d", descricao: "Costura", categoria: "mao_de_obra", custoUnitario: 9 }),
    ];
    const tipos = problemasCotacoes(a, hoje).map((p) => `${p.insumoId}:${p.tipo}`);
    expect(tipos).toContain("a:abaixo_menor");
    expect(tipos).toContain("b:sem_cotacao");
    expect(tipos).toContain("c:poucas");
    expect(tipos).toContain("c:antiga");
    expect(tipos).toContain("c:sem_documento");
    expect(tipos.some((t) => t.startsWith("d:"))).toBe(false);
    expect(analisar(a).avisos.some((v) => v.includes("abaixo da menor cotação"))).toBe(true);
  });

  it("o exemplo usa a menor cotação como custo", () => {
    const e = exemplo();
    const malha = e.insumos[0];
    expect(malha.cotacoes?.length).toBe(3);
    expect(malha.custoUnitario).toBe(resumoCotacoes(malha.cotacoes)!.menor);
  });
});

describe("prazos", () => {
  const p = (quando: string, concluido = false): Prazo => ({ id: "p", tipo: "diligencia", descricao: "", quando, concluido });
  const agora = new Date(2026, 10, 6, 10, 0).getTime();
  it("classifica e conta o tempo", () => {
    expect(nivelPrazo(p("2026-11-06T12:00"), agora)).toBe("urgente");
    expect(textoContagem(p("2026-11-06T12:30"), agora)).toBe("faltam 2 h 30 min");
    expect(nivelPrazo(p("2026-11-06T09:00"), agora)).toBe("vencido");
    expect(textoContagem(p("2026-11-06T09:00"), agora)).toBe("vencido há 1 h");
    expect(nivelPrazo(p("2026-11-10T09:00"), agora)).toBe("proximo");
    expect(nivelPrazo(p("2026-12-10T09:00"), agora)).toBe("futuro");
    expect(nivelPrazo(p("2026-11-06T09:00", true), agora)).toBe("concluido");
  });
});
