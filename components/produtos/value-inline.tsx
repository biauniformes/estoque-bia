"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setProductValueAction } from "@/app/actions/products";
import { cn } from "@/lib/utils";

/** Campo de valor + botão na própria linha: salva e (se for item "aguardando valor") ativa o item. */
export function ValueInline({ id, atual, rotulo }: { id: string; atual: number; rotulo: string }) {
  const router = useRouter();
  const [valor, setValor] = React.useState(atual > 0 ? String(atual).replace(".", ",") : "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lock = React.useRef(false);

  async function save() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await setProductValueAction(id, valor);
      if (res.ok) {
        toast.success(`${rotulo}: ${res.message ?? "valor salvo."}`);
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">R$</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          placeholder="0,00"
          aria-label={`Valor de ${rotulo}`}
          aria-invalid={!!error || undefined}
          onChange={(e) => {
            setError(null);
            setValor(e.target.value.replace(/[^0-9.,]/g, ""));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          className={cn(
            "h-12 w-32 rounded-xl border-2 bg-white px-3 text-right text-lg font-bold tabular-nums focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
            error ? "border-red-500" : "border-slate-300",
          )}
        />
        <Button type="button" size="sm" loading={pending} onClick={save} disabled={!valor.trim()}>
          <Check className="h-4 w-4" aria-hidden /> Salvar
        </Button>
      </div>
      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
