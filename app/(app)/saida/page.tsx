import { MovementForm } from "@/components/estoque/movement-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { listActiveVariants } from "@/services/stock";
import Link from "next/link";
import { first } from "@/lib/utils";

export const metadata = { title: "Saída de estoque" };

export default async function SaidaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireUser();
  const sp = await searchParams;
  const variants = await listActiveVariants();
  return (
    <>
      <PageHeader title="Saída de estoque" description="Retire uma peça por vez. O estoque nunca fica negativo." />
      <p className="mx-auto mb-6 max-w-3xl rounded-2xl border-2 border-slate-300 bg-white p-4 text-slate-700">
        Vai tirar <strong>várias peças da mesma OC</strong>?{" "}
        <Link href="/saida-oc" className="font-bold text-orange-700 underline underline-offset-4">Use “Saída por OC”</Link> e lance tudo de uma vez.
      </p>
      <MovementForm tipo="saida" variants={variants} initialVariantId={first(sp.variant)} isAdmin={profile.role === "admin"} />
    </>
  );
}
