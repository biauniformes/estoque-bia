import { MovementForm } from "@/components/estoque/movement-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import { first } from "@/lib/utils";

export const metadata = { title: "Saída de estoque" };

export default async function SaidaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const variants = await listActiveVariants();
  return (
    <>
      <PageHeader title="Saída de estoque" description="Retire itens para uma OC ou outro destino. O estoque nunca fica negativo." />
      <MovementForm tipo="saida" variants={variants} initialVariantId={first(sp.variant)} />
    </>
  );
}
