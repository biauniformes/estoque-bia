import { EntradaForm } from "@/components/estoque/entrada-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireNotRestricted } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import { first } from "@/lib/utils";

export const metadata = { title: "Entrada de estoque" };

export default async function EntradaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireNotRestricted();
  const sp = await searchParams;
  const variants = await listActiveVariants();
  return (
    <>
      <PageHeader title="Entrada de estoque" description="Registre a chegada de várias peças de uma vez: busque o modelo, toque nos tamanhos e informe as quantidades." />
      <EntradaForm variants={variants} initialVariantId={first(sp.variant)} />
    </>
  );
}
