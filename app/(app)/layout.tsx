import { AppShell } from "@/components/shared/app-shell";
import { requireUser } from "@/lib/auth/session";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  return (
    <AppShell nome={profile.nome} role={profile.role}>
      {children}
    </AppShell>
  );
}
