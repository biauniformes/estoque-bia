"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import type { CriterioInexequibilidade, TipoLicitacao } from "@/lib/exequibilidade/types";
import type { UseAnalise } from "@/hooks/use-analise-exequibilidade";
import { NOMES_TIPO, novoId } from "@/lib/exequibilidade/defaults";
import { formatBRL, formatPct } from "@/lib/exequibilidade/format";
import { Campo, NumberField, SelectField, TextoField } from "./fields";

const OPCOES_TIPO = (Object.keys(NOMES_TIPO) as TipoLicitacao[]).map((value) => ({
  value,
  label: NOMES_TIPO[value],
}));

const OPCOES_CRITERIO: { value: CriterioInexequibilidade; label: string }[] = [
  { value: "percentual", label: "Percentual do orçamento (art. 59, §4º / edital)" },
  { value: "estatistico", label: "Estatístico (média das propostas, ref. Lei 8.666)" },
  { value: "mais_rigoroso", label: "O mais rigoroso entre os dois" },
];

export function ParametrosPanel({ ctx }: { ctx: UseAnalise }) {
  const { analise: a, resultado: r, atualizar, trocarTipo } = ctx;
  const p = a.parametros;
  const id = a.identificacao;

  const setP = (patch: Partial<typeof p>) =>
    atualizar((x) => ({ ...x, parametros: { ...x.parametros, ...patch } }));
  const setId = (patch: Partial<typeof id>) =>
    atualizar((x) => ({ ...x, identificacao: { ...x.identificacao, ...patch } }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Parâmetros da licitação</CardTitle>
          <CardDescription>
            Defina o tipo de objeto, o orçamento da Administração e o preço que você ofertou.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo de licitação" className="sm:col-span-2" htmlFor="tipo"
            dica="Ao trocar o tipo, o sistema aplica o percentual legal, o BDI e os tributos de partida desse tipo (revise-os).">
            <SelectField id="tipo" value={p.tipo} opcoes={OPCOES_TIPO} onChange={trocarTipo} />
          </Campo>
          <Campo rotulo="Valor estimado pela Administração" htmlFor="estimado">
            <NumberField id="estimado" prefix="R$" value={p.valorEstimado} onChange={(v) => setP({ valorEstimado: v })} />
          </Campo>
          <Campo rotulo="Preço ofertado pela empresa" htmlFor="ofertado">
            <NumberField id="ofertado" prefix="R$" value={p.precoOfertado} onChange={(v) => setP({ precoOfertado: v })} />
          </Campo>
          <Campo
            rotulo="Limite de inexequibilidade (% do orçamento)"
            htmlFor="limite"
            dica={
              p.tipo === "obras"
                ? "Lei 14.133/2021, art. 59, §4º: 75% para obras e serviços de engenharia."
                : "A lei não fixa percentual para este objeto: use o previsto no edital."
            }
          >
            <NumberField id="limite" suffix="%" value={p.percentualInexequibilidade} onChange={(v) => setP({ percentualInexequibilidade: v })} />
          </Campo>
          <Campo rotulo="Faixa de alerta (pontos acima do limite)" htmlFor="faixa"
            dica={`Acima do limite e até ${formatPct(p.percentualInexequibilidade + p.faixaAlertaPontos, 0)} do orçamento o sistema sugere diligência.`}>
            <NumberField id="faixa" suffix="p.p." value={p.faixaAlertaPontos} onChange={(v) => setP({ faixaAlertaPontos: v })} />
          </Campo>
          <Campo rotulo="Margem líquida mínima desejada" htmlFor="margem"
            dica="Abaixo desta margem (sobre o preço) a viabilidade econômica entra em alerta.">
            <NumberField id="margem" suffix="%" value={p.margemMinima} onChange={(v) => setP({ margemMinima: v })} />
          </Campo>
          <Campo rotulo="Critério de inexequibilidade" htmlFor="criterio">
            <SelectField id="criterio" value={p.criterio} opcoes={OPCOES_CRITERIO} onChange={(v) => setP({ criterio: v })} />
          </Campo>
          <div className="rounded-lg border bg-muted/50 p-3 text-sm sm:col-span-2">
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <span className="text-muted-foreground">Limite legal aplicado</span>
              <strong className="tabular-nums">{formatBRL(r.limiteLegal)}</strong>
            </div>
            {r.limiteEstatistico !== null && (
              <div className="mt-1 flex flex-wrap justify-between gap-x-6 text-xs text-muted-foreground">
                <span>Referência estatística (70% × menor entre média e orçamento)</span>
                <span className="tabular-nums">{formatBRL(r.limiteEstatistico)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Propostas concorrentes (opcional)</CardTitle>
          <CardDescription>
            Usadas apenas no critério estatístico e para comparar sua posição. Inclua as propostas conhecidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.concorrentes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma proposta cadastrada.</p>
          )}
          {a.concorrentes.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
              <TextoField
                value={c.nome}
                placeholder="Licitante"
                onChange={(v) =>
                  atualizar((x) => ({
                    ...x,
                    concorrentes: x.concorrentes.map((k) => (k.id === c.id ? { ...k, nome: v } : k)),
                  }))
                }
              />
              <NumberField
                prefix="R$"
                aria-label={`Valor da proposta de ${c.nome}`}
                value={c.valor}
                onChange={(v) =>
                  atualizar((x) => ({
                    ...x,
                    concorrentes: x.concorrentes.map((k) => (k.id === c.id ? { ...k, valor: v } : k)),
                  }))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover concorrente"
                onClick={() =>
                  atualizar((x) => ({ ...x, concorrentes: x.concorrentes.filter((k) => k.id !== c.id) }))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              atualizar((x) => ({
                ...x,
                concorrentes: [...x.concorrentes, { id: novoId(), nome: "", valor: 0 }],
              }))
            }
          >
            <Plus /> Adicionar proposta
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Identificação (usada na minuta)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Razão social da empresa"><TextoField value={id.empresa} onChange={(v) => setId({ empresa: v })} /></Campo>
          <Campo rotulo="CNPJ"><TextoField value={id.cnpj} onChange={(v) => setId({ cnpj: v })} /></Campo>
          <Campo rotulo="Representante legal"><TextoField value={id.representante} onChange={(v) => setId({ representante: v })} /></Campo>
          <Campo rotulo="Órgão licitante"><TextoField value={id.orgao} onChange={(v) => setId({ orgao: v })} /></Campo>
          <Campo rotulo="Edital / modalidade (ex.: Pregão Eletrônico nº 10/2026)"><TextoField value={id.edital} onChange={(v) => setId({ edital: v })} /></Campo>
          <Campo rotulo="Processo administrativo"><TextoField value={id.processo} onChange={(v) => setId({ processo: v })} /></Campo>
          <Campo rotulo="Objeto" className="sm:col-span-2"><TextoField value={id.objeto} onChange={(v) => setId({ objeto: v })} /></Campo>
          <Campo rotulo="Cidade/UF (local da assinatura)"><TextoField value={id.cidade} onChange={(v) => setId({ cidade: v })} /></Campo>
        </CardContent>
      </Card>
    </div>
  );
}
