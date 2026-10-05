import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import { buildMovementsSheet, buildStockSheet, getStockSnapshot, newWorkbook } from "@/services/reports";
import { isDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function todayBR() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD
}

// Exportação em Excel. Somente administradores (os valores em R$ são sensíveis).
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.ativo) return new Response("Não autenticado", { status: 401 });
  if (profile.role !== "admin") return new Response("Acesso negado", { status: 403 });

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") === "movimentacoes" ? "movimentacoes" : "estoque";
  const fromParam = url.searchParams.get("from") ?? "";
  const toParam = url.searchParams.get("to") ?? "";
  const from = isDate(fromParam) ? fromParam : undefined;
  const to = isDate(toParam) ? toParam : undefined;

  const wb = newWorkbook();
  let linhas: number;
  let nome: string;
  try {
    if (tipo === "estoque") {
      linhas = buildStockSheet(wb, (await getStockSnapshot()).rows);
      nome = `estoque-bia-${todayBR()}.xlsx`;
    } else {
      linhas = await buildMovementsSheet(wb, from, to);
      nome = `movimentacoes-bia-${from ?? "inicio"}_a_${to ?? todayBR()}.xlsx`;
    }
  } catch {
    return new Response("Não foi possível gerar a planilha.", { status: 500 });
  }

  const supabase = await createClient();
  const { ip, ua } = await getRequestMeta();
  await supabase.rpc("log_audit_event", {
    p_action: "exportacao_relatorio",
    p_entity_type: "relatorio",
    p_entity_id: null,
    p_metadata: { relatorio: tipo, linhas, de: from ?? null, ate: to ?? null, arquivo: nome },
    p_ip: ip,
    p_ua: ua,
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
