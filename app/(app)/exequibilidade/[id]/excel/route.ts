import { getCurrentProfile } from "@/lib/auth/session";
import { getLicitacao, listAnexos } from "@/services/licitacoes";
import { isUuid } from "@/lib/utils";
import { normalizar } from "@/lib/exequibilidade/normalizar";
import { analiseVazia } from "@/lib/exequibilidade/defaults";
import { montarPlanilha } from "@/lib/exequibilidade/excel";

export const dynamic = "force-dynamic";

/** Planilha de custos e formação de preços da licitação, em Excel (só administrador). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.ativo) return new Response("Não autenticado", { status: 401 });
  if (profile.role !== "admin") return new Response("Acesso negado", { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Licitação inválida", { status: 400 });
  const lic = await getLicitacao(id);
  if (!lic) return new Response("Licitação não encontrada", { status: 404 });
  const [anexos, documentosEmpresa] = await Promise.all([listAnexos(id), listAnexos(null)]);
  const buf = await montarPlanilha({
    titulo: lic.titulo,
    status: lic.status,
    dataSessao: lic.data_sessao,
    analise: normalizar(lic.analise) ?? analiseVazia(),
    checklist: lic.checklist ?? {},
    anexos,
    documentosEmpresa,
  });
  const slug = lic.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "licitacao";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="planilha-exequibilidade-${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
