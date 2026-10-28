import Link from "next/link";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/talhar", label: "Para talhar" },
  { href: "/talhacao/historico", label: "Histórico" },
];

/** Abas da área de Talhação (só o administrador vê o histórico). */
export function AbasTalhacao({ ativa }: { ativa: "/talhar" | "/talhacao/historico" }) {
  return (
    <nav aria-label="Talhação" className="mb-5 flex gap-2">
      {ABAS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={a.href === ativa ? "page" : undefined}
          className={cn(
            "flex min-h-12 items-center rounded-xl border-2 px-5 text-base font-bold",
            a.href === ativa ? "border-black bg-black text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand hover:bg-orange-50",
          )}
        >
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
