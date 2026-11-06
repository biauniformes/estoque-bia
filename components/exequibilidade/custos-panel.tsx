"use client";

import { Plus, Trash2 } from "lucide-react";
import { Badge } from "./ui";
import { Button } from "./ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import { Input } from "./ui";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui";
import type { CategoriaInsumo, GrupoEncargo, Insumo } from "@/lib/exequibilidade/types";
import type { UseAnalise } from "@/hooks/use-analise-exequibilidade";
import { novoId } from "@/lib/exequibilidade/defaults";
import { FICHA_VAZIA, insumosDaFicha, type FichaPeca } from "@/lib/exequibilidade/pecas";
import { useState } from "react";
import { formatBRL, formatPct } from "@/lib/exequibilidade/format";
import { Campo, NumberField, SelectField } from "./fields";
import { ProdutosDoEstoque } from "./produtos-do-estoque";
import { CotacoesDialog } from "./cotacoes-dialog";
import type { Anexo } from "@/lib/exequibilidade/licitacao";
import { problemasCotacoes, resumoCotacoes, rotuloCriterio, usaCotacoes } from "@/lib/exequibilidade/cotacoes";
const CATEGORIAS: { value: CategoriaInsumo; label: string }[] = [
  { value: "mao_de_obra", label: "Mão de obra" },
  { value: "material", label: "Material" },
  { value: "equipamento", label: "Equipamento" },
  { value: "outros", label: "Outros" },
];

