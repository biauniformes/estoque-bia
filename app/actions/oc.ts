"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import { dbErrorToResult } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { lerOcOrbenk } from "@/lib/oc-parser";
import { TAMANHOS_NOSSOS } from "@/lib/oc";
import { isUuid } from "@/lib/utils";
import type { ActionResult } from "@/types";

export type ImportResultado = {
  arquivo: string;
  ok: boolean;
  numero?: string;
  empresa?: string;
  itens?: number;
  pecas?: number;
  duplicada?: boolean;
  aviso?: string;
  erro?: string;
};

const MAX_ARQUIVOS = 60;
const MAX_BYTES = 3 * 1024 * 1024;

function refresh() {
  revalidatePath("/consolidacao");
  revalidatePath("/consolidacao/ligacoes");
}

async function podeEscrever() {
  const profile = await requireUser();
  if (profile.role !== "admin" && profile.role !== "operator") {
    return { profile, erro: { ok: false as const, error: "Só administrador e operador alteram a consolidação de OC.", code: "SEM_PERMISSAO" } };
  }
  return { profile, erro: null };
}

async function auditar(supabase: Awaited<ReturnType<typeof createClient>>, action: string, meta: Record<string, unknown>) {
  try {
    const { ip, ua } = await getRequestMeta();
    await supabase.rpc("oc_log_audit", { p_action: action, p_meta: meta, p_ip: ip, p_ua: ua });
  } catch {
    // auditoria é melhor-esforço aqui; a operação já foi feita sob as regras de acesso do banco
  }
}

/** Lê os PDFs enviados e grava cada OC (itens + produtos novos do cliente para ligar). */
export async function importarOcsAction(formData: FormData): Promise<ActionResult<ImportResultado[]>> {
  const g = await podeEscrever();
  if (g.erro) return g.erro;
  const arquivos = formData.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) return { ok: false, error: "Escolha ao menos um arquivo PDF." };
  if (arquivos.length > MAX_ARQUIVOS) return { ok: false, error: `Envie no máximo ${MAX_ARQUIVOS} arquivos por vez.` };

  const supabase = await createClient();
  const resultados: ImportResultado[] = [];
  for (const f of arquivos) {
    const r: ImportResultado = { arquivo: f.name, ok: false };
    try {
      if (f.size > MAX_BYTES) throw new Error("Arquivo muito grande.");
      const oc = await lerOcOrbenk(new Uint8Array(await f.arrayBuffer()));
      if (oc.itens.length === 0) throw new Error("Nenhum item encontrado neste PDF.");
      r.numero = oc.numero;
      r.empresa = oc.empresa;
      r.itens = oc.itens.length;
      r.pecas = oc.itens.reduce((s, i) => s + i.quantidade, 0);
      if (oc.naoLidas.length > 0) r.aviso = `${oc.naoLidas.length} linha(s) não puderam ser lidas — confira o PDF.`;

      const jaExiste = await supabase.from("oc_ordens").select("id").eq("cliente", oc.cliente).eq("empresa", oc.empresa).eq("numero", oc.numero).maybeSingle();
      if (jaExiste.error) throw new Error(jaExiste.error.message);
      if (jaExiste.data) {
        r.ok = true;
        r.duplicada = true;
        resultados.push(r);
        continue;
      }

      const ordem = await supabase
        .from("oc_ordens")
        .insert({ cliente: oc.cliente, empresa: oc.empresa, cnpj: oc.cnpj, numero: oc.numero, entrega: oc.entrega, arquivo: f.name.slice(0, 200), created_by: g.profile.id })
        .select("id")
        .single();
      if (ordem.error) throw new Error(ordem.error.message);
      const itens = await supabase.from("oc_itens").insert(
        oc.itens.map((i) => ({
          ordem_id: ordem.data.id,
          seq: i.seq,
          cod_cliente: i.codCliente,
          tamanho: i.tamanho.toUpperCase(),
          descricao: i.descricao.slice(0, 200),
          quantidade: Math.round(i.quantidade),
          cod_nosso_pdf: i.codNosso || null,
        })),
      );
      if (itens.error) {
        await supabase.from("oc_ordens").delete().eq("id", ordem.data.id);
        throw new Error(itens.error.message);
      }
      // produtos do cliente que ainda não têm ligação entram na tabela (sem modelo) para serem ligados na tela
      const novos = new Map<string, string>();
      for (const i of oc.itens) if (!novos.has(i.codCliente)) novos.set(i.codCliente, i.descricao);
      await supabase
        .from("oc_modelo_map")
        .upsert([...novos].map(([cod, descricao]) => ({ cliente: oc.cliente, cod_cliente: cod, descricao: descricao.slice(0, 200) })), { onConflict: "cliente,cod_cliente", ignoreDuplicates: true });
      await auditar(supabase, "oc_importada", { numero: oc.numero, empresa: oc.empresa, itens: oc.itens.length, pecas: r.pecas, arquivo: f.name });
      r.ok = true;
    } catch (e) {
      r.erro = e instanceof Error ? e.message : "Não foi possível ler este arquivo.";
    }
    resultados.push(r);
  }
  refresh();
  return { ok: true, data: resultados };
}

