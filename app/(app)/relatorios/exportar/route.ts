import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";
import {
  buildEmpresasWorkbook,
  buildLowStockSheet,
  buildMovementsSheet,
  buildStockSheet,
  buildTopStockSheet,
  DEFAULT_LIMITE,
  empresaLabel,
  getLowMovedItems,
  getMovedStock,
  getStockSnapshot,
  getTopItems,
  newWorkbook,
  parseEmpresa,
} from "@/services/reports";
import { isDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TIPOS = ["estoque", "empresas", "maiores", "movimentados", "baixo", "movimentacoes"] as const;
type Tipo = (typeof TIPOS)[number];
/** Relatórios que o OPERADOR pode gerar (sempre sem valores). */
const TIPOS_OPERADOR: Tipo[] = ["estoque", "empresas", "maiores"];

function todayBR() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD
}

/**
 * Exportação em Excel.
 *  - Administrador: todos os relatórios; escolhe a versão ("completo" com valores ou "operador" sem valores).
 *  - Operador: só estoque / empresas / maiores, SEMPRE sem valores (código, nome e quantidade).
 */
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.ativo) return new Response("Não autenticado", { status: 401 });
  if (profile.role === "expedicao") return new Response("Acesso negado", { status: 403 });
  const isAdmin = profile.role === "admin";

  const url = new URL(request.url);
  const tipoParam = url.searchParams.get("tipo") ?? "";
  const tipo: Tipo = (TIPOS as readonly string[]).includes(tipoParam) ? (tipoParam as Tipo) : "estoque";
  if (!isAdmin && !TIPOS_OPERADOR.includes(tipo)) return new Response("Acesso negado", { status: 403 });

  // operador NUNCA recebe valores, mesmo que force o parâmetro na URL
  const valores = isAdmin && url.searchParams.get("versao") !== "operador";
  const empresa = parseEmpresa(url.searchParams.get("empresa") ?? url.searchParams.get("marca"));
  const soEstoque = url.searchParams.get("soestoque") === "1";
  const zerados = url.searchParams.get("zerados") === "1";
  const limiteRaw = parseInt(url.searchParams.get("limite") ?? "", 10);
  const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(limiteRaw, 1_000_000) : DEFAULT_LIMITE;
  const topRaw = parseInt(url.searchParams.get("top") ?? "", 10);
  const top = Number.isFinite(topRaw) && topRaw > 0 ? Math.min(topRaw, 500) : 20;
  const fromParam = url.searchParams.get("from") ?? "";
  const toParam = url.searchParams.get("to") ?? "";
  const from = isDate(fromParam) ? fromParam : undefined;
  const to = isDate(toParam) ? toParam : undefined;

  const sufixo = `${empresa ? `-${empresa.toLowerCase()}` : ""}${valores ? "" : "-sem-valores"}`;
  const wb = newWorkbook();
  let linhas: number;
  let nome: string;
  try {
    if (tipo === "estoque") {
      linhas = buildStockSheet(wb, (await getStockSnapshot(empresa, soEstoque)).rows, empresa ? `Estoque ${empresaLabel(empresa)}` : "Estoque", valores);
      nome = `estoque-bia${sufixo}-${todayBR()}.xlsx`;
    } else if (tipo === "empresas") {
      linhas = buildEmpresasWorkbook(wb, (await getStockSnapshot("", true)).rows, valores);
      nome = `estoque-por-empresa${sufixo}-${todayBR()}.xlsx`;
    } else if (tipo === "maiores") {
      const [itens, snap] = await Promise.all([getTopItems(top, empresa), getStockSnapshot(empresa, true)]);
      linhas = buildTopStockSheet(wb, itens, snap.pecas, valores);
      nome = `maiores-estoques-top${top}${sufixo}-${todayBR()}.xlsx`;
    } else if (tipo === "movimentados") {
      const { rows } = await getMovedStock(zerados, empresa);
      linhas = buildStockSheet(wb, rows, "Itens movimentados", valores);
      nome = `estoque-itens-movimentados${sufixo}-${todayBR()}.xlsx`;
    } else if (tipo === "baixo") {
      linhas = buildLowStockSheet(wb, await getLowMovedItems(limite, empresa), limite, valores);
      nome = `estoque-abaixo-de-${limite}${sufixo}-${todayBR()}.xlsx`;
    } else {
      linhas = await buildMovementsSheet(wb, from, to, empresa);
      nome = `movimentacoes-bia${sufixo}-${from ?? "inicio"}_a_${to ?? todayBR()}.xlsx`;
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
    p_metadata: {
      relatorio: tipo,
      empresa: empresa || null,
      versao: valores ? "completo" : "operador",
      linhas,
      de: from ?? null,
      ate: to ?? null,
      zerados: tipo === "movimentados" ? zerados : null,
      limite: tipo === "baixo" ? limite : null,
      top: tipo === "maiores" ? top : null,
      arquivo: nome,
    },
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
