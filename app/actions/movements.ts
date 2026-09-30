"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import { dbErrorToResult } from "@/lib/errors";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { correctionSchema, movementSchema, type MovementInput } from "@/lib/validations/movement";
import type { ActionResult, MovementResult } from "@/types";

function refresh() {
  for (const p of ["/", "/dashboard", "/estoque", "/movimentacoes", "/ocs", "/auditoria"]) revalidatePath(p);
}

async function logInvalid(supabase: Awaited<ReturnType<typeof createClient>>, meta: { ip: string | null; ua: string | null }, info: Record<string, unknown>) {
  try {
    await supabase.rpc("log_audit_event", {
      p_action: "operacao_invalida",
      p_entity_type: "stock_movement",
      p_entity_id: null,
      p_metadata: info,
      p_ip: meta.ip,
      p_ua: meta.ua,
    });
  } catch {
    // melhor esforço
  }
}

export async function registerMovementAction(input: MovementInput): Promise<ActionResult<MovementResult>> {
  await requireUser();
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, error: parsed.error.issues[0].message, code: "VALIDACAO", fieldErrors };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const meta = await getRequestMeta();

  const { data, error } = await supabase.rpc("register_movement", {
    p_variant_id: v.variantId,
    p_tipo: v.tipo,
    p_quantidade: v.quantidade,
    p_motivo: v.motivo,
    p_oc: v.oc || null,
    p_observacao: v.observacao || null,
    p_idempotency_key: v.key,
    p_ip: meta.ip,
    p_ua: meta.ua,
  });

  if (error) {
    const result = dbErrorToResult(error);
    await logInvalid(supabase, meta, {
      tipo: v.tipo,
      quantidade: v.quantidade,
      motivo: v.motivo,
      variant_id: v.variantId,
      oc: v.oc || null,
      erro: result.code ?? "ERRO",
      mensagem: result.error,
    });
    return result;
  }

  refresh();
  return { ok: true, data: data as MovementResult };
}

export async function correctMovementAction(input: {
  movementId: string;
  quantidadeCorreta: number | string;
  observacao: string;
  key: string;
}): Promise<ActionResult<MovementResult>> {
  await requireAdmin();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, error: parsed.error.issues[0].message, code: "VALIDACAO", fieldErrors };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const meta = await getRequestMeta();
  const { data, error } = await supabase.rpc("correct_movement", {
    p_movement_id: v.movementId,
    p_quantidade_correta: v.quantidadeCorreta,
    p_observacao: v.observacao,
    p_idempotency_key: v.key,
    p_ip: meta.ip,
    p_ua: meta.ua,
  });
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: data as MovementResult };
}
