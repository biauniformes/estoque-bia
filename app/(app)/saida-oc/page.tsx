import { requireNotCorte } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import { PageHeader } from "@/components/shared/page-header";
import { OcExitForm } from "@/components/estoque/oc-exit-form";
import { first } from "@/lib/utils";

export const metadata = { title: "Saída de estoque" };

export default async function SaidaOcPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireNotCorte();
  const sp = await searchParams;
  const variants = await listActiveVariants();
  return (
    <>
      <PageHeader
        title="Saída de estoque"
        description={
          profile.role === "admin"
            ? "Adicione todas as peças e quantidades e confirme de uma só vez. O número da OC é opcional para administradores."
            : "Informe a OC uma vez, adicione todas as peças e quantidades e confirme de uma só vez."
        }
      />
      <OcExitForm variants={variants} isAdmin={profile.role === "admin"} initialVariantId={first(sp.variant)} />
    </>
  );
}
