"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorToResult } from "@/lib/errors";
import { makeSku, productSchema, variantSchema } from "@/lib/validations/product";
import { isUuid } from "@/lib/utils";
import type { ActionResult } from "@/types";

export type FormState = ActionResult | null;

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}
const fail = (issues: { path: PropertyKey[]; message: string }[]): FormState => ({
  ok: false,
  error: issues[0].message,
  code: "VALIDACAO",
  fieldErrors: fieldErrorsOf(issues),
});

function refresh() {
  for (const p of ["/produtos", "/estoque", "/entrada", "/saida", "/dashboard"]) revalidatePath(p);
}

/** Cria (sem id) ou edita (com id) um produto. Na criação pode incluir a primeira variação. */
export async function saveProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = productSchema.safeParse({
    codigo: formData.get("codigo"),
    nome: formData.get("nome"),
    categoria: formData.get("categoria"),
    descricao: formData.get("descricao") ?? "",
    valor_unitario: formData.get("valor_unitario") ?? 0,
  });
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const p = parsed.data;

  if (id) {
    if (!isUuid(id)) return { ok: false, error: "Produto inválido." };
    const { error } = await supabase
      .from("products")
      .update({ codigo: p.codigo, nome: p.nome, categoria: p.categoria, descricao: p.descricao || null, valor_unitario: p.valor_unitario })
      .eq("id", id);
    if (error) return dbErrorToResult(error);
    refresh();
    return { ok: true, data: undefined, message: "Produto atualizado." };
  }

  // todo produto nasce com ao menos uma variação; sem cor/tamanho informados vira "Único"
  const v = variantSchema.safeParse({
    cor: String(formData.get("cor") ?? "").trim() || "Único",
    tamanho: String(formData.get("tamanho") ?? "").trim() || "Único",
    modelo: formData.get("modelo") ?? "",
    sku: formData.get("sku") ?? "",
    estoque_minimo: formData.get("estoque_minimo") || 0,
  });
  if (!v.success) return fail(v.error.issues);
  const variant = v.data;

  const { data: created, error } = await supabase
    .from("products")
    .insert({ codigo: p.codigo, nome: p.nome, categoria: p.categoria, descricao: p.descricao || null, valor_unitario: p.valor_unitario })
    .select("id")
    .single();
  if (error || !created) return dbErrorToResult(error ?? { message: "erro" });

  {
    const { error: vErr } = await supabase.from("product_variants").insert({
      product_id: created.id,
      cor: variant.cor,
      tamanho: variant.tamanho,
      modelo: variant.modelo || null,
      sku: variant.sku || makeSku(p.codigo, variant.cor, variant.tamanho),
      estoque_minimo: variant.estoque_minimo,
    });
    if (vErr) {
      // produto criado; a variação falhou — leva para a tela do produto onde pode ser corrigida
      refresh();
      redirect(`/produtos/${created.id}?aviso=variacao`);
    }
  }
  refresh();
  redirect(`/produtos/${created.id}`);
}

/** Cria (sem id) ou edita (com id) uma variação (cor/tamanho/modelo/SKU/estoque mínimo). */
export async function saveVariantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  if (!isUuid(productId)) return { ok: false, error: "Produto inválido." };

  const parsed = variantSchema.safeParse({
    cor: formData.get("cor"),
    tamanho: formData.get("tamanho"),
    modelo: formData.get("modelo") ?? "",
    sku: formData.get("sku") ?? "",
    estoque_minimo: formData.get("estoque_minimo") || 0,
  });
  if (!parsed.success) return fail(parsed.error.issues);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("codigo").eq("id", productId).maybeSingle();
  if (!product) return { ok: false, error: "Produto não encontrado." };
  const sku = v.sku || makeSku(product.codigo, v.cor, v.tamanho);

  const payload = { cor: v.cor, tamanho: v.tamanho, modelo: v.modelo || null, sku, estoque_minimo: v.estoque_minimo };
  const { error } = id
    ? isUuid(id)
      ? await supabase.from("product_variants").update(payload).eq("id", id)
      : { error: { message: "Variação inválida." } }
    : await supabase.from("product_variants").insert({ ...payload, product_id: productId });
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: undefined, message: id ? "Variação atualizada." : "Variação criada." };
}

/** Ativa/desativa produto ou variação. Nada é apagado: o histórico permanece. */
export async function setActiveAction(kind: "product" | "variant", id: string, ativo: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!isUuid(id)) return { ok: false, error: "Registro inválido." };
  const supabase = await createClient();
  const { error } = await supabase
    .from(kind === "product" ? "products" : "product_variants")
    .update({ ativo })
    .eq("id", id);
  if (error) return dbErrorToResult(error);
  refresh();
  return { ok: true, data: undefined, message: ativo ? "Reativado." : "Desativado." };
}
