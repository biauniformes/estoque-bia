import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Acesso negado" };

export default function AccessDeniedPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-20 text-center">
      <ShieldAlert className="h-16 w-16 text-red-500" aria-hidden />
      <h1 className="text-3xl font-extrabold uppercase">Acesso negado</h1>
      <p className="text-lg text-slate-600">Esta área é exclusiva para administradores. A tentativa foi registrada.</p>
      <Button asChild size="lg" className="mt-4">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
