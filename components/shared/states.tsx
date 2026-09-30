import * as React from "react";
import { AlertOctagon, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "Nada por aqui",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-14 text-center", className)}>
      <Inbox className="h-10 w-10 text-slate-400" aria-hidden />
      <p className="text-lg font-bold text-slate-800">{title}</p>
      {description && <p className="max-w-md text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span className="text-lg font-medium">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "Algo deu errado",
  description = "Não foi possível carregar esta tela.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <AlertOctagon className="h-10 w-10 text-red-500" aria-hidden />
      <p className="text-lg font-bold text-slate-800">{title}</p>
      <p className="max-w-md text-slate-500">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
