import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { carregarConsolidacao } from "@/services/oc";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { LigacoesEditor, type TamanhoPendente } from "@/components/oc/ligacoes-editor";

export const metadata = { title: "Ligações de códigos" };
export const dynamic = "force-dynamic";

export default async function LigacoesPage() {
  const profile = await requireUser();
  if (profile.role !== "admin" && profile.role !== "operator") redirect("/consolidacao");
  const { ordens, ligacoes, modelosLista } = await carregarConsolidacao();

  const pendentesPorCod: Record<string, number> = {};
  const tamanhos = new Map<string, TamanhoPendente>();
  for (const o of ordens.filter((o) => o.status === "pendente")) {
    for (const i of o.itens) {
      pendentesPorCod[i.cod] = (pendentesPorCod[i.cod] ?? 0) + i.qtd;
      if (i.res.status === "sem_tamanho" || i.res.status === "sem_produto") {
        const k = `${i.cod}|${i.tam}`;
        const t = tamanhos.get(k) ?? {
          cod: i.cod,
          tam: i.tam,
          desc: i.desc,
          qtd: 0,
          motivo: i.res.status === "sem_tamanho" ? "sem conversão de tamanho" : `o código ${i.res.codigo} não existe no nosso catálogo`,
        };
        t.qtd += i.qtd;
        tamanhos.set(k, t);
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Ligações de códigos"
        description="Código do cliente → nosso modelo. Feito uma vez, vale para todas as próximas OCs."
        actions={
          <Button asChild variant="outline" size="lg">
            <Link href="/consolidacao">Voltar à consolidação</Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-5xl">
        <LigacoesEditor ligacoes={ligacoes} modelos={modelosLista} pendentesPorCod={pendentesPorCod} tamanhos={[...tamanhos.values()].sort((a, b) => b.qtd - a.qtd)} />
      </div>
    </>
  );
}
