import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listActiveVariants } from "@/services/stock";
import { resolverItem, type CatalogoOc, type ItemResolvido, type MapaOc } from "@/lib/oc";

export type OcItemView = { cod: string; tam: string; desc: string; qtd: number; res: ItemResolvido };
export type OcOrdemView = {
  id: string;
  numero: string;
  empresa: string;
  entrega: string | null;
  status: "pendente" | "separada";
  arquivo: string | null;
  pecas: number;
  itens: OcItemView[];
};
export type ModeloLigacao = { cod: string; descricao: string | null; modelo: string | null; confirmado: boolean };
export type ModeloNosso = { modelo: string; nome: string };

/** Ordens + itens já ligados aos nossos códigos (com o estoque atual), mais as tabelas de ligação. */
export async function carregarConsolidacao() {
  const supabase = await createClient();
  const [ordensRes, modelosRes, tamanhosRes, variants] = await Promise.all([
    supabase.from("oc_ordens").select("id, numero, empresa, entrega, status, arquivo, created_at").order("entrega", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("oc_modelo_map").select("cod_cliente, descricao, modelo, confirmado").eq("cliente", "ORBENK").order("cod_cliente").limit(2000),
    supabase.from("oc_tamanho_map").select("cod_cliente, tamanho_cliente, tamanho_nosso").eq("cliente", "ORBENK").limit(5000),
    listActiveVariants(),
  ]);
  if (ordensRes.error) throw new Error(ordensRes.error.message);
  if (modelosRes.error) throw new Error(modelosRes.error.message);
  if (tamanhosRes.error) throw new Error(tamanhosRes.error.message);

  const ordens = ordensRes.data ?? [];
  const itensPorOrdem = new Map<string, { cod_cliente: string; tamanho: string; descricao: string; quantidade: number }[]>();
  const ids = ordens.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await supabase
        .from("oc_itens")
        .select("ordem_id, cod_cliente, tamanho, descricao, quantidade")
        .in("ordem_id", lote)
        .order("ordem_id")
        .order("seq")
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const it of data ?? []) {
        const l = itensPorOrdem.get(it.ordem_id) ?? [];
        l.push(it);
        itensPorOrdem.set(it.ordem_id, l);
      }
      if (!data || data.length < 1000) break;
    }
  }

  const mapa: MapaOc = { modelos: new Map(), tamanhos: new Map() };
  for (const m of modelosRes.data ?? []) mapa.modelos.set(m.cod_cliente, { modelo: m.modelo, confirmado: m.confirmado });
  for (const t of tamanhosRes.data ?? []) mapa.tamanhos.set(`${t.cod_cliente}|${t.tamanho_cliente.toUpperCase()}`, t.tamanho_nosso);

  const catalogo: CatalogoOc = new Map(variants.map((v) => [v.codigo, { produto: v.produto, estoque: v.estoque }]));
  const modelosNossos = new Map<string, string>();
  for (const v of variants) {
    const m = /^(\d{3}\.\d{3})\.\w+$/.exec(v.codigo);
    if (m && !modelosNossos.has(m[1])) modelosNossos.set(m[1], v.nome_base);
  }

  const view: OcOrdemView[] = ordens.map((o) => {
    const itens: OcItemView[] = (itensPorOrdem.get(o.id) ?? []).map((i) => ({
      cod: i.cod_cliente,
      tam: i.tamanho,
      desc: i.descricao,
      qtd: i.quantidade,
      res: resolverItem(mapa, catalogo, i.cod_cliente, i.tamanho),
    }));
    return { id: o.id, numero: o.numero, empresa: o.empresa, entrega: o.entrega, status: o.status as "pendente" | "separada", arquivo: o.arquivo, pecas: itens.reduce((s, i) => s + i.qtd, 0), itens };
  });

  const ligacoes: ModeloLigacao[] = (modelosRes.data ?? []).map((m) => ({ cod: m.cod_cliente, descricao: m.descricao, modelo: m.modelo, confirmado: m.confirmado }));
  const modelosLista: ModeloNosso[] = [...modelosNossos].map(([modelo, nome]) => ({ modelo, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { ordens: view, ligacoes, modelosLista };
}
