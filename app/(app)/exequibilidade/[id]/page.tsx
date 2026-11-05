import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getLicitacao, listAnexos } from "@/services/licitacoes";
import { isUuid } from "@/lib/utils";
import { normalizar } from "@/lib/exequibilidade/normalizar";
import { analiseVazia } from "@/lib/exequibilidade/defaults";
import { ExequibilidadeView } from "@/components/exequibilidade/exequibilidade-view";

export const metadata = { title: "Licitação" };

export default async function LicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lic = await getLicitacao(id);
  if (!lic) notFound();
  const [anexos, documentosEmpresa] = await Promise.all([listAnexos(id), listAnexos(null)]);
  return (
    <ExequibilidadeView
      licitacao={{ id: lic.id, titulo: lic.titulo, status: lic.status, data_sessao: lic.data_sessao }}
      inicial={normalizar(lic.analise) ?? analiseVazia()}
      checklist={lic.checklist ?? {}}
      anexos={anexos}
      documentosEmpresa={documentosEmpresa}
    />
  );
}
