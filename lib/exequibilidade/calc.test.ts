import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mini `expect` (o projeto não usa vitest): cobre só o que estes testes precisam. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expect(v: any) {
  return {
    toBe: (e: unknown) => assert.equal(v, e),
    toBeNull: () => assert.equal(v, null),
    toHaveLength: (n: number) => assert.equal(v.length, n),
    toBeGreaterThan: (n: number) => assert.ok(v > n, `${v} > ${n}`),
    toBeLessThan: (n: number) => assert.ok(v < n, `${v} < ${n}`),
    toBeCloseTo: (e: number, d = 2) => assert.ok(Math.abs(v - e) < 10 ** -d / 2, `${v} ≈ ${e}`),
  };
}
import {
  analisar,
  calcularBDI,
  calcularEncargos,
  limiteEstatistico,
  precoParaMargem,
  statusLegal,
} from "./calc";
import { analiseVazia, encargosPadrao, exemplo } from "./defaults";
import { parseNumeroBR } from "./format";
import { FICHA_VAZIA, insumosDaFicha } from "./pecas";

describe("encargos sociais", () => {
  it("soma A+B+C+D com reincidência do grupo A sobre B", () => {
    const r = calcularEncargos(encargosPadrao());
    expect(r.grupoA).toBeCloseTo(36.8, 6);
    expect(r.grupoB).toBeCloseTo(21.14, 6);
    expect(r.grupoC).toBeCloseTo(5.5, 6);
    expect(r.grupoD).toBeCloseTo((36.8 * 21.14) / 100, 6);
    expect(r.total).toBeCloseTo(36.8 + 21.14 + 5.5 + (36.8 * 21.14) / 100, 6);
  });
  it("modo manual usa o percentual informado", () => {
    const e = { ...encargosPadrao(), modo: "manual" as const, manualPercentual: 82.5 };
    expect(calcularEncargos(e).total).toBe(82.5);
  });
});

describe("BDI (Acórdão TCU 2.622/2013)", () => {
  it("calcula a fórmula completa", () => {
    const a = analiseVazia("obras");
    const r = calcularBDI(a.bdi, a.tributos);
    const manual =
      (((1 + 0.0607) * 1.0123 * 1.074) / (1 - 0.0893) - 1) * 100;
    expect(r.valido).toBe(true);
    expect(r.somaTributos).toBeCloseTo(8.93, 6);
    expect(r.bdi).toBeCloseTo(manual, 6);
    expect(r.bdi).toBeGreaterThan(26);
    expect(r.bdi).toBeLessThan(27);
  });
  it("rejeita tributos >= 100%", () => {
    const a = analiseVazia("obras");
    const r = calcularBDI(a.bdi, { ...a.tributos, outros: 100 });
    expect(r.valido).toBe(false);
  });
});

describe("análise integrada", () => {
  it("no preço de referência o lucro é exatamente o lucro-alvo do BDI", () => {
    const a = exemplo();
    const base = analisar(a);
    const ref = base.precoReferencia;
    const r = analisar({ ...a, parametros: { ...a.parametros, precoOfertado: ref } });
    const d = r.decomposicao;
    const custoTotal = d.custoDireto + d.custosIndiretos + d.despesasFinanceiras;
    expect(d.lucro / custoTotal).toBeCloseTo(a.bdi.lucro / 100, 9);
    expect(d.preco - d.tributos - custoTotal - d.lucro).toBeCloseTo(0, 6);
  });
  it("preço de equilíbrio zera o lucro; preço de margem mínima entrega a margem", () => {
    const a = exemplo();
    const r = analisar(a);
    const eq = r.precoEquilibrio!;
    const re = analisar({ ...a, parametros: { ...a.parametros, precoOfertado: eq } });
    expect(re.decomposicao.lucro).toBeCloseTo(0, 6);
    const pm = r.precoMargemMinima!;
    const rm = analisar({ ...a, parametros: { ...a.parametros, precoOfertado: pm } });
    expect(rm.decomposicao.margemSobrePreco).toBeCloseTo(a.parametros.margemMinima, 6);
  });
  it("custo direto soma mão de obra com encargos e demais categorias", () => {
    const a = exemplo();
    const r = analisar(a);
    const enc = r.encargos.total;
    let esperado = 0;
    for (const i of a.insumos) {
      const b = i.quantidade * i.custoUnitario;
      esperado += i.categoria === "mao_de_obra" ? b * (1 + enc / 100) : b;
    }
    expect(r.custos.custoDireto).toBeCloseTo(esperado, 6);
    expect(r.custos.maoDeObra).toBeGreaterThan(0);
  });
  it("ficha técnica gera tecido com perda, mão de obra em horas e demais linhas", () => {
    const l = insumosDaFicha({
      ...FICHA_VAZIA,
      nome: "Camiseta",
      quantidade: 1000,
      consumoTecidoM: 0.9,
      precoTecidoM: 20,
      perdaPercentual: 10,
      aviamentos: 1,
      minutosProducao: 12,
      custoHora: 10,
      personalizacao: 2,
      embalagem: 0.5,
    });
    expect(l).toHaveLength(5);
    expect(l[0].quantidade).toBeCloseTo(990, 6);
    const mo = l.find((x) => x.categoria === "mao_de_obra")!;
    expect(mo.quantidade).toBeCloseTo(200, 6);
    expect(insumosDaFicha(FICHA_VAZIA)).toHaveLength(0);
  });
});

describe("conformidade legal", () => {
  const E = 1_000_000;
  const lim = 750_000;
  const al = 850_000;
  it("classifica nas faixas", () => {
    expect(statusLegal(1_000_000.01, E, lim, al)).toBe("acima_orcamento");
    expect(statusLegal(1_000_000, E, lim, al)).toBe("exequivel");
    expect(statusLegal(850_000, E, lim, al)).toBe("exequivel");
    expect(statusLegal(849_999.99, E, lim, al)).toBe("alerta");
    expect(statusLegal(750_000, E, lim, al)).toBe("alerta");
    expect(statusLegal(749_999.99, E, lim, al)).toBe("inexequivel");
    expect(statusLegal(0, E, lim, al)).toBe("indefinido");
  });
  it("critério estatístico: 70% do menor entre média (>50%) e orçamento", () => {
    const r = limiteEstatistico(1_000_000, [400_000, 800_000, 900_000]);
    expect(r!.base).toBeCloseTo(850_000, 6);
    expect(r!.limite).toBeCloseTo(595_000, 6);
    expect(limiteEstatistico(1_000_000, [100_000])).toBeNull();
  });
  it("precoParaMargem retorna null sem custos", () => {
    const a = analiseVazia();
    expect(precoParaMargem(0, a.bdi, 8, 3)).toBeNull();
  });
});

describe("parser pt-BR", () => {
  it("interpreta formatos comuns", () => {
    expect(parseNumeroBR("1.234,56")).toBe(1234.56);
    expect(parseNumeroBR("R$ 1.234.567,89")).toBe(1234567.89);
    expect(parseNumeroBR("1234.56")).toBe(1234.56);
    expect(parseNumeroBR("12,5%")).toBe(12.5);
    expect(parseNumeroBR("")).toBeNull();
  });
});
