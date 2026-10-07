import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import {
  buildLowStockSheet,
  buildMovementsSheet,
  buildStockSheet,
  buildTopStockSheet,
  DEFAULT_LIMITE,
  getLowMovedItems,
  getMovedStock,
  getStockSnapshot,
  getTopItems,
  newWorkbook,
} from "@/services/reports";
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
  const tipoParam = url.searchParams.get("tipo");
  const tipo = (["movimentacoes", "baixo", "maiores", "movimentados"] as const).find((t) => t === tipoParam) ?? "estoque";
  const limiteRaw = parseInt(url.searchParams.get("limite") ?? "", 10);
  const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(limiteRaw, 1_000_000) : DEFAULT_LIMITE;
  const topRaw = parseInt(url.searchParams.get("top") ?? "", 10);
  const top = Number.isFinite(topRaw) && topRaw > 0 ? Math.min(topRaw, 500) : 20;
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
    } else if (tipo === "movimentados") {
      const { rows } = await getMovedStock(url.searchParams.get("zerados") === "1");
      linhas = buildStockSheet(wb, rows, "Itens movimentados");
      nome = `estoque-itens-movimentados-${todayBR()}.xlsx`;
    } else if (tipo === "baixo") {
      linhas = buildLowStockSheet(wb, await getLowMovedItems(limite), limite);
      nome = `estoque-abaixo-de-${limite}-${todayBR()}.xlsx`;
    } else if (tipo === "maiores") {
      const [itens, snap] = await Promise.all([getTopItems(top), getStockSnapshot()]);
      linhas = buildTopStockSheet(wb, itens, snap.pecas);
      nome = `maiores-estoques-top${top}-${todayBR()}.xlsx`;
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
    p_metadata: { relatorio: tipo, linhas, de: from ?? null, ate: to ?? null, zerados: tipo === "movimentados" ? url.searchParams.get("zerados") === "1" : null, limite: tipo === "baixo" ? limite : null, top: tipo === "maiores" ? top : null, arquivo: nome },
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
