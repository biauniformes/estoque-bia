import { redirect } from "next/navigation";
import { first } from "@/lib/utils";

/** A saída avulsa foi unificada na tela "Saída" (/saida-oc) (links antigos continuam funcionando). */
export default async function SaidaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const variant = first((await searchParams).variant);
  redirect(variant ? `/saida-oc?variant=${encodeURIComponent(variant)}` : "/saida-oc");
}
