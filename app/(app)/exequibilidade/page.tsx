import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { ExequibilidadeView } from "@/components/exequibilidade/exequibilidade-view";

export const metadata = { title: "Exequibilidade" };

export default async function ExequibilidadePage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Exequibilidade"
        description="Simule custos, BDI e margem de uma licitação de uniformes e gere a defesa de exequibilidade (Lei 14.133/2021)."
      />
      <ExequibilidadeView />
    </>
  );
}
