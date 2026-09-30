"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { toLoginEmail } from "@/lib/auth/identity";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(2, "Informe o usuário.")
    .max(120)
    .transform(toLoginEmail)
    .pipe(z.string().email("Usuário inválido.")),
  password: z.string().min(1, "Informe a senha.").max(200),
});

export type LoginState = { error?: string } | undefined;

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isSupabaseConfigured()) return { error: "Sistema ainda não configurado (variáveis do Supabase ausentes)." };

  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "E-mail ou senha incorretos." };

  const { data: profile } = await supabase.from("profiles").select("ativo").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.ativo) {
    await supabase.auth.signOut();
    return { error: "Usuário desativado. Procure um administrador." };
  }

  const { ip, ua } = await getRequestMeta();
  await supabase.rpc("log_audit_event", {
    p_action: "login",
    p_entity_type: "profile",
    p_entity_id: data.user.id,
    p_metadata: {},
    p_ip: ip,
    p_ua: ua,
  });

  redirect(safeNext(formData.get("next")));
}
