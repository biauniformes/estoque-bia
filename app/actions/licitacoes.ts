"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { isDate, isUuid } from "@/lib/utils";
import { dbErrorToResult } from "@/lib/errors";
import { analisar } from "@/lib/exequibilidade/calc";
import { analiseVazia } from "@/lib/exequibilidade/defaults";
import { normalizar } from "@/lib/exequibilidade/normalizar";
import { CATEGORIAS_ANEXO, PRAZO_REGEX, STATUS_LICITACAO, TIPOS_PRAZO, type Checklist, type Prazo } from "@/lib/exequibilidade/licitacao";
import type { Analise } from "@/lib/exequibilidade/types";
import type { ActionResult } from "@/types";

const BUCKET = "licitacoes";
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_OK = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

const falha = (error: string): Extract<ActionResult, { ok: false }> => ({ ok: false, error });
const refresh = (id?: string) => {
  revalidatePath("/exequibilidade");
  if (id) revalidatePath(`/exequibilidade/${id}`);
};

function resumo(a: Analise) {
  const r = analisar(a);
  return {
    orgao: a.identificacao.orgao.trim() || null,
    edital: a.identificacao.edital.trim() || null,
    valor_estimado: a.parametros.valorEstimado || null,
    preco_ofertado: a.parametros.precoOfertado || null,
    status_exequibilidade: r.statusGeral,
  };
}

export async function criarLicitacaoAction(input: { titulo: string; analiseJson?: string }): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdmin();
  const titulo = (input.titulo ?? "").trim();
  if (titulo.length < 2 || titulo.length > 200) return falha("Informe um nome para a licitação (ex.: Pregão 12/2026 — Prefeitura de X).");
  let analise = analiseVazia();
  if (input.analiseJson) {
    try {
      const n = normalizar(JSON.parse(input.analiseJson));
      if (!n) return falha("O arquivo não é uma análise exportada por este sistema.");
      analise = n;
    } catch {
      return falha("Arquivo inválido.");
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("licitacoes")
    .insert({ titulo, analise, created_by: profile.id, ...resumo(analise) })
    .select("id")
    .single();
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: { id: data.id as string } };
}

export async function salvarAnaliseAction(id: string, bruto: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return falha("Licitação inválida.");
  const analise = normalizar(bruto);
  if (!analise) return falha("Análise inválida.");
  const supabase = await createClient();
  const { error } = await supabase.from("licitacoes").update({ analise, updated_at: new Date().toISOString(), ...resumo(analise) }).eq("id", id);
  if (error) return dbErrorToResult(error);
  revalidatePath("/exequibilidade");
  return { ok: true, data: undefined };
}

const cabecalhoSchema = z.object({
  titulo: z.string().trim().min(2, "Informe o nome da licitação.").max(200),
  status: z.enum(STATUS_LICITACAO.map((s) => s.value) as [string, ...string[]]),
  dataSessao: z.string().refine((v) => v === "" || isDate(v), "Data inválida."),
});

export async function atualizarCabecalhoAction(id: string, input: z.input<typeof cabecalhoSchema>): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return falha("Licitação inválida.");
  const p = cabecalhoSchema.safeParse(input);
  if (!p.success) return falha(p.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase
    .from("licitacoes")
    .update({ titulo: p.data.titulo, status: p.data.status, data_sessao: p.data.dataSessao || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbErrorToResult(error);
  refresh(id);
  return { ok: true, data: undefined };
}

export async function salvarChecklistAction(id: string, checklist: Checklist): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return falha("Licitação inválida.");
  const limpo: Checklist = {};
  for (const [k, v] of Object.entries(checklist ?? {})) {
    if (!/^[a-z_]{2,40}$/.test(k) || !v) continue;
    limpo[k] = { ok: Boolean(v.ok), ...(v.obs ? { obs: String(v.obs).slice(0, 300) } : {}) };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("licitacoes").update({ checklist: limpo, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return dbErrorToResult(error);
  return { ok: true, data: undefined };
}

const prazosSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9]{4,20}$/),
      tipo: z.enum(TIPOS_PRAZO.map((t) => t.value) as [string, ...string[]]),
      descricao: z.string().trim().max(200),
      quando: z.string().regex(PRAZO_REGEX, "Informe data e hora do prazo."),
      concluido: z.boolean(),
    }),
  )
  .max(50, "Máximo de 50 prazos por licitação.");

export async function salvarPrazosAction(id: string, prazos: Prazo[]): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return falha("Licitação inválida.");
  const p = prazosSchema.safeParse(prazos);
  if (!p.success) return falha(p.error.issues[0].message);
  const ordenados = [...p.data].sort((x, y) => x.quando.localeCompare(y.quando));
  const supabase = await createClient();
  const { error } = await supabase.from("licitacoes").update({ prazos: ordenados, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (/prazos/.test(error.message))
      return falha("Falta atualizar o banco: rode supabase/migrations/0019_licitacao_prazos.sql no SQL Editor do Supabase.");
    return dbErrorToResult(error);
  }
  refresh(id);
  return { ok: true, data: undefined };
}

