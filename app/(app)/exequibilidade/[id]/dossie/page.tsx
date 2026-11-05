import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getLicitacao, listAnexos } from "@/services/licitacoes";
import { isUuid } from "@/lib/utils";
import { normalizar } from "@/lib/exequibilidade/normalizar";
import { analiseVazia } from "@/lib/exequibilidade/defaults";
import { DossieView } from "@/components/exequibilidade/dossie-view";

export const metadata = { title: "Dossiê da licitação" };

export default async function DossiePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lic = await getLicitacao(id);
  if (!lic) notFound();
  const [anexos, documentosEmpresa] = await Promise.all([listAnexos(id), listAnexos(null)]);
  return (
    <DossieView
      titulo={lic.titulo}
      status={lic.status}
      dataSessao={lic.data_sessao}
      analise={normalizar(lic.analise) ?? analiseVazia()}
      checklist={lic.checklist ?? {}}
      anexos={anexos}
      documentosEmpresa={documentosEmpresa}
    />
  );
}
