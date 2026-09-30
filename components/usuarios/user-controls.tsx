"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Plus, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormError, fieldError } from "@/components/produtos/product-form";
import { createUserAction, resetPasswordAction, updateUserAction } from "@/app/actions/users";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { useFormAction } from "@/hooks/use-form-action";

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { state, pending, submit, reset } = useFormAction(createUserAction);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const res = await submit(e);
    if (res?.ok) {
      toast.success(res.message ?? "Usuário criado.");
      setOpen(false);
      router.refresh();
    }
  }
  const e = (n: string) => fieldError(state, n);
  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" aria-hidden /> Novo usuário
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <form onSubmit={onSubmit} autoComplete="off">
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
              <DialogDescription>Informe uma senha inicial e repasse ao funcionário pessoalmente.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Nome" htmlFor="u-nome" error={e("nome")}><Input id="u-nome" name="nome" required maxLength={120} /></Field>
              <Field label="Usuário" htmlFor="u-email" error={e("email")} hint="Ex.: estoque, expedicao — ou um e-mail completo."><Input id="u-email" name="email" type="text" required autoComplete="off" autoCapitalize="none" spellCheck={false} /></Field>
              <Field label="Função" htmlFor="u-role" error={e("role")}>
                <Select id="u-role" name="role" defaultValue="operator">
                  <option value="operator">{ROLE_LABELS.operator}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                </Select>
              </Field>
              <Field label="Senha inicial" htmlFor="u-pass" error={e("password")} hint="Mínimo 8 caracteres, com letras e números.">
                <Input id="u-pass" name="password" type="password" required minLength={8} autoComplete="new-password" />
              </Field>
              <FormError state={state} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" size="lg" loading={pending}>Criar usuário</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: Role; disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [value, setValue] = React.useState<Role>(role);
  async function change(next: Role) {
    const prev = value;
    setValue(next);
    setPending(true);
    const res = await updateUserAction(userId, { role: next });
    setPending(false);
    if (res.ok) {
      toast.success("Função alterada.");
      router.refresh();
    } else {
      toast.error(res.error);
      setValue(prev);
    }
  }
  return (
    <Select
      aria-label="Função do usuário"
      value={value}
      disabled={disabled || pending}
      onChange={(e) => change(e.target.value as Role)}
      className="h-11 min-w-48"
    >
      <option value="operator">{ROLE_LABELS.operator}</option>
      <option value="admin">{ROLE_LABELS.admin}</option>
    </Select>
  );
}

export function UserActiveToggle({ userId, ativo, nome, disabled }: { userId: string; ativo: boolean; nome: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  async function run() {
    setPending(true);
    const res = await updateUserAction(userId, { ativo: !ativo });
    setPending(false);
    if (res.ok) {
      toast.success(ativo ? "Usuário desativado." : "Usuário reativado.");
      setOpen(false);
      router.refresh();
    } else toast.error(res.error);
  }
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => (ativo ? setOpen(true) : run())} loading={pending && !open}>
        {ativo ? <PowerOff className="h-4 w-4" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />}
        {ativo ? "Desativar" : "Reativar"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Desativar ${nome}?`}
        description="O usuário perde o acesso imediatamente. Os registros que ele fez continuam no histórico."
        confirmLabel="Desativar"
        variant="danger"
        loading={pending}
        onConfirm={run}
      />
    </>
  );
}

export function ResetPasswordDialog({ userId, nome }: { userId: string; nome: string }) {
  const [open, setOpen] = React.useState(false);
  const { state, pending, submit, reset } = useFormAction(resetPasswordAction);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const res = await submit(e);
    if (res?.ok) {
      toast.success(res.message ?? "Senha redefinida.");
      setOpen(false);
    }
  }
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Redefinir senha de ${nome}`}>
        <KeyRound className="h-4 w-4" aria-hidden /> Senha
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <form onSubmit={onSubmit} autoComplete="off">
            <DialogHeader>
              <DialogTitle>Redefinir senha</DialogTitle>
              <DialogDescription>{nome}</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="user_id" value={userId} />
            <Field label="Nova senha" htmlFor="rp-pass" error={fieldError(state, "password")} hint="Mínimo 8 caracteres, com letras e números.">
              <Input id="rp-pass" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <div className="mt-3"><FormError state={state} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" size="lg" loading={pending}>Redefinir</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
