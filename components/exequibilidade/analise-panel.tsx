"use client";

import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui";
import type { StatusExequibilidade } from "@/lib/exequibilidade/types";
import type { UseAnalise } from "@/hooks/use-analise-exequibilidade";
import { cn } from "@/lib/utils";
import { formatBRL, formatPct } from "@/lib/exequibilidade/format";
import { ComposicaoBarra } from "./bdi-panel";
import { ESTILO_STATUS, StatusBadge } from "./status-badge";

const MENSAGEM_LEGAL: Record<StatusExequibilidade, string> = {
  exequivel: "Preço acima do limite de inexequibilidade e da faixa de alerta.",
  alerta: "Preço acima do limite legal, mas na zona em que é provável diligência. Tenha a comprovação de custos pronta.",
  inexequivel: "Preço abaixo do limite legal: presunção (relativa) de inexequibilidade. Prepare a demonstração de exequibilidade.",
  acima_orcamento: "Preço acima do valor estimado: risco de desclassificação por sobrepreço (art. 59, III).",
  indefinido: "Informe valor estimado e preço ofertado.",
};

const MENSAGEM_ECON: Record<StatusExequibilidade, string> = {
  exequivel: "O preço cobre custos, despesas e tributos com a margem mínima desejada.",
  alerta: "O preço cobre os custos, mas a margem está abaixo do mínimo desejado.",
  inexequivel: "O preço NÃO cobre os custos: execução com prejuízo. Não é defensável em diligência.",
  acima_orcamento: "",
  indefinido: "Informe a planilha de custos para avaliar a viabilidade econômica.",
};

