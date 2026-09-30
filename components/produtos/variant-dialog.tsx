"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError, fieldError } from "./product-form";
import { saveVariantAction } from "@/app/actions/products";
import { useFormAction } from "@/hooks/use-form-action";
import type { VariantRow } from "@/types";

export function VariantDialog({ productId, variant }: { productId: string; variant?: VariantRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { state, pending, submit, reset } = useFormAction(saveVariantAction);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const res = await submit(e);
    if (res?.ok) {
      toast.success(res.message ?? "Salvo.");
      setOpen(false);
      router.refresh();
    }
  }

  const e = (n: string) => fieldError(state, n);
  return (
    <>
      {variant ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Editar variação ${variant.cor} ${variant.tamanho}`}>
          <Pencil className="h-4 w-4" aria-hidden /> Editar
        </Button>
      ) : (
        <Button type="button" size="lg" onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" aria-hidden /> Nova variação
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{variant ? "Editar variação" : "Nova variação"}</DialogTitle>
            </DialogHeader>
            <input type="hidden" name="product_id" value={productId} />
            {variant && <input type="hidden" name="id" value={variant.id} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cor" htmlFor="v-cor" error={e("cor")}><Input id="v-cor" name="cor" defaultValue={variant?.cor} required /></Field>
              <Field label="Tamanho" htmlFor="v-tam" error={e("tamanho")}><Input id="v-tam" name="tamanho" defaultValue={variant?.tamanho} required /></Field>
              <Field label="Modelo" htmlFor="v-mod"><Input id="v-mod" name="modelo" defaultValue={variant?.modelo ?? ""} /></Field>
              <Field label="Estoque mínimo" htmlFor="v-min" error={e("estoque_minimo")}>
                <Input id="v-min" name="estoque_minimo" type="number" min={0} inputMode="numeric" defaultValue={variant?.estoque_minimo ?? 0} />
              </Field>
              <Field label="SKU" htmlFor="v-sku" hint="Em branco: gerado automaticamente." className="sm:col-span-2">
                <Input id="v-sku" name="sku" defaultValue={variant?.sku ?? ""} />
              </Field>
            </div>
            <div className="mt-4"><FormError state={state} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" size="lg" loading={pending}>Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