export async function excluirLicitacaoAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return falha("Licitação inválida.");
  const supabase = await createClient();
  const { data: anexos } = await supabase.from("licitacao_anexos").select("arquivo_path").eq("licitacao_id", id);
  const paths = (anexos ?? []).map((a) => a.arquivo_path as string);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("licitacoes").delete().eq("id", id);
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: undefined };
}

const anexoSchema = z.object({
  licitacaoId: z.string().refine((v) => v === "" || isUuid(v), "Licitação inválida."),
  categoria: z.enum(CATEGORIAS_ANEXO.map((c) => c.value) as [string, ...string[]]),
  item: z.string().trim().max(40),
  descricao: z.string().trim().min(2, "Descreva o documento (ex.: Cotação de tecido — Malharia X).").max(300),
  emissor: z.string().trim().max(200),
  numero: z.string().trim().max(100),
  emissao: z.string().refine((v) => v === "" || isDate(v), "Data de emissão inválida."),
  validade: z.string().refine((v) => v === "" || isDate(v), "Data de validade inválida."),
});

export async function enviarAnexoAction(form: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAdmin();
  const get = (k: string) => String(form.get(k) ?? "");
  const p = anexoSchema.safeParse({
    licitacaoId: get("licitacaoId"),
    categoria: get("categoria"),
    item: get("item"),
    descricao: get("descricao"),
    emissor: get("emissor"),
    numero: get("numero"),
    emissao: get("emissao"),
    validade: get("validade"),
  });
  if (!p.success) return falha(p.error.issues[0].message);
  const file = form.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return falha("Escolha o arquivo do documento.");
  if (file.size > MAX_BYTES) return falha("Arquivo maior que 5 MB. Reduza o PDF/foto e tente de novo.");
  if (!TIPOS_OK.includes(file.type)) return falha("Tipo de arquivo não aceito. Envie PDF, foto (JPG/PNG), Word ou Excel.");

  const supabase = await createClient();
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "bin";
  const pasta = p.data.licitacaoId || "empresa";
  const path = `${pasta}/${randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return falha("Não foi possível enviar o arquivo. Tente novamente.");

  const { data, error } = await supabase
    .from("licitacao_anexos")
    .insert({
      licitacao_id: p.data.licitacaoId || null,
      categoria: p.data.categoria,
      item: p.data.item || null,
      descricao: p.data.descricao,
      emissor: p.data.emissor || null,
      numero: p.data.numero || null,
      emissao: p.data.emissao || null,
      validade: p.data.validade || null,
      arquivo_path: path,
      arquivo_nome: file.name.slice(0, 200),
      mime: file.type,
      tamanho: file.size,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return dbErrorToResult(error);
  }
  refresh(p.data.licitacaoId || undefined);
  revalidatePath("/exequibilidade/documentos");
  return { ok: true, data: { id: data.id as string } };
}

export async function excluirAnexoAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return falha("Documento inválido.");
  const supabase = await createClient();
  const { data: a } = await supabase.from("licitacao_anexos").select("arquivo_path, licitacao_id").eq("id", id).maybeSingle();
  if (!a) return falha("Documento não encontrado.");
  const { error } = await supabase.from("licitacao_anexos").delete().eq("id", id);
  if (error) return dbErrorToResult(error);
  await supabase.storage.from(BUCKET).remove([a.arquivo_path as string]);
  refresh((a.licitacao_id as string | null) ?? undefined);
  revalidatePath("/exequibilidade/documentos");
  return { ok: true, data: undefined };
}

export async function urlAnexoAction(id: string): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();
  if (!isUuid(id)) return falha("Documento inválido.");
  const supabase = await createClient();
  const { data: a } = await supabase.from("licitacao_anexos").select("arquivo_path, arquivo_nome").eq("id", id).maybeSingle();
  if (!a) return falha("Documento não encontrado.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.arquivo_path as string, 120, { download: a.arquivo_nome as string });
  if (error || !data) return falha("Não foi possível abrir o arquivo.");
  return { ok: true, data: { url: data.signedUrl } };
}

/** Busca produtos do estoque para puxar o valor unitário como custo da planilha. */
export async function buscarProdutosAction(q: string): Promise<ActionResult<{ id: string; codigo: string; nome: string; valor: number }[]>> {
  await requireAdmin();
  const termo = (q ?? "").trim().slice(0, 60);
  if (termo.length < 2) return { ok: true, data: [] };
  const supabase = await createClient();
  const seguro = termo.replace(/[%,()*]/g, " ");
  const { data, error } = await supabase
    .from("products")
    .select("id, codigo, nome, valor_unitario")
    .eq("ativo", true)
    .or(`nome.ilike.%${seguro}%,codigo.ilike.%${seguro}%`)
    .order("nome")
    .limit(30);
  if (error) return dbErrorToResult(error);
  return { ok: true, data: (data ?? []).map((p) => ({ id: p.id as string, codigo: p.codigo as string, nome: p.nome as string, valor: Number(p.valor_unitario) || 0 })) };
}
