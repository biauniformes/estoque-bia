"use client";

import { Badge } from "./ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import type { ParametrosBDI, Tributos } from "@/lib/exequibilidade/types";
import type { UseAnalise } from "@/hooks/use-analise-exequibilidade";
import { formatBRL, formatPct } from "@/lib/exequibilidade/format";
import { Campo, NumberField, SelectField } from "./fields";
import { rotulosTaxa } from "@/lib/exequibilidade/rotulos";

const CAMPOS_BDI: { chave: keyof ParametrosBDI; rotulo: string; sigla: string }[] = [
  { chave: "administracaoCentral", rotulo: "Administração central", sigla: "AC" },
  { chave: "seguro", rotulo: "Seguros", sigla: "S" },
  { chave: "risco", rotulo: "Riscos", sigla: "R" },
  { chave: "garantia", rotulo: "Garantia contratual", sigla: "G" },
  { chave: "despesasFinanceiras", rotulo: "Despesas financeiras", sigla: "DF" },
  { chave: "lucro", rotulo: "Lucro (margem-alvo)", sigla: "L" },
];

const CAMPOS_TRIBUTOS: { chave: keyof Tributos; rotulo: string }[] = [
  { chave: "pis", rotulo: "PIS" },
  { chave: "cofins", rotulo: "COFINS" },
  { chave: "iss", rotulo: "ISS (municipal)" },
  { chave: "icms", rotulo: "ICMS (fornecimento)" },
  { chave: "cprb", rotulo: "CPRB" },
  { chave: "outros", rotulo: "Outros (ex.: DAS efetivo)" },
];

