"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { getRequestMeta } from "@/lib/request-meta";
import { dbErrorToResult } from "@/lib/errors";
import { isUuid } from "@/lib/utils";
import { toLoginEmail } from "@/lib/auth/identity";
import type { ActionResult } from "@/types";
import type { FormState } from "./products";

const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(72, "Senha muito longa.")
  .regex(/[A-Za-z]/, "A senha deve conter letras.")
  .regex(/\d/, "A senha deve conter números.");

const createSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z
    .string()
    .trim()
    .min(2, "Informe o usuário.")
    .max(120)
    .transform(toLoginEmail)
    .pipe(z.string().email("Usuário inválido (use letras e números, sem espaços).")),
  role: z.enum(["admin", "operator"], { error: "Selecione a função." }),
  password: passwordSchema,
});

const BAN_FOREVER = "876000h";

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: parsed.error.issues[0].message, code: "VALIDACAO", fieldErrors };
  }
  const u = parsed.data;

  const svc = createAdminClient();
  const { data, error } = await svc.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    app_metadata: { role: u.role },
    user_metadata: { nome: u.nome },
  });
  if (error || !data.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? "");
    return { ok: false, error: dup ? "Já existe um usuário com este e-mail." : "Não foi possível criar o usuário.", fieldErrors: dup ? { email: "E-mail já cadastrado." } : undefined };
  }

  // o Auth grava app_metadata depois do insert (o trigger cria o perfil como operador);
  // por isso o papel é definido explicitamente no perfil
  const { error: roleError } = await svc.from("profiles").update({ role: u.role }).eq("id", data.user.id);
  if (roleError) return { ok: false, error: "Usuário criado, mas não foi possível definir a função. Ajuste em Usuários." };

  const supabase = await createClient();
  const { ip, ua } = await getRequestMeta();
  await supabase.rpc("log_audit_event", {
    p_action: "criacao_usuario",
    p_entity_type: "profile",
    p_entity_id: data.user.id,
    p_metadata: { rotulo: u.nome, email: u.email, role: u.role, criado_por: admin.nome },
    p_ip: ip,
    p_ua: ua,
  });
  revalidatePath("/usuarios");
  return { ok: true, data: undefined, message: `Usuário ${u.nome} criado.` };
}

/** Altera função e/ou situação (RLS: só admin; trigger registra na auditoria e protege o último admin). */
export async function updateUserAction(userId: string, changes: { role?: "admin" | "operator"; ativo?: boolean }): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!isUuid(userId)) return { ok: false, error: "Usuário inválido." };
  if (userId === admin.id) return { ok: false, error: "Você não pode alterar a própria função ou situação." };
  const payload: Record<string, unknown> = {};
  if (changes.role === "admin" || changes.role === "operator") payload.role = changes.role;
  if (typeof changes.ativo === "boolean") payload.ativo = changes.ativo;
  if (Object.keys(payload).length === 0) return { ok: false, error: "Nada para alterar." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update(payload).eq("id", userId).select("id");
  if (error) return dbErrorToResult(error);
  if (!data?.length) return { ok: false, error: "Usuário não encontrado." };

  try {
    const svc = createAdminClient();
    if (typeof payload.ativo === "boolean") await svc.auth.admin.updateUserById(userId, { ban_duration: payload.ativo ? "none" : BAN_FOREVER });
    if (payload.role) await svc.auth.admin.updateUserById(userId, { app_metadata: { role: payload.role } });
  } catch {
    // o bloqueio real é o campo `ativo` verificado no banco; o ban é reforço
  }
  revalidatePath("/usuarios");
  return { ok: true, data: undefined, message: "Usuário atualizado." };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!isUuid(userId)) return { ok: false, error: "Usuário inválido." };
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fieldErrors: { password: parsed.error.issues[0].message } };

  const svc = createAdminClient();
  const { error } = await svc.auth.admin.updateUserById(userId, { password: parsed.data });
  if (error) return { ok: false, error: "Não foi possível redefinir a senha." };

  const supabase = await createClient();
  const { ip, ua } = await getRequestMeta();
  await supabase.rpc("log_audit_event", {
    p_action: "senha_redefinida",
    p_entity_type: "profile",
    p_entity_id: userId,
    p_metadata: { redefinida_por: admin.nome },
    p_ip: ip,
    p_ua: ua,
  });
  return { ok: true, data: undefined, message: "Senha redefinida." };
}
