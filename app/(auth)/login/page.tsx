import { Settings2 } from "lucide-react";
import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  const configured = isSupabaseConfigured();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Bia Uniformes Corporativos" width={176} height={176} className="mb-4 h-44 w-44" />
          <h1 className="text-2xl font-extrabold uppercase tracking-wide text-white">Estoque Bia</h1>
          <p className="mt-1 text-brand">Controle inteligente de estoque para confecção</p>
        </div>
        <div className="rounded-3xl bg-white p-7 shadow-2xl">
          {!configured && (
            <div role="alert" className="mb-5 flex gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-900">
              <Settings2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p className="text-sm">
                Supabase não configurado. Copie <code className="font-bold">.env.example</code> para <code className="font-bold">.env.local</code> e
                preencha as variáveis (veja o README).
              </p>
            </div>
          )}
          {erro === "inativo" && (
            <p role="alert" className="mb-5 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
              Seu usuário está desativado. Procure um administrador.
            </p>
          )}
          <h2 className="mb-5 text-xl font-bold">Acessar o sistema</h2>
          <LoginForm next={next} disabled={!configured} />
        </div>
      </div>
    </main>
  );
}
