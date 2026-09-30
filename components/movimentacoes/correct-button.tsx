"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { correctMovementAction } from "@/app/actions/movements";
import { formatNumber, newKey } from "@/lib/utils";

/** CORRIGIR MOVIMENTAÇÃO (admin): preserva o registro original e cria um ajuste compensatório. */
export function CorrectButton({
  movementId,
  label,
  quantidade,
  tipo,
}: {
  movementId: string;
  label: string;
  quantidade: number;
  tipo: "entrada" | "saida";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [qty, setQty] = React.useState(String(quantidade));
  const [obs, setObs] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const keyRef = React.useRef(newKey());
  const lock = React.useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await correctMovementAction({ movementId, quantidadeCorreta: qty, observacao: obs, key: keyRef.current });
      if (res.ok) {
        toast.success(
          `Correção registrada: ${res.data.tipo === "entrada" ? "+" : "−"}${formatNumber(res.data.quantidade)} · estoque agora ${formatNumber(res.data.estoque_posterior)}`,
        );
        setOpen(false);
        keyRef.current = newKey();
        router.refresh();
      } else {
        setError(res.error);
        keyRef.current = newKey();
      }
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Corrigir movimentação: ${label}`}>
        <Wrench className="h-4 w-4" aria-hidden /> Corrigir
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Corrigir movimentação</DialogTitle>
              <DialogDescription>
                {label}. O registro original é mantido; o sistema cria um ajuste com a diferença. Registrado: {tipo === "entrada" ? "entrada" : "saída"} de{" "}
                {formatNumber(quantidade)}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Quantidade correta (total desta movimentação)" htmlFor="qc">
                <Input id="qc" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} required />
              </Field>
              <Field label="Motivo da correção" htmlFor="obs" hint="Fica registrado na auditoria.">
                <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} required minLength={3} maxLength={500} />
              </Field>
              {error && (
                <p role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" size="lg" loading={pending}>
                Registrar correção
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
