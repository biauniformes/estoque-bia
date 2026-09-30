import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  hint?: string;
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    danger: "bg-rose-100 text-rose-700",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-sky-100 text-sky-700",
  };
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl", tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-3xl font-extrabold tabular-nums text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </Card>
  );
}