export function BdiPanel({ ctx }: { ctx: UseAnalise }) {
  const { analise: a, resultado: r, atualizar } = ctx;
  const setBdi = (patch: Partial<ParametrosBDI>) =>
    atualizar((x) => ({ ...x, bdi: { ...x.bdi, ...patch } }));
  const setTrib = (patch: Partial<Tributos>) =>
    atualizar((x) => ({ ...x, tributos: { ...x.tributos, ...patch } }));
  const t = a.tributos;
  const d = r.decomposicao;
  const rt = rotulosTaxa(a.parametros.tipo);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Despesas indiretas e lucro</CardTitle>
          <CardDescription>
            Percentuais aplicados sobre o custo direto (o custo de fazer o uniforme). Use os percentuais reais da
            empresa e guarde a memória de cálculo (despesas, folha, contabilidade) para comprovar.
            {a.parametros.tipo !== "obras" &&
              " A conta usa a mesma estrutura do BDI de obras (Acórdão TCU 2.622/2013), mas as faixas daquele acórdão não se aplicam à venda de uniformes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {CAMPOS_BDI.map((c) => (
            <Campo key={c.chave} rotulo={`${c.rotulo} (${c.sigla})`} htmlFor={`bdi-${c.chave}`}>
              <NumberField id={`bdi-${c.chave}`} suffix="%" value={a.bdi[c.chave]} onChange={(v) => setBdi({ [c.chave]: v })} />
            </Campo>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tributos sobre o faturamento</CardTitle>
          <CardDescription>
            Escolha o regime da empresa. No Lucro Presumido o adicional de IRPJ (10%) não é considerado. No Simples
            Nacional use a alíquota efetiva do DAS (já inclui PIS, COFINS, IRPJ, CSLL, CPP e ICMS/ISS do anexo da
            atividade); confirme com seu contador.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Regime tributário" htmlFor="regime" className="sm:col-span-2">
            <SelectField
              id="regime"
              value={t.regime}
              opcoes={[
                { value: "presumido", label: "Lucro Presumido" },
                { value: "simples", label: "Simples Nacional" },
              ]}
              onChange={(v) => setTrib({ regime: v })}
            />
          </Campo>
          {t.regime === "simples" ? (
            <>
              <Campo rotulo="Alíquota efetiva do Simples (DAS)" htmlFor="simples-a" dica="Alíquota efetiva da faixa de receita bruta dos últimos 12 meses.">
                <NumberField id="simples-a" suffix="%" value={t.simplesAliquota} onChange={(v) => setTrib({ simplesAliquota: v })} />
              </Campo>
              <Campo rotulo="Outros (ex.: ICMS-ST, tributos fora do DAS)" htmlFor="trib-outros">
                <NumberField id="trib-outros" suffix="%" value={t.outros} onChange={(v) => setTrib({ outros: v })} />
              </Campo>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm sm:col-span-2">
                Carga total (I) <b className="tabular-nums">{formatPct(r.bdi.somaTributos)}</b>
              </div>
            </>
          ) : (
            <>
              {CAMPOS_TRIBUTOS.map((c) => (
                <Campo key={c.chave} rotulo={c.rotulo} htmlFor={`trib-${c.chave}`}>
                  <NumberField id={`trib-${c.chave}`} suffix="%" value={t[c.chave] as number} onChange={(v) => setTrib({ [c.chave]: v })} />
                </Campo>
              ))}
              <Campo rotulo="IRPJ — alíquota" htmlFor="irpj-a"><NumberField id="irpj-a" suffix="%" value={t.irpjAliquota} onChange={(v) => setTrib({ irpjAliquota: v })} /></Campo>
              <Campo rotulo="IRPJ — presunção sobre receita" htmlFor="irpj-p"><NumberField id="irpj-p" suffix="%" value={t.irpjPresuncao} onChange={(v) => setTrib({ irpjPresuncao: v })} /></Campo>
              <Campo rotulo="CSLL — alíquota" htmlFor="csll-a"><NumberField id="csll-a" suffix="%" value={t.csllAliquota} onChange={(v) => setTrib({ csllAliquota: v })} /></Campo>
              <Campo rotulo="CSLL — presunção sobre receita" htmlFor="csll-p"><NumberField id="csll-p" suffix="%" value={t.csllPresuncao} onChange={(v) => setTrib({ csllPresuncao: v })} /></Campo>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm sm:col-span-2">
                IRPJ efetivo <b className="tabular-nums">{formatPct(r.bdi.irpjEfetivo)}</b> · CSLL efetiva{" "}
                <b className="tabular-nums">{formatPct(r.bdi.csllEfetivo)}</b> · Carga total (I){" "}
                <b className="tabular-nums">{formatPct(r.bdi.somaTributos)}</b>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {a.parametros.tipo === "obras" ? "Resultado do BDI" : rt.nome}
            {r.bdi.valido ? (
              <Badge className="tabular-nums">{rt.sigla} {formatPct(r.bdi.bdi)}</Badge>
            ) : (
              <Badge variant="destructive">Inválido</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {rt.formula}.
            {a.parametros.tipo !== "obras" && " Em palavras simples: quanto é preciso somar ao custo do uniforme para pagar as despesas da empresa, os impostos e ainda sobrar o lucro."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!r.bdi.valido && <p className="text-sm text-red-700">{r.bdi.erro}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Resumo rotulo="Custo direto" valor={formatBRL(r.custos.custoDireto)} />
            <Resumo rotulo={`Preço de referência (custo direto × (1 + ${rt.sigla}))`} valor={formatBRL(r.precoReferencia)} destaque />
            <Resumo rotulo="Preço de equilíbrio (lucro zero)" valor={r.precoEquilibrio !== null ? formatBRL(r.precoEquilibrio) : "—"} />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Composição do preço ofertado ({formatBRL(d.preco)})</h4>
            <ComposicaoBarra d={d} largo />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? "border-primary/40 bg-primary/5" : "bg-muted/40"}`}>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

export function ComposicaoBarra({ d, largo = false }: { d: import("@/lib/exequibilidade/types").DecomposicaoPreco; largo?: boolean }) {
  if (d.preco <= 0) return <p className="text-sm text-muted-foreground">Informe o preço ofertado para ver a composição.</p>;
  const positivo = Math.max(d.lucro, 0);
  const partes = [
    { nome: "Custo direto", valor: d.custoDireto, cor: "bg-slate-600" },
    { nome: "Custos indiretos", valor: d.custosIndiretos, cor: "bg-slate-400" },
    { nome: "Desp. financeiras", valor: d.despesasFinanceiras, cor: "bg-sky-500" },
    { nome: "Tributos", valor: d.tributos, cor: "bg-amber-500" },
    { nome: d.lucro < 0 ? "Prejuízo" : "Lucro", valor: positivo, cor: "bg-emerald-600" },
  ];
  const soma = partes.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Composição do preço">
        {partes.map((p) => (
          <div key={p.nome} className={p.cor} style={{ width: `${(p.valor / soma) * 100}%` }} title={`${p.nome}: ${formatBRL(p.valor)}`} />
        ))}
      </div>
      <ul className={`grid grid-cols-1 gap-x-6 gap-y-1 text-xs ${largo ? "sm:grid-cols-2 lg:grid-cols-5" : ""}`}>
        {partes.map((p) => (
          <li key={p.nome} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${p.cor}`} />
              {p.nome}
            </span>
            <span className="tabular-nums">{formatBRL(p.nome === "Prejuízo" ? d.lucro : p.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
