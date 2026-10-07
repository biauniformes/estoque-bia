import { requireUser } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import { PageHeader } from "@/components/shared/page-header";
import { OcExitForm } from "@/components/estoque/oc-exit-form";

export const metadata = { title: "Saída por OC" };

export default async function SaidaOcPage() {
  const profile = await requireUser();
  const variants = await listActiveVariants();
  return (
    <>
      <PageHeader
        title="Saída por OC"
        description={
          profile.role === "admin"
            ? "Adicione todas as peças e quantidades e confirme de uma só vez. O número da OC é opcional para administradores."
            : "Informe a OC uma vez, adicione todas as peças e quantidades e confirme de uma só vez."
        }
      />
      <OcExitForm variants={variants} isAdmin={profile.role === "admin"} />
    </>
  );
}
