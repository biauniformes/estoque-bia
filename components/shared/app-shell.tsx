"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  MinusCircle,
  Shirt,
  ShieldCheck,
  Users,
  Home,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/constants";

type NavItem = { href: string; label: string; icon: LucideIcon; admin?: boolean; accent?: "entrada" | "saida" };

const NAV: NavItem[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, admin: true },
  { href: "/estoque", label: "Estoque", icon: Package },
  { href: "/entrada", label: "Entrada", icon: PlusCircle },
  { href: "/saida", label: "Saída", icon: MinusCircle },
  { href: "/movimentacoes", label: "Movimentações", icon: ClipboardList },
  { href: "/produtos", label: "Produtos", icon: Shirt, admin: true },
  { href: "/ocs", label: "OCs", icon: FileText, admin: true },
  { href: "/relatorios", label: "Relatórios", icon: FileSpreadsheet, admin: true },
  { href: "/usuarios", label: "Usuários", icon: Users, admin: true },
  { href: "/auditoria", label: "Auditoria", icon: ShieldCheck, admin: true },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="Bia Uniformes Corporativos" width={48} height={48} className="h-12 w-12 rounded-lg" />
      <div className="leading-tight">
        <p className="text-base font-extrabold uppercase tracking-wide text-white">Estoque Bia</p>
        <p className="text-xs text-brand">Controle de estoque</p>
      </div>
    </div>
  );
}

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.admin || role === "admin").filter((i) => !(role === "admin" && i.href === "/"));
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-1.5">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={item.admin && (item.href === "/auditoria" || item.href === "/usuarios") ? false : undefined}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-13 items-center gap-3 rounded-xl px-4 text-base font-semibold transition-colors",
              active ? "bg-brand text-black" : "text-slate-300 hover:bg-slate-800 hover:text-white",
                    )}
          >
            <Icon className="h-6 w-6 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBox({ nome, role }: { nome: string; role: Role }) {
  return (
    <div className="border-t border-slate-800 pt-4">
      <p className="truncate text-base font-bold text-white">{nome}</p>
      <p className="mb-3 text-sm text-slate-400">{ROLE_LABELS[role]}</p>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <LogOut className="h-5 w-5" aria-hidden /> Sair
        </button>
      </form>
    </div>
  );
}

export function AppShell({ nome, role, children }: { nome: string; role: Role; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="min-h-dvh lg:flex">
      {/* sidebar: notebook / tablet paisagem */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col justify-between gap-6 overflow-y-auto bg-sidebar p-5 lg:flex">
        <div className="space-y-8">
          <Brand />
          <NavList role={role} />
        </div>
        <UserBox nome={nome} role={role} />
      </aside>

      {/* topo + gaveta: tablet retrato / celular */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-sidebar px-4 lg:hidden">
        <Brand />
        <Dialog open={open} onOpenChange={setOpen}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="flex h-12 w-12 items-center justify-center rounded-xl text-white hover:bg-slate-800"
          >
            <Menu className="h-7 w-7" />
          </button>
          <DialogContent side="left" className="flex flex-col justify-between gap-6 bg-sidebar p-5 text-white [&>button]:text-slate-300 [&>button]:hover:bg-slate-800">
            <DialogTitle className="sr-only">Menu</DialogTitle>
            <div className="space-y-8 pt-8">
              <NavList role={role} onNavigate={() => setOpen(false)} />
            </div>
            <UserBox nome={nome} role={role} />
          </DialogContent>
        </Dialog>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
