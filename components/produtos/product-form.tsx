"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/constants";
import { saveProductAction, type FormState } from "@/app/actions/products";
import type { ProductRow } from "@/types";

export function FormError({ state }: { state: FormState }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
      {state.error}
    </p>
  );
}

export function fieldError(state: FormState, name: string) {
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}

/** Cadastro/edição de produto. Na criação, permite já informar a primeira variação. */
export function ProductForm({ product }: { product?: ProductRow }) {
  const [state, action, pending] = useActionState(saveProductAction, null);
  React.useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
  }, [state]);
  const e = (n: string) => fieldError(state, n);

  return (
    <form action={action} className="space-y-5">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" htmlFor="codigo" error={e("codigo")}>
          <Input id="codigo" name="codigo" defaultValue={product?.codigo} required maxLength={30} placeholder="JAQ-001" />
        </Field>
        <Field label="Categoria" htmlFor="categoria" error={e("categoria")}>
          <Select id="categoria" name="categoria" defaultValue={product?.categoria ?? ""} required>
            <option value="" disabled>Selecione…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Nome" htmlFor="nome" error={e("nome")}>
        <Input id="nome" name="nome" defaultValue={product?.nome} required maxLength={120} placeholder="Jaqueta Operacional" />
      </Field>
      <Field label="Valor unitário (R$)" htmlFor="valor_unitario" error={e("valor_unitario")} hint="Usado para calcular o valor total em estoque. Ex.: 19,90">
        <Input
          id="valor_unitario"
          name="valor_unitario"
          inputMode="decimal"
          defaultValue={product ? String(product.valor_unitario).replace(".", ",") : ""}
          placeholder="0,00"
        />
      </Field>
      <Field label="Descrição" htmlFor="descricao" error={e("descricao")}>
        <Textarea id="descricao" name="descricao" defaultValue={product?.descricao ?? ""} maxLength={500} />
      </Field>

      {!product && (
        <fieldset className="space-y-4 rounded-2xl border-2 border-dashed border-slate-300 p-4">
          <legend className="px-2 text-sm font-bold uppercase tracking-wide text-slate-500">Cor e tamanho (opcional)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cor" htmlFor="cor" error={e("cor")}><Input id="cor" name="cor" placeholder="Azul" /></Field>
            <Field label="Tamanho" htmlFor="tamanho" error={e("tamanho")}><Input id="tamanho" name="tamanho" placeholder="G" /></Field>
            <Field label="Modelo" htmlFor="modelo"><Input id="modelo" name="modelo" placeholder="Unissex" /></Field>
            <Field label="Estoque mínimo" htmlFor="estoque_minimo" error={e("estoque_minimo")}>
              <Input id="estoque_minimo" name="estoque_minimo" type="number" min={0} defaultValue={0} inputMode="numeric" />
            </Field>
            <Field label="SKU" htmlFor="sku" hint="Em branco: usa o código do produto." className="sm:col-span-2">
              <Input id="sku" name="sku" placeholder="JAQ-001-AZU-G" />
            </Field>
          </div>
          <p className="text-sm text-slate-500">Sem cor/tamanho, o item fica como “Único”. O estoque inicial é sempre 0; use “Entrada” para lançar as unidades.</p>
        </fieldset>
      )}

      <FormError state={state} />
      <Button type="submit" size="lg" loading={pending}>
        {product ? "Salvar alterações" : "Cadastrar produto"}
      </Button>
    </form>
  );
}
