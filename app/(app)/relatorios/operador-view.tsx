import { Download, FileSpreadsheet, Package } from "lucide-react";
import { EMPRESAS, SEM_EMPRESA, empresaLabel, getStockSnapshot, parseEmpresa } from "@/services/reports";
import { first, formatNumber, variantLabel } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { DataTable } from "@/components/shared/data-table";
import type { StockRow } from "@/types";

const MAX_ROWS_ON_SCREEN = 100;

/** Relatórios do OPERADOR: somente código, nome e quantidade — nunca valores. */
export async function RelatorioOperador({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const empresa = parseEmpresa(first(sp.empresa));
  const zerados = first(sp.zerados) === "1";
  const { rows, pecas } = await getStockSnapshot(empresa, !zerados);
  const eq = empresa ? `&empresa=${empresa}` : "";

  return (
    <>
      <PageHeader title="Relatórios" description="Estoque por empresa: código, nome e quantidade." />

      <Card className="mb-6 p-5">
        <form method="get" className="flex flex-wrap items-end gap-4">
          <Field label="Empresa" htmlFor="empresa">
            <Select id="empresa" name="empresa" defaultValue={empresa} className="w-56">
              <option value="">Todas as empresas</option>
              {EMPRESAS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
              <option value={SEM_EMPRESA}>{empresaLabel(SEM_EMPRESA)}</option>
            </Select>
          </Field>
          <label className="mb-1 flex min-h-12 items-center gap-3 font-semibold text-slate-700">
            <input type="checkbox" name="zerados" value="1" defaultChecked={zerados} className="h-6 w-6 accent-orange-600" />
            Incluir itens zerados
          </label>
          <Button type="submit" size="lg">Aplicar</Button>
        </form>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard label="Itens" value={formatNumber(rows.length)} icon={<FileSpreadsheet className="h-7 w-7" />} hint={empresa ? empresaLabel(empresa) : "todas as empresas"} />
        <StatCard label="Peças" value={formatNumber(pecas)} icon={<Package className="h-7 w-7" />} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Baixar em Excel</CardTitle>
          <CardDescription>Os arquivos trazem só código, nome e quantidade.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href={`/relatorios/exportar?tipo=estoque${eq}&soestoque=${zerados ? 0 : 1}`} download>
              <Download className="h-5 w-5" aria-hidden /> Estoque {empresa ? empresaLabel(empresa) : "(todas)"}
            </a>
          </Button>
          <Button asChild size="lg" variant="dark">
            <a href={`/relatorios/exportar?tipo=empresas`} download>
              <Download className="h-5 w-5" aria-hidden /> Todas as empresas (1 aba por empresa)
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={`/relatorios/exportar?tipo=maiores&top=50${eq}`} download>
              <Download className="h-5 w-5" aria-hidden /> Maiores estoques
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Estoque atual</CardTitle>
          {rows.length > MAX_ROWS_ON_SCREEN && (
            <CardDescription>Mostrando os {MAX_ROWS_ON_SCREEN} primeiros; o Excel traz todos.</CardDescription>
          )}
        </CardHeader>
        <DataTable<StockRow>
          caption="Estoque atual por item"
          rows={rows.slice(0, MAX_ROWS_ON_SCREEN)}
          rowKey={(r) => r.variant_id}
          empty={<p className="px-5 pb-8 text-center text-slate-500">Nenhum item encontrado.</p>}
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
            { header: "Quantidade", align: "right", cell: (r) => <strong className="text-xl">{formatNumber(r.estoque)}</strong> },
          ]}
        />
      </Card>
    </>
  );
}
