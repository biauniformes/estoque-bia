"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "./ui";
import { analisar } from "@/lib/exequibilidade/calc";
import { gerarMinuta, rotuloStatus } from "@/lib/exequibilidade/minuta";
import { NOMES_TIPO } from "@/lib/exequibilidade/defaults";
import { formatBRL, formatNumero, formatPct } from "@/lib/exequibilidade/format";
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

const ROTULO_CAT: Record<CategoriaInsumo, string> = {
  mao_de_obra: "Mão de obra (com encargos sociais)",
  material: "Materiais",
  equipamento: "Equipamentos",
  outros: "Outros custos diretos",
};

const SECAO = "mt-8 break-before-page";

export function DossieView({
  titulo,
  status,
  dataSessao,
  analise: a,
  checklist,
  anexos,
  documentosEmpresa,
}: {
  titulo: string;
  status: string;
  dataSessao: string | null;
  analise: Analise;
  checklist: Checklist;
  anexos: Anexo[];
  documentosEmpresa: Anexo[];
}) {
  const r = useMemo(() => analisar(a), [a]);
  const agora = new Date();
  const minuta = useMemo(() => gerarMinuta(a, r, agora), [a, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = a.identificacao;
  const d = r.decomposicao;
  const indice = [...anexos, ...documentosEmpresa];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={a ? "." : "."} onClick={(e) => { e.preventDefault(); history.back(); }}><ArrowLeft className="h-4 w-4" /> Voltar à licitação</Link>
        </Button>
        <Button size="lg" onClick={() => window.print()}>
          <Printer className="h-5 w-5" /> Imprimir / salvar em PDF
        </Button>
        <p className="text-sm text-slate-600">Na janela de impressão escolha “Salvar como PDF”. Anexe depois os arquivos listados no índice, na mesma ordem.</p>
      </div>

      <article className="print-area rounded-2xl border bg-white p-8 text-[13px] leading-relaxed text-black shadow-sm [&_h2]:mb-3 [&_h2]:border-b-2 [&_h2]:border-black [&_h2]:pb-1 [&_h2]:text-lg [&_h2]:font-extrabold [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-bold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-400 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-400 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
        {/* CAPA */}
        <header className="py-16 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-600">Dossiê de proposta e exequibilidade</p>
          <h1 className="mt-4 text-3xl font-extrabold">{titulo}</h1>
          <p className="mt-6 text-base">{id.objeto || "[Objeto da licitação]"}</p>
          <dl className="mx-auto mt-10 grid max-w-xl grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-left">
            <dt className="font-bold">Licitante</dt><dd>{id.empresa || "—"}{id.cnpj && ` — CNPJ ${id.cnpj}`}</dd>
            <dt className="font-bold">Representante</dt><dd>{id.representante || "—"}</dd>
            <dt className="font-bold">Órgão</dt><dd>{id.orgao || "—"}</dd>
            <dt className="font-bold">Edital</dt><dd>{id.edital || "—"}</dd>
            <dt className="font-bold">Processo</dt><dd>{id.processo || "—"}</dd>
            <dt className="font-bold">Sessão</dt><dd>{formatDataBR(dataSessao)}</dd>
            <dt className="font-bold">Situação</dt><dd>{rotuloStatusLicitacao(status)}</dd>
            <dt className="font-bold">Emitido em</dt><dd>{agora.toLocaleDateString("pt-BR")}</dd>
          </dl>
          <div className="mx-auto mt-12 max-w-xl text-left">
            <h3>Conteúdo</h3>
            <ol className="list-decimal pl-5">
              <li>Resumo do preço e conclusão</li>
              <li>Planilha de custos e formação de preços</li>
              <li>BDI, tributos e composição do preço</li>
              <li>Análise de exequibilidade</li>
              <li>Defesa de exequibilidade</li>
              <li>Habilitação e documentos</li>
              <li>Índice de anexos</li>
            </ol>
          </div>
        </header>

        {/* 1. RESUMO */}
        <section className={SECAO}>
          <h2>1. Resumo do preço e conclusão</h2>
          <table>
            <tbody>
              <tr><td>Tipo de objeto</td><td>{NOMES_TIPO[a.parametros.tipo]}</td></tr>
              <tr><td>Valor estimado pela Administração</td><td>{formatBRL(a.parametros.valorEstimado)}</td></tr>
              <tr><td>Preço ofertado</td><td><b>{formatBRL(a.parametros.precoOfertado)}</b>{r.percentualDoEstimado !== null && ` (${formatPct(r.percentualDoEstimado)} do estimado)`}</td></tr>
              <tr><td>Limite de inexequibilidade adotado</td><td>{formatBRL(r.limiteLegal)} ({formatPct(a.parametros.percentualInexequibilidade, 0)} do estimado)</td></tr>
              <tr><td>Situação em relação ao limite</td><td>{rotuloStatus(r.statusLegal)}</td></tr>
              <tr><td>Viabilidade econômica (custos cobertos)</td><td>{rotuloStatus(r.statusEconomico)}</td></tr>
              <tr><td>Custo direto total</td><td>{formatBRL(r.custos.custoDireto)}</td></tr>
              <tr><td>Lucro líquido / margem sobre o preço</td><td>{formatBRL(d.lucro)} / {formatPct(d.margemSobrePreco)}</td></tr>
              <tr><td>Preço de equilíbrio (lucro zero)</td><td>{r.precoEquilibrio !== null ? formatBRL(r.precoEquilibrio) : "—"}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 font-bold">Conclusão: {rotuloStatus(r.statusGeral)}.</p>
          {r.avisos.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {r.avisos.map((v) => <li key={v}>{v}</li>)}
            </ul>
          )}
        </section>

        {/* 2. PLANILHA */}
        <section className={SECAO}>
          <h2>2. Planilha de custos e formação de preços</h2>
          {a.insumos.length === 0 ? (
            <p>Nenhum insumo informado.</p>
          ) : (
            (Object.keys(ROTULO_CAT) as CategoriaInsumo[]).map((cat) => {
              const itens = a.insumos.filter((i) => i.categoria === cat);
              if (!itens.length) return null;
              const subtotal = itens.reduce((s, i) => s + (r.custos.linhas[i.id] ?? 0), 0);
              return (
                <div key={cat} className="mb-4 break-inside-avoid">
                  <h3>{ROTULO_CAT[cat]}</h3>
                  <table>
                    <thead>
                      <tr><th>Descrição</th><th>Un.</th><th className="text-right">Qtd.</th><th className="text-right">Custo unit.</th>{cat === "mao_de_obra" && <th className="text-right">Encargos</th>}<th className="text-right">Total</th></tr>
                    </thead>
                    <tbody>
                      {itens.map((i) => (
                        <tr key={i.id}>
                          <td>{i.descricao || "—"}</td>
                          <td>{i.unidade}</td>
                          <td className="text-right tabular-nums">{formatNumero(i.quantidade, 2)}</td>
                          <td className="text-right tabular-nums">{formatBRL(i.custoUnitario)}</td>
                          {cat === "mao_de_obra" && <td className="text-right tabular-nums">{formatPct(i.encargosPercentual ?? r.encargos.total)}</td>}
                          <td className="text-right tabular-nums">{formatBRL(r.custos.linhas[i.id] ?? 0)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td colSpan={cat === "mao_de_obra" ? 5 : 4}>Subtotal</td>
                        <td className="text-right tabular-nums">{formatBRL(subtotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
          <p className="font-bold">Custo direto total: {formatBRL(r.custos.custoDireto)}</p>
          {r.custos.maoDeObra > 0 && (
            <>
              <h3>Encargos sociais ({a.encargos.modo === "manual" ? "informado" : "detalhado"}: {formatPct(r.encargos.total)})</h3>
              {a.encargos.modo === "detalhado" && (
                <table>
                  <thead><tr><th>Encargo</th><th>Grupo</th><th className="text-right">%</th></tr></thead>
                  <tbody>
                    {a.encargos.itens.map((e) => (
                      <tr key={e.id}><td>{e.descricao}</td><td>{e.grupo}</td><td className="text-right tabular-nums">{formatPct(e.percentual)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>

        {/* 3. BDI */}
        <section className={SECAO}>
          <h2>3. BDI, tributos e composição do preço</h2>
          <table>
            <thead><tr><th>Componente</th><th className="text-right">%</th></tr></thead>
            <tbody>
              <tr><td>Administração central</td><td className="text-right">{formatPct(a.bdi.administracaoCentral)}</td></tr>
              <tr><td>Seguros</td><td className="text-right">{formatPct(a.bdi.seguro)}</td></tr>
              <tr><td>Riscos</td><td className="text-right">{formatPct(a.bdi.risco)}</td></tr>
              <tr><td>Garantia contratual</td><td className="text-right">{formatPct(a.bdi.garantia)}</td></tr>
              <tr><td>Despesas financeiras</td><td className="text-right">{formatPct(a.bdi.despesasFinanceiras)}</td></tr>
              <tr><td>Lucro</td><td className="text-right">{formatPct(a.bdi.lucro)}</td></tr>
              {a.tributos.regime === "simples" ? (
                <tr><td>Tributos — Simples Nacional (alíquota efetiva){a.tributos.outros ? " + outros" : ""}</td><td className="text-right">{formatPct(r.bdi.somaTributos)}</td></tr>
              ) : (
                <>
                  <tr><td>PIS / COFINS</td><td className="text-right">{formatPct(a.tributos.pis)} / {formatPct(a.tributos.cofins)}</td></tr>
                  <tr><td>ISS / ICMS / CPRB / outros</td><td className="text-right">{formatPct(a.tributos.iss)} / {formatPct(a.tributos.icms)} / {formatPct(a.tributos.cprb)} / {formatPct(a.tributos.outros)}</td></tr>
                  <tr><td>IRPJ efetivo / CSLL efetiva</td><td className="text-right">{formatPct(r.bdi.irpjEfetivo)} / {formatPct(r.bdi.csllEfetivo)}</td></tr>
                  <tr className="font-bold"><td>Carga tributária total sobre o preço</td><td className="text-right">{formatPct(r.bdi.somaTributos)}</td></tr>
                </>
              )}
            </tbody>
          </table>
          <p className="mt-2">
            BDI = [(1 + AC + S + R + G) × (1 + DF) × (1 + L) ÷ (1 − I)] − 1 = <b>{r.bdi.valido ? formatPct(r.bdi.bdi) : "inválido"}</b>
            {" "}(fórmula do Acórdão TCU 2.622/2013-Plenário). Preço de referência (custo direto × (1 + BDI)): {formatBRL(r.precoReferencia)}.
          </p>
          <h3>Composição do preço ofertado</h3>
          <table>
            <tbody>
              <tr><td>Custo direto</td><td className="text-right">{formatBRL(d.custoDireto)}</td></tr>
              <tr><td>Custos indiretos (AC + S + R + G)</td><td className="text-right">{formatBRL(d.custosIndiretos)}</td></tr>
              <tr><td>Despesas financeiras</td><td className="text-right">{formatBRL(d.despesasFinanceiras)}</td></tr>
              <tr><td>Tributos sobre o faturamento</td><td className="text-right">{formatBRL(d.tributos)}</td></tr>
              <tr><td>Lucro líquido</td><td className="text-right">{formatBRL(d.lucro)}</td></tr>
              <tr className="font-bold"><td>Preço ofertado</td><td className="text-right">{formatBRL(d.preco)}</td></tr>
            </tbody>
          </table>
        </section>

        {/* 4. ANÁLISE */}
        <section className={SECAO}>
          <h2>4. Análise de exequibilidade</h2>
          <table>
            <thead><tr><th>Cenário (% do estimado)</th><th className="text-right">Preço</th><th>Limite legal</th><th>Viabilidade</th><th className="text-right">Margem</th></tr></thead>
            <tbody>
              {r.cenarios.map((c) => (
                <tr key={c.percentualDoEstimado} className={c.atual ? "font-bold" : ""}>
                  <td>{formatPct(c.percentualDoEstimado, 0)}{c.atual ? " (ofertado)" : ""}</td>
                  <td className="text-right tabular-nums">{formatBRL(c.preco)}</td>
                  <td>{rotuloStatus(c.statusLegal)}</td>
                  <td>{rotuloStatus(c.statusEconomico)}</td>
                  <td className="text-right tabular-nums">{formatPct(c.margemSobrePreco, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs">
            Base legal: Lei 14.133/2021, art. 59, III, IV e §§2º e 4º; IN SEGES/ME 73/2022, art. 34 (bens e serviços em geral: indício
            abaixo de 50% do orçado, sempre com diligência prévia); Súmula TCU 262.
          </p>
        </section>

        {/* 5. DEFESA */}
        <section className={SECAO}>
          <h2>5. Defesa de exequibilidade</h2>
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{minuta.texto}</pre>
        </section>

        {/* 6. HABILITAÇÃO */}
        <section className={SECAO}>
          <h2>6. Habilitação e documentos</h2>
          {CHECKLIST.map((g) => (
            <div key={g.chave} className="mb-4 break-inside-avoid">
              <h3>{g.titulo}</h3>
              <table>
                <tbody>
                  {g.itens.map((i) => {
                    const docs = indice.filter((x) => x.item === i.chave);
                    return (
                      <tr key={i.chave}>
                        <td className="w-8 text-center">{checklist[i.chave]?.ok ? "☑" : "☐"}</td>
                        <td>
                          {i.titulo}
                          <span className="block text-[11px] text-slate-600">{i.base}{i.condicional && " · se o edital exigir"}{checklist[i.chave]?.obs ? ` · Obs.: ${checklist[i.chave]?.obs}` : ""}</span>
                        </td>
                        <td className="w-40 text-[11px]">{docs.length ? `${docs.length} documento(s) no índice` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        {/* 7. ÍNDICE */}
        <section className={SECAO}>
          <h2>7. Índice de anexos</h2>
          {indice.length === 0 ? (
            <p>Nenhum documento guardado. Envie os arquivos na aba “Anexos” e em “Documentos da empresa”.</p>
          ) : (
            <table>
              <thead><tr><th className="w-10">Nº</th><th>Documento</th><th>Tipo</th><th>Emitido por / nº</th><th>Validade</th></tr></thead>
              <tbody>
                {indice.map((x, n) => {
                  const dias = diasParaVencer(x.validade);
                  return (
                    <tr key={x.id}>
                      <td className="text-center">{n + 1}</td>
                      <td>{x.descricao}<span className="block text-[11px] text-slate-600">{x.arquivo_nome}</span></td>
                      <td>{rotuloCategoria(x.categoria)}</td>
                      <td>{x.emissor ?? "—"}{x.numero ? ` · nº ${x.numero}` : ""}</td>
                      <td>{x.validade ? `${formatDataBR(x.validade)}${dias !== null && dias < 0 ? " (VENCIDO)" : ""}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </article>
    </div>
  );
}
