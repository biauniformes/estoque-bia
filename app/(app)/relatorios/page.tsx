import { Banknote, Download, FileSpreadsheet, Package } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getStockSnapshot } from "@/services/reports";
import { formatBRL, formatNumber, variantLabel } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { DataTable } from "@/components/shared/data-table";
import type { StockRow } from "@/types";

export const metadata = { title: "Relatórios" };

export default async function RelatoriosPage() {
  await requireAdmin();
  const { rows, pecas, valor } = await getStockSnapshot();
  const top = [...rows].sort((a, b) => Number(b.valor_total ?? 0) - Number(a.valor_total ?? 0)).slice(0, 10).filter((r) => r.estoque > 0);
  const comEstoque = rows.filter((r) => r.estoque > 0).length;

  return (
    <>
      <PageHeader title="Relatórios" description="Exporte os dados atualizados do sistema para Excel." />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Itens cadastrados" value={formatNumber(rows.length)} icon={<FileSpreadsheet className="h-7 w-7" />} hint={`${formatNumber(comEstoque)} com estoque`} />
        <StatCard label="Peças em estoque" value={formatNumber(pecas)} icon={<Package className="h-7 w-7" />} />
        <StatCard label="Valor total em estoque" value={formatBRL(valor)} tone="success" icon={<Banknote className="h-7 w-7" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estoque atual</CardTitle>
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

      {top.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader>
            <CardTitle>Itens de maior valor em estoque</CardTitle>
          </CardHeader>
          <DataTable<StockRow>
            rows={top}
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
