"use client";

import * as React from "react";
import type { FormState } from "@/app/actions/products";

/**
 * Envia um <form> para uma Server Action SEM useActionState, devolvendo o resultado para o
 * chamador (útil em diálogos: fechar, avisar e atualizar a tela após o sucesso).
 */
export function useFormAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, setState] = React.useState<FormState>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>): Promise<FormState> => {
    e.preventDefault();
    if (pending) return null;
    const data = new FormData(e.currentTarget);
    setPending(true);
    setState(null);
    let result: FormState;
    try {
      result = await action(null, data);
    } catch {
      result = { ok: false, error: "Falha de conexão. Tente novamente." };
    }
    setState(result);
    setPending(false);
    return result;
  };

  return { state, pending, submit, reset: () => setState(null) };
}
