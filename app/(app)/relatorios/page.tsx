import { AlertTriangle, Banknote, Boxes, Building2, Download, FileSpreadsheet, Package, Trophy } from "lucide-react";
import { requireNotRestricted } from "@/lib/auth/session";
import { DEFAULT_LIMITE, EMPRESAS, SEM_EMPRESA, TOP_OPTIONS, combinaEmpresa, empresaLabel, getLowMovedItems, getMovedStock, getStockSnapshot, getTopItems, parseEmpresa, resumoPorEmpresa } from "@/services/reports";
import { RelatorioOperador } from "./operador-view";
import { first, formatBRL, formatDateTime, formatNumber, variantLabel } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { DataTable } from "@/components/shared/data-table";
import { StockBadge } from "@/components/shared/badges";
import type { StockReportRow, StockRow } from "@/types";

export const metadata = { title: "Relatórios" };

const MAX_ROWS_ON_SCREEN = 100;

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireNotRestricted();
  const sp = await searchParams;
  // operador: só código, nome e quantidade (sem valores)
  if (profile.role !== "admin") return <RelatorioOperador sp={sp} />;
  return <RelatoriosAdmin sp={sp} />;
}

async function RelatoriosAdmin({ sp }: { sp: Record<string, string | string[] | undefined> }) {

  const limiteRaw = parseInt(first(sp.limite), 10);
  const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(limiteRaw, 1_000_000) : DEFAULT_LIMITE;
  const topRaw = parseInt(first(sp.top), 10);
  const top = (TOP_OPTIONS as readonly number[]).includes(topRaw) ? topRaw : 20;

  const zerados = first(sp.zerados) === "1";
  const marca = parseEmpresa(first(sp.empresa));
  // "completo" = com valores; "operador" = só código, nome e quantidade (vale para os arquivos Excel)
  const versao = first(sp.versao) === "operador" ? "operador" : "completo";
  const mq = `${marca ? `&empresa=${marca}` : ""}${versao === "operador" ? "&versao=operador" : ""}`;

  const [todas, baixos, maiores, movidos] = await Promise.all([
    getStockSnapshot(""),
    getLowMovedItems(limite, marca),
    getTopItems(top, marca),
    getMovedStock(zerados, marca),
  ]);
  const rows = marca ? todas.rows.filter((r) => combinaEmpresa(r.produto, marca)) : todas.rows;
  const pecas = rows.reduce((a, r) => a + r.estoque, 0);
  const valor = rows.reduce((a, r) => a + Number(r.valor_total ?? 0), 0);
  const resumo = resumoPorEmpresa(todas.rows);
  const comEstoque = rows.filter((r) => r.estoque > 0).length;
  const topValor = [...rows].sort((a, b) => Number(b.valor_total ?? 0) - Number(a.valor_total ?? 0)).slice(0, 10).filter((r) => r.estoque > 0);
  const baixosZerados = baixos.filter((r) => r.estoque === 0).length;

  return (
    <>
      <PageHeader title="Relatórios" description="Exporte os dados atualizados do sistema para Excel." />

      <Card className="mb-6 p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="limite" value={limite} />
          <input type="hidden" name="top" value={top} />
          {zerados && <input type="hidden" name="zerados" value="1" />}
          <Field label="Empresa" htmlFor="empresa" hint="Vale para os relatórios abaixo (telas e Excel).">
            <Select id="empresa" name="empresa" defaultValue={marca} className="w-56">
              <option value="">Todas as empresas</option>
              {EMPRESAS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value={SEM_EMPRESA}>{empresaLabel(SEM_EMPRESA)}</option>
            </Select>
          </Field>
          <Field label="Versão do Excel" htmlFor="versao" hint="“Para operador” sai só com código, nome e quantidade.">
            <Select id="versao" name="versao" defaultValue={versao} className="w-72">
              <option value="completo">Completo — com valores (admin)</option>
              <option value="operador">Para operador — sem valores</option>
            </Select>
          </Field>
          <Button type="submit" size="lg">Aplicar</Button>
          {marca && (
            <span className="mb-3 rounded-full border-2 border-orange-300 bg-orange-50 px-4 py-1.5 text-sm font-bold text-orange-900">
              Empresa: {empresaLabel(marca)}
            </span>
          )}
          {versao === "operador" && (
            <span className="mb-3 rounded-full border-2 border-slate-300 bg-slate-100 px-4 py-1.5 text-sm font-bold text-slate-800">
              Excel sem valores
            </span>
          )}
        </form>
      </Card>

      {/* ------------------------------------------------ relatórios por empresa */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-brand" aria-hidden /> Relatórios por empresa
              </CardTitle>
              <CardDescription>
                Cada empresa tem o seu relatório de estoque (itens com quantidade). O Excel sai na versão escolhida acima: {versao === "operador" ? "sem valores" : "com valores"}.
              </CardDescription>
            </div>
            <Button asChild variant="dark">
              <a href={`/relatorios/exportar?tipo=empresas${versao === "operador" ? "&versao=operador" : ""}`} download>
                <Download className="h-5 w-5" aria-hidden /> Todas as empresas (1 aba por empresa)
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resumo.map((e) => (
              <div key={e.empresa} className="rounded-2xl border-2 border-slate-200 p-4">
                <p className="text-lg font-extrabold uppercase tracking-wide">{empresaLabel(e.empresa)}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div><dt className="text-xs text-slate-500">Itens</dt><dd className="text-xl font-extrabold tabular-nums">{formatNumber(e.comEstoque)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Peças</dt><dd className="text-xl font-extrabold tabular-nums">{formatNumber(e.pecas)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Valor</dt><dd className="text-sm font-extrabold tabular-nums">{formatBRL(e.valor)}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" disabled={e.comEstoque === 0}>
                    <a href={`/relatorios/exportar?tipo=estoque&empresa=${e.empresa}&soestoque=1${versao === "operador" ? "&versao=operador" : ""}`} download>
                      <Download className="h-4 w-4" aria-hidden /> Excel
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/relatorios?empresa=${e.empresa}${versao === "operador" ? "&versao=operador" : ""}#estoque-empresa`}>Ver na tela</a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {marca && (
        <Card id="estoque-empresa" className="mb-6 scroll-mt-4 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-brand" aria-hidden /> Estoque — {empresaLabel(marca)}
            </CardTitle>
            <CardDescription>
              {formatNumber(comEstoque)} {comEstoque === 1 ? "item" : "itens"} com estoque · {formatNumber(pecas)} peças · {formatBRL(valor)}
              {comEstoque > MAX_ROWS_ON_SCREEN && <> · mostrando os {MAX_ROWS_ON_SCREEN} primeiros (o Excel traz todos)</>}
            </CardDescription>
          </CardHeader>
          <DataTable<StockRow>
            caption={`Estoque de ${empresaLabel(marca)}`}
            rows={rows.filter((r) => r.estoque > 0).slice(0, MAX_ROWS_ON_SCREEN)}
            rowKey={(r) => r.variant_id}
            empty={<p className="px-5 pb-8 text-center text-slate-500">Nenhum item com estoque nesta empresa.</p>}
            columns={[
              { header: "Código", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
              {
                header: "Produto",
                cell: (r) => (
                  <>
                    <strong>{r.produto}</strong>
                    {variantLabel(r.cor, r.tamanho) && <span className="ml-2 text-slate-500">{variantLabel(r.cor, r.tamanho)}</span>}
                  </>
                ),
              },
              { header: "Estoque", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.estoque)}</strong> },
              { header: "Valor unit.", align: "right", hideBelow: "lg", cell: (r) => formatBRL(r.valor_unitario) },
              { header: "Valor total", align: "right", hideBelow: "md", cell: (r) => <strong>{formatBRL(r.valor_total)}</strong> },
              { header: "Situação", cell: (r) => <StockBadge status={r.status} /> },
            ]}
          />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Itens cadastrados" value={formatNumber(rows.length)} icon={<FileSpreadsheet className="h-7 w-7" />} hint={`${formatNumber(comEstoque)} com estoque`} />
        <StatCard label="Peças em estoque" value={formatNumber(pecas)} icon={<Package className="h-7 w-7" />} />
        <StatCard label="Valor total em estoque" value={formatBRL(valor)} tone="success" icon={<Banknote className="h-7 w-7" />} />
      </div>

      {/* ------------------------------------------------ estoque dos itens movimentados */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-brand" aria-hidden /> Estoque dos itens já movimentados
              </CardTitle>
              <CardDescription>
                Saldo atual de cada item que já teve ao menos uma movimentação, com muito ou pouco estoque. Mostra o que há no estoque, não as movimentações.
              </CardDescription>
            </div>
            <Button asChild variant="dark">
              <a href={`/relatorios/exportar?tipo=movimentados${zerados ? "&zerados=1" : ""}${mq}`} download>
                <Download className="h-5 w-5" aria-hidden /> Baixar Excel
              </a>
            </Button>
          </div>
          <form method="get" className="flex flex-wrap items-center gap-4">
            <input type="hidden" name="limite" value={limite} />
            <input type="hidden" name="top" value={top} />
            {marca && <input type="hidden" name="empresa" value={marca} />}
            {versao === "operador" && <input type="hidden" name="versao" value="operador" />}
            <label className="flex min-h-12 items-center gap-3 font-semibold text-slate-700">
              <input type="checkbox" name="zerados" value="1" defaultChecked={zerados} className="h-6 w-6 accent-orange-600" />
              Incluir itens que já zeraram
            </label>
            <Button type="submit" size="lg" variant="outline">Atualizar</Button>
          </form>
          <p className="text-sm font-semibold text-slate-700">
            {formatNumber(movidos.rows.length)} {movidos.rows.length === 1 ? "item" : "itens"} · {formatNumber(movidos.pecas)} peças · {formatBRL(movidos.valor)}
            {movidos.rows.length > MAX_ROWS_ON_SCREEN && <> · mostrando os {MAX_ROWS_ON_SCREEN} primeiros (o Excel traz todos)</>}
          </p>
        </CardHeader>
        <DataTable<StockReportRow>
          caption="Estoque dos itens já movimentados"
          rows={movidos.rows.slice(0, MAX_ROWS_ON_SCREEN)}
          rowKey={(r) => r.variant_id}
          empty={<p className="px-5 pb-8 text-center text-slate-500">Nenhum item movimentado com estoque ainda.</p>}
          columns={[
            { header: "Código", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
            {
              header: "Produto",
              cell: (r) => (
                <>
                  <strong>{r.produto}</strong>
                  {variantLabel(r.cor, r.tamanho) && <span className="ml-2 text-slate-500">{variantLabel(r.cor, r.tamanho)}</span>}
                </>
              ),
            },
            { header: "Estoque", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.estoque)}</strong> },
            { header: "Valor unit.", align: "right", hideBelow: "lg", cell: (r) => formatBRL(r.valor_unitario) },
            { header: "Valor total", align: "right", hideBelow: "md", cell: (r) => <strong>{formatBRL(r.valor_total)}</strong> },
            { header: "Situação", cell: (r) => <StockBadge status={r.status} /> },
          ]}
        />
      </Card>

      {/* ------------------------------------------------ movimentados com saldo baixo */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden /> Itens movimentados com saldo abaixo de {formatNumber(limite)}
              </CardTitle>
              <CardDescription>
                Só entram itens que já tiveram ao menos uma movimentação no histórico (entrada ou saída). Itens nunca movimentados não aparecem.
              </CardDescription>
            </div>
            <Button asChild variant="dark">
              <a href={`/relatorios/exportar?tipo=baixo&limite=${limite}${mq}`} download>
                <Download className="h-5 w-5" aria-hidden /> Baixar Excel
              </a>
            </Button>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="top" value={top} />
            {zerados && <input type="hidden" name="zerados" value="1" />}
            {marca && <input type="hidden" name="empresa" value={marca} />}
            {versao === "operador" && <input type="hidden" name="versao" value="operador" />}
            <Field label="Mostrar itens com saldo abaixo de" htmlFor="limite">
              <Input id="limite" name="limite" type="number" min={1} inputMode="numeric" defaultValue={limite} className="w-40" />
            </Field>
            <Button type="submit" size="lg" variant="outline">Atualizar</Button>
          </form>
          <p className="text-sm font-semibold text-slate-700">
            {formatNumber(baixos.length)} {baixos.length === 1 ? "item" : "itens"}
            {baixosZerados > 0 && <> · {formatNumber(baixosZerados)} zerados</>}
            {baixos.length > MAX_ROWS_ON_SCREEN && <> · mostrando os {MAX_ROWS_ON_SCREEN} de menor saldo (o Excel traz todos)</>}
          </p>
        </CardHeader>
        <DataTable<StockReportRow>
          caption={`Itens movimentados com saldo abaixo de ${limite}`}
          rows={baixos.slice(0, MAX_ROWS_ON_SCREEN)}
          rowKey={(r) => r.variant_id}
          empty={<p className="px-5 pb-8 text-center text-slate-500">Nenhum item movimentado com saldo abaixo de {formatNumber(limite)}.</p>}
          columns={[
            { header: "Código", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
            {
              header: "Produto",
              cell: (r) => (
                <>
                  <strong>{r.produto}</strong>
                  {variantLabel(r.cor, r.tamanho) && <span className="ml-2 text-slate-500">{variantLabel(r.cor, r.tamanho)}</span>}
                </>
              ),
            },
            { header: "Estoque", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.estoque)}</strong> },
            { header: "Entradas", align: "right", hideBelow: "lg", cell: (r) => formatNumber(r.total_entradas) },
            { header: "Saídas", align: "right", hideBelow: "lg", cell: (r) => formatNumber(r.total_saidas) },
            { header: "Última mov.", hideBelow: "md", cell: (r) => (r.ultima_movimentacao ? formatDateTime(r.ultima_movimentacao) : "—") },
            { header: "Situação", cell: (r) => <StockBadge status={r.status} /> },
          ]}
        />
      </Card>

      {/* ------------------------------------------------ maiores estoques */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-brand" aria-hidden /> Peças com maior quantidade em estoque
              </CardTitle>
              <CardDescription>Ranking dos itens com mais unidades em estoque agora.</CardDescription>
            </div>
            <Button asChild variant="dark">
              <a href={`/relatorios/exportar?tipo=maiores&top=${top}${mq}`} download>
                <Download className="h-5 w-5" aria-hidden /> Baixar Excel
              </a>
            </Button>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="limite" value={limite} />
            {zerados && <input type="hidden" name="zerados" value="1" />}
            {marca && <input type="hidden" name="empresa" value={marca} />}
            {versao === "operador" && <input type="hidden" name="versao" value="operador" />}
            <Field label="Mostrar os" htmlFor="top">
              <Select id="top" name="top" defaultValue={String(top)} className="w-40">
                {TOP_OPTIONS.map((n) => (
                  <option key={n} value={n}>{`${n} maiores`}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit" size="lg" variant="outline">Atualizar</Button>
          </form>
        </CardHeader>
        <DataTable<StockRow>
          caption="Itens com maior quantidade em estoque"
          rows={maiores}
          rowKey={(r) => r.variant_id}
          empty={<p className="px-5 pb-8 text-center text-slate-500">Ainda não há itens com estoque.</p>}
          columns={[
            { header: "#", cell: (r) => <span className="font-bold text-slate-500">{maiores.indexOf(r) + 1}</span> },
            { header: "Código", hideBelow: "md", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
            {
              header: "Produto",
              cell: (r) => (
                <>
                  <strong>{r.produto}</strong>
                  {variantLabel(r.cor, r.tamanho) && <span className="ml-2 text-slate-500">{variantLabel(r.cor, r.tamanho)}</span>}
                </>
              ),
            },
            { header: "Estoque", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.estoque)}</strong> },
            { header: "% do total", align: "right", hideBelow: "md", cell: (r) => (pecas > 0 ? `${((r.estoque / pecas) * 100).toFixed(1).replace(".", ",")}%` : "—") },
            { header: "Valor total", align: "right", hideBelow: "lg", cell: (r) => formatBRL(r.valor_total) },
          ]}
        />
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estoque atual (completo)</CardTitle>
            <CardDescription>
              Todos os itens com código, produto, quantidade, valor unitário, valor total e situação, mais a linha de totais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <a href={`/relatorios/exportar?tipo=estoque${mq}`} download>
                <Download className="h-5 w-5" aria-hidden /> Baixar estoque (Excel)
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Movimentações por período</CardTitle>
            <CardDescription>Entradas, saídas e ajustes com usuário, OC e estoque antes/depois. Deixe as datas em branco para exportar tudo.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/relatorios/exportar" method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tipo" value="movimentacoes" />
              {marca && <input type="hidden" name="empresa" value={marca} />}
            {versao === "operador" && <input type="hidden" name="versao" value="operador" />}
              <Field label="De" htmlFor="r-from"><Input id="r-from" name="from" type="date" /></Field>
              <Field label="Até" htmlFor="r-to"><Input id="r-to" name="to" type="date" /></Field>
              <Button type="submit" size="lg" variant="dark">
                <Download className="h-5 w-5" aria-hidden /> Baixar movimentações (Excel)
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {topValor.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader>
            <CardTitle>Itens de maior valor em estoque (R$)</CardTitle>
          </CardHeader>
          <DataTable<StockRow>
            rows={topValor}
            rowKey={(r) => r.variant_id}
            columns={[
              { header: "Código", cell: (r) => <span className="font-mono text-sm">{r.codigo}</span> },
              {
                header: "Produto",
                cell: (r) => (
                  <>
                    <strong>{r.produto}</strong>
                    {variantLabel(r.cor, r.tamanho) && <span className="ml-2 text-slate-500">{variantLabel(r.cor, r.tamanho)}</span>}
                  </>
                ),
              },
              { header: "Qtd.", align: "right", cell: (r) => formatNumber(r.estoque) },
              { header: "Valor unit.", align: "right", hideBelow: "md", cell: (r) => formatBRL(r.valor_unitario) },
              { header: "Valor total", align: "right", cell: (r) => <strong>{formatBRL(r.valor_total)}</strong> },
            ]}
          />
        </Card>
      )}
    </>
  );
}
