"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import { dbErrorToResult } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { isDate, isUuid } from "@/lib/utils";
import type { ActionResult } from "@/types";

export type TalhacaoResult = { lancados: number; pecas: number; repetido: boolean };

const lancamentoSchema = z.object({
  funcionariaId: z.string().refine(isUuid, "Selecione a funcionária."),
  data: z.string().refine(isDate, "Informe a data."),
  peca: z.string().trim().min(2, "Selecione a peça.").max(200),
  key: z.string().min(8).max(60),
  observacao: z.string().trim().max(300, "Observação muito longa.").optional(),
  itens: z
    .array(z.object({ tamanho: z.string().trim().min(1).max(20), quantidade: z.number().int("Quantidade inválida.").min(1, "Informe a quantidade de cada tamanho.").max(999999) }))
    .min(1, "Escolha ao menos um tamanho e informe a quantidade.")
    .max(60),
});

async function guard() {
  const profile = await requireUser();
  if (profile.role === "expedicao") return { profile, error: { ok: false as const, error: "Seu perfil não tem acesso à Talhação.", code: "SEM_PERMISSAO" } };
  return { profile, error: null };
}

function refresh() {
  revalidatePath("/talhacao");
  revalidatePath("/talhacao/historico");
}

export async function addFuncionariaAction(nome: string): Promise<ActionResult<{ id: string; nome: string }>> {
  const g = await guard();
  if (g.error) return g.error;
  const supabase = await createClient();
  const meta = await getRequestMeta();
  const { data, error } = await supabase.rpc("talhacao_add_funcionaria", { p_nome: nome, p_ip: meta.ip, p_ua: meta.ua });
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: data as { id: string; nome: string } };
}

export async function removeFuncionariaAction(id: string): Promise<ActionResult> {
  const g = await guard();
  if (g.error) return g.error;
  if (!isUuid(id)) return { ok: false, error: "Funcionária inválida." };
  const supabase = await createClient();
  const meta = await getRequestMeta();
  const { error } = await supabase.rpc("talhacao_remove_funcionaria", { p_id: id, p_ip: meta.ip, p_ua: meta.ua });
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function registerTalhacaoAction(input: z.input<typeof lancamentoSchema>): Promise<ActionResult<TalhacaoResult>> {
  const g = await guard();
  if (g.error) return g.error;
  const parsed = lancamentoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, code: "VALIDACAO" };
  const v = parsed.data;
  const supabase = await createClient();
  const meta = await getRequestMeta();
  const { data, error } = await supabase.rpc("register_talhacao", {
    p_funcionaria_id: v.funcionariaId,
    p_data: v.data,
    p_peca: v.peca,
    p_itens: v.itens,
    p_obs: v.observacao || null,
    p_key: v.key,
    p_ip: meta.ip,
    p_ua: meta.ua,
  });
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: data as TalhacaoResult };
}

export async function deleteTalhacaoAction(loteKey: string): Promise<ActionResult> {
  const g = await guard();
  if (g.error) return g.error;
  if (typeof loteKey !== "string" || loteKey.length < 8 || loteKey.length > 60) return { ok: false, error: "Lançamento inválido." };
  const supabase = await createClient();
  const meta = await getRequestMeta();
  const { error } = await supabase.rpc("talhacao_delete_lote", { p_key: loteKey, p_ip: meta.ip, p_ua: meta.ua });
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: undefined };
}
