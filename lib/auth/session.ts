import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import type { Profile } from "@/types";

/** Usuário autenticado + perfil. Usa getUser() (valida o token no Auth) e é memoizado por request. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  return (data as Profile | null) ?? null;
});

export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.ativo) redirect("/auth/inactive");
  return profile;
}

/** Garante administrador no SERVIDOR. Tentativas de operadores ficam registradas na auditoria. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "admin") {
    try {
      const supabase = await createClient();
      const { ip, ua } = await getRequestMeta();
      await supabase.rpc("log_audit_event", {
        p_action: "operacao_invalida",
        p_entity_type: "rota",
        p_entity_id: null,
        p_metadata: { motivo: "acesso_negado_area_administrativa" },
        p_ip: ip,
        p_ua: ua,
      });
    } catch {
      // auditoria é best-effort aqui; o bloqueio acontece de qualquer forma
    }
    redirect("/acesso-negado");
  }
  return profile;
}
