import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, PackageX, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type StockStatus } from "@/lib/constants";

/** Status nunca depende só de cor: sempre ícone + texto. */
export function StockBadge({ status }: { status: StockStatus }) {
  const cfg = {
    normal: { tone: "success", Icon: CheckCircle2 },
    baixo: { tone: "warning", Icon: AlertTriangle },
    zerado: { tone: "danger", Icon: PackageX },
  } as const;
  const { tone, Icon } = cfg[status];
  return (
    <Badge tone={tone}>
      <Icon className="h-4 w-4" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function MovementBadge({ tipo, ajuste = false }: { tipo: "entrada" | "saida"; ajuste?: boolean }) {
  if (ajuste) {
    return (
      <Badge tone="info">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Ajuste {tipo === "entrada" ? "(+)" : "(−)"}
      </Badge>
    );
  }
  return tipo === "entrada" ? (
    <Badge tone="success">
      <ArrowDownToLine className="h-4 w-4" aria-hidden />
      Entrada
    </Badge>
  ) : (
    <Badge tone="danger">
      <ArrowUpFromLine className="h-4 w-4" aria-hidden />
      Saída
    </Badge>
  );
}
