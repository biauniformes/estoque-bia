import { requireAdmin } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import { PageHeader } from "@/components/shared/page-header";
import { CountTable } from "@/components/estoque/count-table";

export const metadata = { title: "Contagem inicial" };

export default async function ContagemPage() {
  await requireAdmin();
  const variants = await listActiveVariants();
  return (
    <>
      <PageHeader
        title="Contagem inicial"
        description="Digite as quantidades de vários itens e lance tudo de uma vez. Cada item vira uma entrada com o motivo “Contagem inicial”."
      />
      <CountTable variants={variants} />
    </>
  );
}
