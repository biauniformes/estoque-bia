import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { carregarConsolidacao } from "@/services/oc";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ImportCard } from "@/components/oc/import-card";
import { ConsolidacaoView } from "@/components/oc/consolidacao-view";

export const metadata = { title: "Consolidação de OC" };
export const dynamic = "force-dynamic";

export default async function ConsolidacaoPage() {
  const profile = await requireUser();
  if (profile.role === "corte") redirect("/");
  const canWrite = profile.role === "admin" || profile.role === "operator";
  const { ordens } = await carregarConsolidacao();

  return (
    <>
      <PageHeader
        title="Consolidação de OC"
        description="Junte as ordens de compra do cliente e veja tudo o que precisa ser separado, já com os nossos códigos e o estoque."
        actions={
          canWrite ? (
            <Button asChild variant="outline" size="lg" className="no-print">
              <Link href="/consolidacao/ligacoes">Ligações de códigos</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mx-auto max-w-5xl space-y-4">
        {canWrite && <ImportCard aberto={ordens.length === 0} />}
        <ConsolidacaoView ordens={ordens} canWrite={canWrite} />
      </div>
    </>
  );
}
