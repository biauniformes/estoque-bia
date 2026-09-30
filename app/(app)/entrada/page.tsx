import { MovementForm } from "@/components/estoque/movement-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import { first } from "@/lib/utils";

export const metadata = { title: "Entrada de estoque" };

export default async function EntradaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const variants = await listActiveVariants();
  return (
    <>
      <PageHeader title="Entrada de estoque" description="Registre a chegada de mercadoria em poucos toques." />
      <MovementForm tipo="entrada" variants={variants} initialVariantId={first(sp.variant)} />
    </>
  );
}
