import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { listAnexos } from "@/services/licitacoes";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/states";
import { AnexosPanel } from "@/components/exequibilidade/anexos-panel";

export const metadata = { title: "Documentos da empresa" };

export default async function DocumentosEmpresaPage() {
  await requireAdmin();
  let anexos: Awaited<ReturnType<typeof listAnexos>>;
  try {
    anexos = await listAnexos(null);
  } catch {
    return (
      <>
        <PageHeader title="Documentos da empresa" />
        <ErrorState title="Falta atualizar o banco de dados" description="Rode supabase/migrations/0018_exequibilidade.sql no Supabase e recarregue." />
      </>
    );
  }
  // ordena: vencidos/mais próximos do vencimento primeiro; sem validade por último
  anexos.sort((a, b) => (a.validade ?? "9999-12-31").localeCompare(b.validade ?? "9999-12-31"));
  return (
    <>
      <PageHeader
        title="Documentos da empresa"
        description="Certidões, contrato social, balanço, atestados e declarações que valem para qualquer licitação. O sistema avisa quando vencem."
        actions={
          <Button asChild variant="outline" size="lg">
            <Link href="/exequibilidade"><ArrowLeft className="h-5 w-5" aria-hidden /> Licitações</Link>
          </Button>
        }
      />
      <AnexosPanel
        licitacaoId={null}
        anexos={anexos}
        titulo="Guardar documento da empresa"
        descricao="Informe a validade das certidões (CND federal, FGTS, CNDT…) para receber o alerta de vencimento."
        itemInicial=""
      />
    </>
  );
}
