"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { loginAction } from "@/app/actions/auth";

export function LoginForm({ next, disabled }: { next?: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Usuário" htmlFor="email">
        <Input id="email" name="email" type="text" autoComplete="username" required autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="ex.: estoque" />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled}>
        ENTRAR
      </Button>
    </form>
  );
}
