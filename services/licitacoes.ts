import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Anexo, Licitacao } from "@/lib/exequibilidade/licitacao";

const COLS_LISTA =
  "id, titulo, orgao, edital, status, data_sessao, valor_estimado, preco_ofertado, status_exequibilidade, checklist, created_at, updated_at";

export async function listLicitacoes() {
  const supabase = await createClient();
  const q = (cols: string) => supabase.from("licitacoes").select(cols).order("updated_at", { ascending: false }).limit(500);
  let { data, error } = await q(`${COLS_LISTA}, prazos`);
  // Antes da migração 0019 a coluna "prazos" não existe: lista sem ela.
  if (error && /prazos/.test(error.message)) ({ data, error } = await q(COLS_LISTA));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Omit<Licitacao, "analise">[];
}

export async function getLicitacao(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("licitacoes").select("*").eq("id", id).maybeSingle();
  return (data as Licitacao | null) ?? null;
}

/** licitacaoId null = documentos da empresa (certidões, balanços, atestados…). */
export async function listAnexos(licitacaoId: string | null) {
  const supabase = await createClient();
  let q = supabase.from("licitacao_anexos").select("*").order("created_at", { ascending: false }).limit(1000);
  q = licitacaoId ? q.eq("licitacao_id", licitacaoId) : q.is("licitacao_id", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Anexo[];
}

/** Quantidade de documentos da empresa vencidos ou que vencem em até 30 dias. */
export async function contarDocumentosVencendo() {
  const supabase = await createClient();
  const limite = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const { count } = await supabase
    .from("licitacao_anexos")
    .select("id", { count: "exact", head: true })
    .is("licitacao_id", null)
    .not("validade", "is", null)
    .lte("validade", limite);
  return count ?? 0;
}
