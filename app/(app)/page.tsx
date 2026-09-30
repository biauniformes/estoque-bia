import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, MinusCircle, Package, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Início" };

const ACTIONS = [
  { href: "/entrada", label: "+ ENTRADA", hint: "Chegou mercadoria", icon: PlusCircle, cls: "bg-brand hover:bg-orange-400 text-black" },
  { href: "/saida", label: "− SAÍDA", hint: "Retirar para OC ou outro destino", icon: MinusCircle, cls: "bg-black hover:bg-neutral-700 text-white" },
  { href: "/estoque", label: "VER ESTOQUE", hint: "Quanto eu tenho?", icon: Package, cls: "bg-white hover:bg-slate-100 text-black border-2 border-black" },
  { href: "/movimentacoes", label: "MOVIMENTAÇÕES", hint: "O que eu já registrei", icon: ClipboardList, cls: "bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-300" },
];

export default async function HomePage() {
  const profile = await requireUser();
  if (profile.role === "admin") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-lg text-slate-500">Olá, {profile.nome.split(" ")[0]}</p>
      <h1 className="mb-8 text-4xl font-extrabold uppercase tracking-tight">O que você precisa fazer?</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {ACTIONS.map((a) => (
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