export function CustosPanel({ ctx, anexos }: { ctx: UseAnalise; anexos: Anexo[] }) {
  const { analise: a, resultado: r, atualizar } = ctx;
  const [cotandoId, setCotandoId] = useState<string | null>(null);
  const cotando = a.insumos.find((i) => i.id === cotandoId) ?? null;
  const problemas = problemasCotacoes(a);
  const semCotacao = problemas.filter((p) => p.tipo === "sem_cotacao");
  const outrosProblemas = problemas.filter((p) => p.tipo !== "sem_cotacao");

  const setInsumo = (id: string, patch: Partial<Insumo>) =>
    atualizar((x) => ({
      ...x,
      insumos: x.insumos.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

  const adicionar = (categoria: CategoriaInsumo) =>
    atualizar((x) => ({
      ...x,
      insumos: [
        ...x.insumos,
        {
          id: novoId(),
          descricao: "",
          categoria,
          unidade: categoria === "mao_de_obra" ? "h" : "un",
          quantidade: 0,
          custoUnitario: 0,
          encargosPercentual: null,
        },
      ],
    }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Planilha de custos diretos</CardTitle>
          <CardDescription>
            Informe a quantidade total no contrato. Na mão de obra, os encargos sociais são aplicados
            automaticamente ({formatPct(r.encargos.total)}), com opção de sobrescrever por linha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[25%]">Descrição</TableHead>
                  <TableHead className="w-[12%]">Categoria</TableHead>
                  <TableHead className="w-[7%]">Unid.</TableHead>
                  <TableHead className="w-[10%] text-right">Qtd. total</TableHead>
                  <TableHead className="w-[13%] text-right">Custo unit.</TableHead>
                  <TableHead className="w-[10%]">Cotações</TableHead>
                  <TableHead className="w-[8%] text-right">Encargos</TableHead>
                  <TableHead className="w-[13%] text-right">Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.insumos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum insumo. Adicione mão de obra, materiais e equipamentos abaixo, ou carregue o exemplo.
                    </TableCell>
                  </TableRow>
                )}
                {a.insumos.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Input
                        className="h-11"
                        aria-label="Descrição"
                        value={i.descricao}
                        placeholder="Descrição do insumo"
                        onChange={(e) => setInsumo(i.id, { descricao: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <SelectField
                        value={i.categoria}
                        opcoes={CATEGORIAS}
                        onChange={(v) => setInsumo(i.id, { categoria: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-11"
                        aria-label="Unidade"
                        value={i.unidade}
                        onChange={(e) => setInsumo(i.id, { unidade: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <NumberField aria-label="Quantidade" value={i.quantidade} onChange={(v) => setInsumo(i.id, { quantidade: v })} />
                    </TableCell>
                    <TableCell>
                      {usaCotacoes(i) ? (
                        <div className="text-right" title={`Calculado pelas cotações (${rotuloCriterio(i.criterioCotacao)})`}>
                          <div className="font-semibold tabular-nums">{formatBRL(i.custoUnitario)}</div>
                          <div className="text-[10px] text-muted-foreground">{rotuloCriterio(i.criterioCotacao)}</div>
                        </div>
                      ) : (
                        <NumberField aria-label="Custo unitário" prefix="R$" value={i.custoUnitario} onChange={(v) => setInsumo(i.id, { custoUnitario: v })} />
                      )}
                    </TableCell>
                    <TableCell>
                      <BotaoCotacoes insumo={i} onClick={() => setCotandoId(i.id)} />
                    </TableCell>
                    <TableCell className="text-right">
                      {i.categoria === "mao_de_obra" ? (
                        <NumberField
                          aria-label="Encargos da linha"
                          suffix="%"
                          value={i.encargosPercentual ?? r.encargos.total}
                          onChange={(v) => setInsumo(i.id, { encargosPercentual: v })}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatBRL(r.custos.linhas[i.id] ?? 0)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover insumo"
                        onClick={() => atualizar((x) => ({ ...x, insumos: x.insumos.filter((k) => k.id !== i.id) }))}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={7} className="text-right font-semibold">
                    Custo direto total
                  </TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums">
                    {formatBRL(r.custos.custoDireto)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => (
              <Button key={c.value} variant="outline" size="sm" onClick={() => adicionar(c.value)}>
                <Plus /> {c.label}
              </Button>
            ))}
            <ProdutosDoEstoque
              onEscolher={(p) =>
                atualizar((x) => ({
                  ...x,
                  insumos: [
                    ...x.insumos,
                    { id: novoId(), descricao: `${p.nome} (cód. ${p.codigo})`, categoria: "material", unidade: "un", quantidade: 0, custoUnitario: p.valor, encargosPercentual: null },
                  ],
                }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Mão de obra", r.custos.maoDeObra],
              ["Materiais", r.custos.materiais],
              ["Equipamentos", r.custos.equipamentos],
              ["Outros", r.custos.outros],
            ].map(([rot, val]) => (
              <div key={rot as string} className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">{rot}</div>
                <div className="font-semibold tabular-nums">{formatBRL(val as number)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.custos.custoDireto > 0 ? formatPct(((val as number) / r.custos.custoDireto) * 100, 1) : "—"} do custo direto
                </div>
              </div>
            ))}
          </div>
          {(semCotacao.length > 0 || outrosProblemas.length > 0) && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-bold">Prova dos custos — o que falta para uma diligência</p>
              {semCotacao.length > 0 && (
                <p className="mt-1">
                  Sem cotação registrada: {semCotacao.map((p) => p.descricao).join("; ")}. Toque em “Cotações” na linha do
                  insumo para anotar os preços dos fornecedores.
                </p>
              )}
              {outrosProblemas.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {outrosProblemas.map((p) => (
                    <li key={p.insumoId + p.tipo}><b>{p.descricao}:</b> {p.texto}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CotacoesDialog
        insumo={cotando}
        anexos={anexos}
        onChange={(novo) => atualizar((x) => ({ ...x, insumos: x.insumos.map((k) => (k.id === novo.id ? novo : k)) }))}
        onClose={() => setCotandoId(null)}
      />

      <PecasCard ctx={ctx} />
      <EncargosCard ctx={ctx} />
    </div>
  );
}

function BotaoCotacoes({ insumo, onClick }: { insumo: Insumo; onClick: () => void }) {
  const r = resumoCotacoes(insumo.cotacoes);
  const mo = insumo.categoria === "mao_de_obra";
  if (!r)
    return (
      <Button variant="outline" size="sm" onClick={onClick} className={mo ? "" : "border-amber-400 text-amber-800"}>
        <Plus /> {mo ? "Cotar" : "Sem cotação"}
      </Button>
    );
  return (
    <Button variant="outline" size="sm" onClick={onClick} className={r.n >= 3 ? "border-emerald-500 text-emerald-800" : "border-amber-400 text-amber-800"}>
      {r.n} cotação{r.n > 1 ? "ões" : ""}
    </Button>
  );
}

const GRUPOS: { grupo: GrupoEncargo; titulo: string }[] = [
  { grupo: "A", titulo: "Grupo A — Encargos sociais básicos" },
  { grupo: "B", titulo: "Grupo B — Tempo não trabalhado e 13º" },
  { grupo: "C", titulo: "Grupo C — Rescisão" },
];

function EncargosCard({ ctx }: { ctx: UseAnalise }) {
  const { analise: a, resultado: r, atualizar } = ctx;
  const e = a.encargos;
  const manual = e.modo === "manual";

  const setItem = (id: string, patch: Partial<(typeof e.itens)[number]>) =>
    atualizar((x) => ({
      ...x,
      encargos: { ...x.encargos, itens: x.encargos.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Encargos sociais
          <Badge variant="secondary" className="tabular-nums">Total {formatPct(r.encargos.total)}</Badge>
        </CardTitle>
        <CardDescription>
          Percentuais de referência para mensalista; ajuste conforme convenção coletiva, RAT/FAP e regime da empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <Campo rotulo="Modo de cálculo" className="w-64">
            <SelectField
              value={e.modo}
              opcoes={[
                { value: "detalhado", label: "Detalhado (grupos A, B, C, D)" },
                { value: "manual", label: "Percentual único manual" },
              ]}
              onChange={(v) => atualizar((x) => ({ ...x, encargos: { ...x.encargos, modo: v } }))}
            />
          </Campo>
          {manual && (
            <Campo rotulo="Encargos totais" className="w-40">
              <NumberField suffix="%" value={e.manualPercentual} onChange={(v) => atualizar((x) => ({ ...x, encargos: { ...x.encargos, manualPercentual: v } }))} />
            </Campo>
          )}
        </div>
        {!manual && (
          <div className="grid gap-4 lg:grid-cols-3">
            {GRUPOS.map(({ grupo, titulo }) => (
              <div key={grupo} className="rounded-lg border p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold">{titulo}</h4>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatPct(grupo === "A" ? r.encargos.grupoA : grupo === "B" ? r.encargos.grupoB : r.encargos.grupoC)}
                  </span>
                </div>
                <div className="space-y-2">
                  {e.itens.filter((i) => i.grupo === grupo).map((i) => (
                    <div key={i.id} className="grid grid-cols-[1fr_5.5rem] items-center gap-2">
                      <label className="text-xs leading-tight" htmlFor={`enc-${i.id}`}>
                        {i.descricao}
                        {grupo === "B" && (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={i.incideGrupoA}
                              onChange={(ev) => setItem(i.id, { incideGrupoA: ev.target.checked })}
                            />
                            incide Grupo A
                          </span>
                        )}
                      </label>
                      <NumberField id={`enc-${i.id}`} suffix="%" value={i.percentual} onChange={(v) => setItem(i.id, { percentual: v })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/40 p-3 text-sm lg:col-span-3">
              <div className="grid gap-1 sm:grid-cols-5">
                <span>A: <b className="tabular-nums">{formatPct(r.encargos.grupoA)}</b></span>
                <span>B: <b className="tabular-nums">{formatPct(r.encargos.grupoB)}</b></span>
                <span>C: <b className="tabular-nums">{formatPct(r.encargos.grupoC)}</b></span>
                <span title="Grupo A incidindo sobre os itens do Grupo B marcados">D (A sobre B): <b className="tabular-nums">{formatPct(r.encargos.grupoD)}</b></span>
                <span>Total: <b className="tabular-nums">{formatPct(r.encargos.total)}</b></span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PecasCard({ ctx }: { ctx: UseAnalise }) {
  const { atualizar } = ctx;
  const [f, setF] = useState<FichaPeca>(FICHA_VAZIA);
  const set = (patch: Partial<FichaPeca>) => setF((x) => ({ ...x, ...patch }));
  const linhas = insumosDaFicha(f);
  const campos: { k: keyof FichaPeca; rotulo: string; prefix?: string; suffix?: string; casas?: number }[] = [
    { k: "quantidade", rotulo: "Quantidade no edital (peças)", casas: 0 },
    { k: "consumoTecidoM", rotulo: "Consumo de tecido por peça (m)", casas: 3 },
    { k: "precoTecidoM", rotulo: "Preço do tecido por metro", prefix: "R$" },
    { k: "perdaPercentual", rotulo: "Perda de corte/enfesto", suffix: "%" },
    { k: "aviamentos", rotulo: "Aviamentos por peça", prefix: "R$" },
    { k: "minutosProducao", rotulo: "Minutos de produção por peça", casas: 1 },
    { k: "custoHora", rotulo: "Salário-base por hora produtiva", prefix: "R$" },
    { k: "personalizacao", rotulo: "Bordado/estampa por peça", prefix: "R$" },
    { k: "embalagem", rotulo: "Embalagem por peça", prefix: "R$" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ficha técnica por peça (uniformes)</CardTitle>
        <CardDescription>
          Preencha a ficha de cada peça do edital e gere as linhas da planilha automaticamente: tecido com perda,
          aviamentos, mão de obra de corte e costura (os encargos são aplicados na planilha), personalização e embalagem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Peça (ex.: Camiseta manga curta)" className="sm:col-span-2">
            <Input className="h-11" value={f.nome} onChange={(e) => set({ nome: e.target.value })} />
          </Campo>
          {campos.map((c) => (
            <Campo key={c.k} rotulo={c.rotulo}>
              <NumberField
                prefix={c.prefix}
                suffix={c.suffix}
                decimals={c.casas ?? 2}
                value={f[c.k] as number}
                onChange={(v) => set({ [c.k]: v })}
              />
            </Campo>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={linhas.length === 0}
            onClick={() => {
              atualizar((x) => ({ ...x, insumos: [...x.insumos, ...linhas] }));
              setF(FICHA_VAZIA);
            }}
          >
            <Plus /> Gerar {linhas.length} linha(s) na planilha
          </Button>
          <span className="text-sm text-muted-foreground">
            Custo da peça (sem encargos e {ctx.analise.parametros.tipo === "obras" ? "BDI" : "sem despesas, tributos e lucro"}):{" "}
            {formatBRL(
              f.quantidade > 0
                ? linhas.reduce((s, l) => s + l.quantidade * l.custoUnitario, 0) / f.quantidade
                : 0,
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
