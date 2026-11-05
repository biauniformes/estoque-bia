import { AlertTriangle, CheckCircle2, CircleHelp, OctagonX, TrendingUp } from "lucide-react";
import { Badge } from "./ui";
import { cn } from "@/lib/utils";
import type { StatusExequibilidade } from "@/lib/exequibilidade/types";

export const ESTILO_STATUS: Record<
  StatusExequibilidade,
  { rotulo: string; classe: string; fundo: string; Icone: typeof CheckCircle2 }
> = {
  exequivel: {
    rotulo: "Exequível",
    classe: "border-emerald-300 bg-emerald-100 text-emerald-900",
    fundo: "border-emerald-300 bg-emerald-50 text-emerald-950",
    Icone: CheckCircle2,
  },
  alerta: {
    rotulo: "Zona de alerta / diligência",
    classe: "border-amber-300 bg-amber-100 text-amber-900",
    fundo: "border-amber-300 bg-amber-50 text-amber-950",
    Icone: AlertTriangle,
  },
  inexequivel: {
    rotulo: "Inexequível",
    classe: "border-red-300 bg-red-100 text-red-900",
    fundo: "border-red-300 bg-red-50 text-red-950",
    Icone: OctagonX,
  },
  acima_orcamento: {
    rotulo: "Acima do orçamento",
    classe: "border-red-300 bg-red-100 text-red-900",
    fundo: "border-red-300 bg-red-50 text-red-950",
    Icone: TrendingUp,
  },
  indefinido: {
    rotulo: "Sem dados",
    classe: "border-slate-300 bg-slate-100 text-slate-700",
    fundo: "border-slate-300 bg-slate-50 text-slate-800",
    Icone: CircleHelp,
  },
};

export function StatusBadge({
  status,
  rotulo,
  className,
}: {
  status: StatusExequibilidade;
  rotulo?: string;
  className?: string;
}) {
  const e = ESTILO_STATUS[status];
  return (
    <Badge
      variant="outline"
      className={cn("h-auto gap-1 whitespace-normal px-2 py-0.5 text-xs font-semibold", e.classe, className)}
    >
      <e.Icone className="size-3.5 shrink-0" aria-hidden />
      {rotulo ?? e.rotulo}
    </Badge>
  );
}
