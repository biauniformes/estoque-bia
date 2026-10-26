/**
 * Carrega a ligação inicial dos códigos da ORBENK com os nossos modelos (lib/oc-ligacoes-orbenk.ts).
 * Não sobrescreve o que já foi editado na tela. Execute: npx tsx scripts/seed-oc-ligacoes.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { MODELOS_ORBENK, TAMANHOS_GLOBAIS_ORBENK, TAMANHOS_POR_PRODUTO_ORBENK } from "../lib/oc-ligacoes-orbenk";

config({ path: ".env.local" });
config();

(async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const a = await supabase.from("oc_modelo_map").upsert(
    MODELOS_ORBENK.map(([cod, modelo, confirmado]) => ({ cliente: "ORBENK", cod_cliente: cod, modelo, confirmado })),
    { onConflict: "cliente,cod_cliente", ignoreDuplicates: true },
  );
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.from("oc_tamanho_map").upsert(
    [
      ...TAMANHOS_GLOBAIS_ORBENK.map(([c, n]) => ({ cliente: "ORBENK", cod_cliente: "*", tamanho_cliente: c, tamanho_nosso: n })),
      ...TAMANHOS_POR_PRODUTO_ORBENK.map(([cod, c, n]) => ({ cliente: "ORBENK", cod_cliente: cod, tamanho_cliente: c, tamanho_nosso: n })),
    ],
    { onConflict: "cliente,cod_cliente,tamanho_cliente", ignoreDuplicates: true },
  );
  if (b.error) throw new Error(b.error.message);
  const n = await supabase.from("oc_modelo_map").select("id", { count: "exact", head: true });
  console.log(`Ligações carregadas. Total de produtos do cliente na tabela: ${n.count}`);
})();
