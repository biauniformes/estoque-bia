"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setActiveAction } from "@/app/actions/products";

export function ActiveToggle({
  kind,
  id,
  ativo,
  label,
  size = "sm",
}: {
  kind: "product" | "variant";
  id: string;
  ativo: boolean;
  label: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function run() {
    setPending(true);
    const res = await setActiveAction(kind, id, !ativo);
    setPending(false);
    if (res.ok) {
      toast.success(res.message ?? "Feito.");
      setOpen(false);
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <>
      <Button type="button" size={size} variant="outline" onClick={() => (ativo ? setOpen(true) : run())} loading={pending && !open}>
        {ativo ? <PowerOff className="h-4 w-4" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />}
        {ativo ? "Desativar" : "Reativar"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Desativar ${label}?`}
        description="O item deixa de aparecer nas entradas e saídas. O histórico e o saldo são mantidos e você pode reativá-lo quando quiser."
        confirmLabel="Desativar"
        variant="danger"
        loading={pending}
        onConfirm={run}
      />
    </>
  );
}
