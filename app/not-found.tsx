import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-6xl font-extrabold text-brand">404</p>
      <h1 className="text-2xl font-extrabold uppercase">Página não encontrada</h1>
      <Button asChild size="lg" className="mt-2">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </main>
  );
}