export function AnalisePanel({ ctx }: { ctx: UseAnalise }) {
  const { analise: a, resultado: r } = ctx;
  const d = r.decomposicao;
  const estGeral = ESTILO_STATUS[r.statusGeral];

  return (
    <div className="space-y-4">
      {r.avisos.length > 0 && (
        <Alert>
          <Info />
          <AlertTitle>Pendências</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {r.avisos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className={cn("rounded-xl border-2 p-4", estGeral.fundo)}>
        <div className="flex flex-wrap items-center gap-3">
          <estGeral.Icone className="size-7" aria-hidden />
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">Veredito geral (legal + econômico)</div>
            <div className="text-xl font-bold">{estGeral.rotulo}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              Conformidade legal <StatusBadge status={r.statusLegal} />
            </CardTitle>
            <CardDescription>{MENSAGEM_LEGAL[r.statusLegal]}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Regua r={r} estimado={a.parametros.valorEstimado} preco={a.parametros.precoOfertado} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <Linha k="Preço ofertado" v={formatBRL(a.parametros.precoOfertado)} />
              <Linha k="% do estimado" v={r.percentualDoEstimado !== null ? formatPct(r.percentualDoEstimado) : "—"} />
              <Linha k="Limite de inexequibilidade" v={formatBRL(r.limiteLegal)} />
              <Linha k="Início da zona segura" v={formatBRL(r.limiteAlerta)} />
              <Linha
                k="Folga sobre o limite"
                v={a.parametros.precoOfertado > 0 && r.limiteLegal > 0 ? formatBRL(a.parametros.precoOfertado - r.limiteLegal) : "—"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              Viabilidade econômica <StatusBadge status={r.statusEconomico} />
            </CardTitle>
            <CardDescription>{MENSAGEM_ECON[r.statusEconomico]}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ComposicaoBarra d={d} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <Linha k="Lucro no preço ofertado" v={formatBRL(d.lucro)} forte cor={d.lucro < 0 ? "text-red-700" : "text-emerald-700"} />
              <Linha k="Margem sobre o preço" v={formatPct(d.margemSobrePreco)} />
              <Linha k="Margem sobre o custo" v={formatPct(d.margemSobreCusto)} />
              <Linha k="Preço de equilíbrio" v={r.precoEquilibrio !== null ? formatBRL(r.precoEquilibrio) : "—"} />
              <Linha k={`Preço p/ margem de ${formatPct(a.parametros.margemMinima, 1)}`} v={r.precoMargemMinima !== null ? formatBRL(r.precoMargemMinima) : "—"} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Faixa de lance recomendada</CardTitle>
          <CardDescription>
            Piso = maior valor entre o limite legal e o preço que preserva sua margem mínima. Teto = valor estimado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {r.pisoRecomendado === null ? (
            <p className="text-sm text-muted-foreground">Informe o valor estimado e a planilha de custos.</p>
          ) : r.faixaViavel ? (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-6">
              <div>
                <div className="text-xs text-muted-foreground">Menor lance seguro</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-700">{formatBRL(r.pisoRecomendado)}</div>
              </div>
              <div className="text-sm text-muted-foreground">
                até {formatBRL(a.parametros.valorEstimado)} · piso equivale a{" "}
                {formatPct((r.pisoRecomendado / a.parametros.valorEstimado) * 100)} do estimado
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-red-700">
              Não há faixa viável: o piso necessário ({formatBRL(r.pisoRecomendado)}) supera o valor estimado. Com estes
              custos e margem mínima, a contratação não fecha dentro do orçamento da Administração.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cenários de lance</CardTitle>
          <CardDescription>Simulação do mesmo custo em diferentes percentuais do valor estimado.</CardDescription>
        </CardHeader>
        <CardContent>
          {r.cenarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Informe o valor estimado para simular.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>% do estimado</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead>Legal</TableHead>
                    <TableHead>Econômico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.cenarios.map((c) => (
                    <TableRow key={`${c.percentualDoEstimado}-${c.atual}`} className={cn(c.atual && "bg-primary/5 font-semibold")}>
                      <TableCell className="tabular-nums">
                        {formatPct(c.percentualDoEstimado, c.atual ? 2 : 0)} {c.atual && <span className="text-xs">(seu preço)</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(c.preco)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", c.lucro < 0 && "text-red-700")}>{formatBRL(c.lucro)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPct(c.margemSobrePreco, 1)}</TableCell>
                      <TableCell><StatusBadge status={c.statusLegal} /></TableCell>
                      <TableCell><StatusBadge status={c.statusEconomico} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Ferramenta de apoio à decisão. O resultado depende dos dados informados e das regras do edital; não substitui a
        análise jurídica e contábil. Confira a redação vigente da Lei 14.133/2021 e a jurisprudência aplicável.
      </p>
    </div>
  );
}

function Linha({ k, v, forte, cor }: { k: string; v: string; forte?: boolean; cor?: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn("text-right tabular-nums", forte && "font-semibold", cor)}>{v}</dd>
    </>
  );
}

/** Régua 0–110% do orçamento com limite, alerta e posição do preço. */
function Regua({
  r,
  estimado,
  preco,
}: {
  r: UseAnalise["resultado"];
  estimado: number;
  preco: number;
}) {
  if (estimado <= 0) return null;
  const max = Math.max(1.1 * estimado, preco * 1.02);
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div className="pt-6 pb-5">
      <div className="relative h-3 w-full overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0 bg-red-300" style={{ width: pos(r.limiteLegal) }} />
        <div className="absolute inset-y-0 bg-amber-300" style={{ left: pos(r.limiteLegal), width: `calc(${pos(r.limiteAlerta)} - ${pos(r.limiteLegal)})` }} />
        <div className="absolute inset-y-0 bg-emerald-300" style={{ left: pos(r.limiteAlerta), width: `calc(${pos(estimado)} - ${pos(r.limiteAlerta)})` }} />
        <div className="absolute inset-y-0 right-0 bg-red-300" style={{ left: pos(estimado) }} />
      </div>
      {preco > 0 && (
        <div className="absolute" />
      )}
      <div className="relative -mt-[1.15rem] h-0">
        {preco > 0 && (
          <div className="absolute -top-3 -translate-x-1/2" style={{ left: pos(preco) }}>
            <div className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">Seu preço</div>
            <div className="mx-auto h-5 w-0.5 bg-foreground" />
          </div>
        )}
      </div>
      <div className="relative mt-4 h-4 text-[10px] text-muted-foreground">
        <span className="absolute -translate-x-1/2" style={{ left: pos(r.limiteLegal) }}>limite</span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(estimado) }}>estimado</span>
      </div>
    </div>
  );
}
