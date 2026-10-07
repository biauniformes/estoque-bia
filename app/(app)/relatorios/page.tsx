import { AlertTriangle, Banknote, Boxes, Download, FileSpreadsheet, Package, Trophy } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LIMITE, TOP_OPTIONS, getLowMovedItems, getMovedStock, getStockSnapshot, getTopItems } from "@/services/reports";
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
  await requireAdmin();
  const sp = await searchParams;

  const limiteRaw = parseInt(first(sp.limite), 10);
  const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(limiteRaw, 1_000_000) : DEFAULT_LIMITE;
  const topRaw = parseInt(first(sp.top), 10);
  const top = (TOP_OPTIONS as readonly number[]).includes(topRaw) ? topRaw : 20;

  const zerados = first(sp.zerados) === "1";

  const [{ rows, pecas, valor }, baixos, maiores, movidos] = await Promise.all([
    getStockSnapshot(),
    getLowMovedItems(limite),
    getTopItems(top),
    getMovedStock(zerados),
  ]);
  const comEstoque = rows.filter((r) => r.estoque > 0).length;
  const topValor = [...rows].sort((a, b) => Number(b.valor_total ?? 0) - Number(a.valor_total ?? 0)).slice(0, 10).filter((r) => r.estoque > 0);
  const baixosZerados = baixos.filter((r) => r.estoque === 0).length;

  return (
    <>
      <PageHeader title="Relatórios" description="Exporte os dados atualizados do sistema para Excel." />

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
              <a href={`/relatorios/exportar?tipo=movimentados${zerados ? "&zerados=1" : ""}`} download>
                <Download className="h-5 w-5" aria-hidden /> Baixar Excel
              </a>
            </Button>
          </div>
          <form method="get" className="flex flex-wrap items-center gap-4">
            <input type="hidden" name="limite" value={limite} />
            <input type="hidden" name="top" value={top} />
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
              <a href={`/relatorios/exportar?tipo=baixo&limite=${limite}`} download>
                <Download className="h-5 w-5" aria-hidden /> Baixar Excel
              </a>
            </Button>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="top" value={top} />
            {zerados && <input type="hidden" name="zerados" value="1" />}
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
              <a href={`/relatorios/exportar?tipo=maiores&top=${top}`} download>
                <Download className="h-5 w-5" aria-hidden /> Baixar Excel
              </a>
            </Button>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="limite" value={limite} />
            {zerados && <input type="hidden" name="zerados" value="1" />}
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
        <DataTable<StockReportRow>
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
              <a href="/relatorios/exportar?tipo=estoque" download>
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
