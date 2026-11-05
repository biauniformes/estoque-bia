import Link from "next/link";
import { AlertTriangle, FolderOpen } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { listLicitacoes, contarDocumentosVencendo } from "@/services/licitacoes";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { NovaLicitacao } from "@/components/exequibilidade/nova-licitacao";
import { StatusBadge } from "@/components/exequibilidade/status-badge";
import { formatBRL } from "@/lib/exequibilidade/format";
import { formatDataBR, progressoChecklist, rotuloStatusLicitacao } from "@/lib/exequibilidade/licitacao";
import type { StatusExequibilidade } from "@/lib/exequibilidade/types";

export const metadata = { title: "Exequibilidade" };

export default async function ExequibilidadePage() {
  await requireAdmin();
  let lista: Awaited<ReturnType<typeof listLicitacoes>>;
  let vencendo = 0;
  try {
    [lista, vencendo] = await Promise.all([listLicitacoes(), contarDocumentosVencendo()]);
  } catch {
    return (
      <>
        <PageHeader title="Exequibilidade" />
        <ErrorState
          title="Falta atualizar o banco de dados"
          description="Rode o arquivo supabase/migrations/0018_exequibilidade.sql no SQL Editor do Supabase e recarregue esta página."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Exequibilidade e licitações"
        description="Uma pasta por licitação: planilha de custos, defesa de exequibilidade (Lei 14.133/2021), habilitação e documentos de prova, prontos para imprimir."
        actions={
          <>
            <Button asChild size="lg" variant="outline">
              <Link href="/exequibilidade/documentos"><FolderOpen className="h-5 w-5" aria-hidden /> Documentos da empresa</Link>
            </Button>
            <NovaLicitacao />
          </>
        }
      />

      {vencendo > 0 && (
        <Link
          href="/exequibilidade/documentos"
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 font-bold text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          {vencendo} documento(s) da empresa vencido(s) ou vencendo em até 30 dias. Toque para ver.
        </Link>
      )}

      <Card className="overflow-hidden">
        {lista.length === 0 ? (
          <EmptyState title="Nenhuma licitação ainda" description="Toque em “Nova licitação” para começar a primeira análise." className="py-12" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Licitações cadastradas</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Licitação</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Sessão</th>
                  <th className="px-4 py-3 text-right">Estimado</th>
                  <th className="px-4 py-3 text-right">Ofertado</th>
                  <th className="px-4 py-3">Exequibilidade</th>
                  <th className="px-4 py-3">Habilitação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((l) => {
                  const p = progressoChecklist(l.checklist ?? {});
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/exequibilidade/${l.id}`} className="font-bold hover:text-orange-700 hover:underline">{l.titulo}</Link>
                        {(l.orgao || l.edital) && <span className="block text-xs text-slate-500">{[l.orgao, l.edital].filter(Boolean).join(" · ")}</span>}
                      </td>
                      <td className="px-4 py-3">{rotuloStatusLicitacao(l.status)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatDataBR(l.data_sessao)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{l.valor_estimado ? formatBRL(Number(l.valor_estimado)) : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{l.preco_ofertado ? formatBRL(Number(l.preco_ofertado)) : "—"}</td>
                      <td className="px-4 py-3">
                        {l.status_exequibilidade ? <StatusBadge status={l.status_exequibilidade as StatusExequibilidade} /> : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{p.ok} / {p.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