const statusSchema = z.object({ ids: z.array(z.string().refine(isUuid)).min(1).max(500), status: z.enum(["pendente", "separada"]) });

export async function marcarOrdensAction(input: { ids: string[]; status: "pendente" | "separada" }): Promise<ActionResult> {
  const g = await podeEscrever();
  if (g.erro) return g.erro;
  const p = statusSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Seleção inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oc_ordens")
    .update({ status: p.data.status, separada_em: p.data.status === "separada" ? new Date().toISOString() : null })
    .in("id", p.data.ids);
  if (error) return dbErrorToResult(error);
  await auditar(supabase, p.data.status === "separada" ? "oc_separada" : "oc_reaberta", { ordens: p.data.ids.length });
  refresh();
  return { ok: true, data: undefined };
}

export async function excluirOrdemAction(id: string): Promise<ActionResult> {
  const g = await podeEscrever();
  if (g.erro) return g.erro;
  if (!isUuid(id)) return { ok: false, error: "OC inválida." };
  const supabase = await createClient();
  const antes = await supabase.from("oc_ordens").select("numero, empresa").eq("id", id).maybeSingle();
  const { error } = await supabase.from("oc_ordens").delete().eq("id", id);
  if (error) return dbErrorToResult(error);
  await auditar(supabase, "oc_excluida", { numero: antes.data?.numero, empresa: antes.data?.empresa });
  refresh();
  return { ok: true, data: undefined };
}

const modeloSchema = z.object({
  codCliente: z.string().trim().min(3).max(30),
  modelo: z.string().regex(/^\d{3}\.\d{3}$/, "Modelo inválido.").nullable(),
  confirmado: z.boolean(),
});

export async function salvarLigacaoModeloAction(input: z.input<typeof modeloSchema>): Promise<ActionResult> {
  const g = await podeEscrever();
  if (g.erro) return g.erro;
  const p = modeloSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("oc_modelo_map").upsert(
    {
      cliente: "ORBENK",
      cod_cliente: p.data.codCliente,
      modelo: p.data.modelo,
      confirmado: p.data.modelo ? p.data.confirmado : false,
      updated_at: new Date().toISOString(),
      updated_by: g.profile.id,
    },
    { onConflict: "cliente,cod_cliente" },
  );
  if (error) return dbErrorToResult(error);
  await auditar(supabase, "oc_ligacao_alterada", { cod_cliente: p.data.codCliente, modelo: p.data.modelo, confirmado: p.data.confirmado });
  refresh();
  return { ok: true, data: undefined };
}

const tamanhoSchema = z.object({
  codCliente: z.string().trim().min(3).max(30),
  tamanhoCliente: z.string().trim().min(1).max(20),
  tamanhoNosso: z.enum(TAMANHOS_NOSSOS),
});

export async function salvarLigacaoTamanhoAction(input: z.input<typeof tamanhoSchema>): Promise<ActionResult> {
  const g = await podeEscrever();
  if (g.erro) return g.erro;
  const p = tamanhoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Escolha o tamanho." };
  const supabase = await createClient();
  const { error } = await supabase.from("oc_tamanho_map").upsert(
    {
      cliente: "ORBENK",
      cod_cliente: p.data.codCliente,
      tamanho_cliente: p.data.tamanhoCliente.toUpperCase(),
      tamanho_nosso: p.data.tamanhoNosso,
      updated_at: new Date().toISOString(),
      updated_by: g.profile.id,
    },
    { onConflict: "cliente,cod_cliente,tamanho_cliente" },
  );
  if (error) return dbErrorToResult(error);
  await auditar(supabase, "oc_ligacao_alterada", { cod_cliente: p.data.codCliente, tamanho_cliente: p.data.tamanhoCliente, tamanho_nosso: p.data.tamanhoNosso });
  refresh();
  return { ok: true, data: undefined };
}
