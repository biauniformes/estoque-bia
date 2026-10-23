import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, ListChecks, MinusCircle, Package, PlusCircle, Ruler, Scissors } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Início" };

const ACTIONS = [
  { href: "/entrada", label: "+ ENTRADA", hint: "Chegou mercadoria", icon: PlusCircle, cls: "bg-brand hover:bg-orange-400 text-black" },
  { href: "/saida-oc", label: "SAÍDA PARA OC", hint: "Vários itens de uma vez para a mesma OC", icon: ListChecks, cls: "bg-black hover:bg-neutral-700 text-white sm:col-span-2" },
  { href: "/saida", label: "− SAÍDA", hint: "Uma peça por vez (informe a OC)", icon: MinusCircle, cls: "bg-white hover:bg-slate-100 text-black border-2 border-black" },
  { href: "/estoque", label: "VER ESTOQUE", hint: "Quanto eu tenho?", icon: Package, cls: "bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-300" },
  { href: "/talhar", label: "PARA TALHAR", hint: "O que mais sai e está com estoque baixo", icon: Scissors, cls: "bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-300" },
  { href: "/talhacao", label: "TALHAÇÃO", hint: "Lançar o que foi talhado", icon: Ruler, cls: "bg-black hover:bg-neutral-700 text-white" },
  { href: "/movimentacoes", label: "MOVIMENTAÇÕES", hint: "O que eu já registrei", icon: ClipboardList, cls: "bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-300" },
];

export default async function HomePage() {
  const profile = await requireUser();
  if (profile.role === "admin") redirect("/dashboard");

  // itens com quantidade ABAIXO do mínimo (100 nas camisetas PV e calças de brim azul/branca; 50 nos demais)
  const supabase = await createClient();
  const acoes =
    profile.role === "expedicao"
      ? ACTIONS.filter((a) => ["/saida-oc", "/estoque"].includes(a.href))
      : profile.role === "corte"
        ? ACTIONS.filter((a) => ["/talhacao", "/talhar", "/estoque"].includes(a.href))
        : ACTIONS;
  const { count: baixos } = await supabase.from("stock_overview").select("variant_id", { count: "exact", head: true }).eq("ativo", true).eq("status", "baixo");

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-lg text-slate-500">Olá, {profile.nome.split(" ")[0]}</p>
      <h1 className="mb-8 text-4xl font-extrabold uppercase tracking-tight">O que você precisa fazer?</h1>
      {!!baixos && baixos > 0 && (
        <Link
          href="/estoque?status=baixo"
          className="mb-6 flex items-center gap-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle className="h-9 w-9 shrink-0" aria-hidden />
          <span className="text-lg font-bold">
            {formatNumber(baixos)} {baixos === 1 ? "item com estoque baixo" : "itens com estoque baixo"}
            <span className="block text-base font-medium">Toque para ver quais são.</span>
          </span>
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {acoes.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`flex min-h-44 flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center shadow-sm transition-transform active:scale-[0.98] ${a.cls}`}
          >
            <a.icon className="h-14 w-14" aria-hidden />
            <span className="text-3xl font-extrabold tracking-wide">{a.label}</span>
            <span className="text-base opacity-80">{a.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
