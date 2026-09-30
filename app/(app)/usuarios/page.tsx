import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { CreateUserDialog, ResetPasswordDialog, RoleSelect, UserActiveToggle } from "@/components/usuarios/user-controls";
import { displayLogin } from "@/lib/auth/identity";
import type { Profile } from "@/types";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("ativo", { ascending: false }).order("nome");
  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Crie acessos, altere funções e desative quem saiu. Nada é apagado: o histórico continua ligado ao usuário."
        actions={<CreateUserDialog />}
      />
      <Card className="overflow-hidden">
        <DataTable<Profile>
          caption="Usuários do sistema"
          rows={users}
          rowKey={(u) => u.id}
          columns={[
            {
              header: "Nome",
              cell: (u) => (
                <div>
                  <p className="font-bold">{u.nome} {u.id === me.id && <span className="text-sm font-normal text-slate-500">(você)</span>}</p>
                  <p className="text-sm text-slate-500">usuário: {displayLogin(u.email)}</p>
                </div>
              ),
            },
            { header: "Função", cell: (u) => <RoleSelect userId={u.id} role={u.role} disabled={u.id === me.id} /> },
            { header: "Situação", cell: (u) => (u.ativo ? <Badge tone="success">Ativo</Badge> : <Badge tone="danger">Desativado</Badge>) },
            { header: "Desde", hideBelow: "md", cell: (u) => formatDate(u.created_at) },
            {
              header: "Ações",
              align: "right",
              cell: (u) => (
                <div className="flex justify-end gap-2">
                  <ResetPasswordDialog userId={u.id} nome={u.nome} />
                  <UserActiveToggle userId={u.id} ativo={u.ativo} nome={u.nome} disabled={u.id === me.id} />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
