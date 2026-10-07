"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import { dbErrorToResult } from "@/lib/errors";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { correctionSchema, movementSchema, type MovementInput } from "@/lib/validations/movement";
import { normalizeOc } from "@/lib/utils";
import { z } from "zod";
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
  const profile = await requireUser();
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, error: parsed.error.issues[0].message, code: "VALIDACAO", fieldErrors };
  }
  const v = parsed.data;
  // quem não é administrador só registra saída com o número da OC (o banco também exige)
  if (v.tipo === "saida" && profile.role !== "admin" && !normalizeOc(v.oc)) {
    return { ok: false, error: "Informe o número da OC para registrar a saída.", code: "OC_OBRIGATORIA", fieldErrors: { oc: "Informe o número da OC." } };
  }
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

const countSchema = z.object({
  key: z.string().min(8).max(100),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantidade: z.number().int().min(1, "Quantidade inválida.").max(1_000_000, "Quantidade acima do limite."),
      }),
    )
    .min(1, "Preencha ao menos uma quantidade.")
    .max(1000, "No máximo 1000 itens por lançamento."),
});

export type CountResult = { lancados: number; repetidos: number; pecas: number; valor: number };

/** Contagem inicial em lote (somente administrador). Tudo ou nada, com chave anti-duplicidade. */
export async function registerInitialCountAction(input: {
  key: string;
  items: { variantId: string; quantidade: number }[];
}): Promise<ActionResult<CountResult>> {
  await requireAdmin();
  const parsed = countSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "VALIDACAO" };
  const ids = new Set(parsed.data.items.map((i) => i.variantId));
  if (ids.size !== parsed.data.items.length) return { ok: false, error: "Há itens repetidos no lote.", code: "VALIDACAO" };

  const supabase = await createClient();
  const meta = await getRequestMeta();
  const { data, error } = await supabase.rpc("register_initial_count", {
    p_items: parsed.data.items.map((i) => ({ variant_id: i.variantId, quantidade: i.quantidade })),
    p_batch_key: parsed.data.key,
    p_ip: meta.ip,
    p_ua: meta.ua,
  });
  if (error) return dbErrorToResult(error);
  refresh();
  revalidatePath("/contagem");
  return { ok: true, data: data as CountResult };
}

const ocExitSchema = z.object({
  oc: z.string().trim().min(1, "Informe o número da OC.").max(30),
  key: z.string().min(8).max(100),
  observacao: z.string().trim().max(500, "Observação muito longa (máx. 500).").default(""),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantidade: z.number().int().min(1, "A quantidade de cada peça deve ser maior que zero.").max(1_000_000, "Quantidade acima do limite."),
      }),
    )
    .min(1, "Adicione ao menos uma peça.")
    .max(500, "No máximo 500 itens por saída."),
});

export type OcExitResult = {
  oc: string;
  lancados: number;
  repetidos: number;
  pecas: number;
  itens: { variant_id: string; estoque_posterior: number }[];
};

/** Saída de várias peças para UMA OC, tudo ou nada (qualquer usuário ativo). */
export async function registerOcExitAction(input: {
  oc: string;
  key: string;
  observacao?: string;
  items: { variantId: string; quantidade: number }[];
}): Promise<ActionResult<OcExitResult>> {
  await requireUser();
  const parsed = ocExitSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, code: "VALIDACAO", fieldErrors: issue.path[0] === "oc" ? { oc: issue.message } : undefined };
  }
  const v = parsed.data;
  const oc = normalizeOc(v.oc);
  if (!/^[A-Z0-9./-]{1,20}$/.test(oc)) {
    return { ok: false, error: "Número de OC inválido (use letras, números, . / -).", code: "OC_INVALIDA", fieldErrors: { oc: "OC inválida." } };
  }
  if (new Set(v.items.map((i) => i.variantId)).size !== v.items.length) {
    return { ok: false, error: "Há peças repetidas na lista.", code: "VALIDACAO" };
  }

  const supabase = await createClient();
  const meta = await getRequestMeta();
  const { data, error } = await supabase.rpc("register_oc_exit", {
    p_oc: oc,
    p_items: v.items.map((i) => ({ variant_id: i.variantId, quantidade: i.quantidade })),
    p_batch_key: v.key,
    p_obs: v.observacao || null,
    p_ip: meta.ip,
    p_ua: meta.ua,
  });
  if (error) {
    const result = dbErrorToResult(error);
    await logInvalid(supabase, meta, { lote_oc: oc, itens: v.items.length, erro: result.code ?? "ERRO", mensagem: result.error });
    return result;
  }
  refresh();
  return { ok: true, data: data as OcExitResult };
}
