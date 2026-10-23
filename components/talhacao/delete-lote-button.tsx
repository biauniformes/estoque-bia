"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteTalhacaoAction } from "@/app/actions/talhacao";

export function DeleteLoteButton({ loteKey, resumo }: { loteKey: string; resumo: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  async function apagar() {
    setPending(true);
    const res = await deleteTalhacaoAction(loteKey);
    setPending(false);
    setOpen(false);
    if (res.ok) {
      toast.success("Lançamento excluído.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Excluir lançamento: ${resumo}`}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Excluir este lançamento?"
        description={resumo}
        confirmLabel="EXCLUIR"
        variant="danger"
        loading={pending}
        onConfirm={apagar}
      />
    </>
  );
}
