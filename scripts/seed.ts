/**
 * Dados fictícios de demonstração. Execute DEPOIS de aplicar as migrations e o
 * supabase/seed/01_catalog.sql:   npm run seed
 *
 * - cria 2 administradores e 3 operadores (Supabase Auth real);
 * - gera ~20 dias de movimentações usando a função real do banco (_apply_movement),
 *   então saldo, estoque anterior/posterior e auditoria ficam consistentes.
 * Pode ser executado de novo: usuários existentes são reaproveitados e o histórico
 * só é gerado se ainda não houver movimentações.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const generated = !process.env.SEED_PASSWORD;
const password = process.env.SEED_PASSWORD || `Stk-${randomBytes(6).toString("hex")}9`;

const USERS = [
  { email: "admin@estoquebia.app", nome: "Admin", role: "admin" },
  { email: "estoque@estoquebia.app", nome: "Estoque", role: "operator" },
  { email: "expedicao@estoquebia.app", nome: "Expedição", role: "operator" },
] as const;

// PRNG determinístico (mesma demo a cada execução)
let seed = 20260930;
const rnd = (min: number, max: number) => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return min + Math.floor((seed / 4294967296) * (max - min + 1));
};

async function ensureUsers() {
  const ids: Record<string, string> = {};
  const { data: existing } = await supabase.from("profiles").select("id, email");
  for (const u of USERS) {
    const found = existing?.find((p) => p.email.toLowerCase() === u.email);
    if (found) {
      ids[u.email] = found.id;
      continue;
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      app_metadata: { role: u.role },
      user_metadata: { nome: u.nome },
    });
    if (error || !data.user) throw new Error(`Falha ao criar ${u.email}: ${error?.message}`);
    ids[u.email] = data.user.id;
    // o Auth grava app_metadata DEPOIS do insert; por isso o papel é definido explicitamente aqui
    const { error: roleErr } = await supabase.from("profiles").update({ role: u.role }).eq("id", data.user.id);
    if (roleErr) throw new Error(`Falha ao definir papel de ${u.email}: ${roleErr.message}`);
    console.log(`  + ${u.role.padEnd(8)} ${u.email}`);
  }
  return ids;
}

type Variant = { variant_id: string; produto: string; cor: string; tamanho: string; estoque_minimo: number };

async function seedMovements(ids: Record<string, string>) {
  const { count } = await supabase.from("stock_movements").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.log("Já existem movimentações — histórico não foi gerado novamente.");
    return;
  }
  const { data, error } = await supabase.from("stock_overview").select("variant_id, produto, cor, tamanho, estoque_minimo");
  if (error || !data?.length) throw new Error("Catálogo vazio: rode supabase/seed/01_catalog.sql antes.");
  const variants = data as Variant[];
  const ops = USERS.map((u) => ids[u.email]);
  const now = Date.now();
  const daysAgo = (d: number, h = 9) => new Date(now - d * 86_400_000 - (9 - h) * 3_600_000).toISOString();

  let n = 0;
  const apply = async (userId: string, v: Variant, tipo: "entrada" | "saida", q: number, motivo: string, oc: string | null, when: string, obs?: string) => {
    const { error: e } = await supabase.rpc("_apply_movement", {
      p_user_id: userId,
      p_variant_id: v.variant_id,
      p_tipo: tipo,
      p_quantidade: q,
      p_motivo: motivo,
      p_oc: oc,
      p_obs: obs ?? null,
      p_key: `seed-${v.variant_id}-${n++}`,
      p_ip: "127.0.0.1",
      p_ua: "seed-script",
      p_corrige: null,
      p_created_at: when,
    });
    if (e) throw new Error(`${v.produto} ${v.cor}/${v.tamanho}: ${e.message}`);
  };

  const ocs = [18, 19, 20, 21, 22, 23, 24, 25];
  for (const v of variants) {
    const jaqG = v.produto === "Jaqueta Operacional" && v.tamanho === "G";
    // alguns itens ficam abaixo do mínimo de propósito (alertas do dashboard)
    const low = ["Calça Operacional", "Camisa Polo", "Colete Operacional"].includes(v.produto) && v.tamanho === "G";
    const target = jaqG ? 30 : low ? Math.max(1, Math.floor(v.estoque_minimo / 2)) : v.estoque_minimo + rnd(10, 90);
    const o1 = rnd(8, 25), o2 = rnd(8, 25), o3 = rnd(5, 20);
    const e2 = Math.min(rnd(20, 60), o2 + o3 + target);
    const e1 = target + o1 + o2 + o3 - e2;
    const pick = () => ops[rnd(0, ops.length - 1)];
    const oc = () => `${ocs[rnd(0, ocs.length - 1)]}`;

    await apply(pick(), v, "entrada", e1, "producao", null, daysAgo(20));
    await apply(pick(), v, "saida", o1, "oc", oc(), daysAgo(14, 14));
    await apply(pick(), v, "entrada", e2, rnd(0, 1) ? "producao" : "compra", null, daysAgo(9));
    await apply(pick(), v, "saida", o2, "oc", oc(), daysAgo(6, 10));
    await apply(pick(), v, "saida", o3, "oc", jaqG ? "22" : oc(), daysAgo(3, 15));
  }

  // movimentações de hoje (dashboard com números)
  const hoje = (horasAtras: number) => new Date(now - horasAtras * 3_600_000).toISOString();
  const cam = variants.find((v) => v.produto === "Camiseta Básica" && v.tamanho === "M" && v.cor === "Branca");
  const jaq = variants.find((v) => v.produto === "Jaqueta Operacional" && v.tamanho === "M");
  if (cam) await apply(ids["estoque@estoquebia.app"], cam, "entrada", 40, "producao", null, hoje(3), "Lote da manhã");
  if (jaq) await apply(ids["expedicao@estoquebia.app"], jaq, "saida", 6, "oc", "25", hoje(2));
  console.log(`Geradas ${n + (cam ? 1 : 0) + (jaq ? 1 : 0)} movimentações.`);
}

async function main() {
  console.log("Criando usuários de demonstração…");
  const ids = await ensureUsers();
  await seedMovements(ids);
  console.log("\nPronto.");
  if (generated) {
    console.log(`\nSenha dos usuários de demonstração (exibida só agora): ${password}`);
    console.log("Guarde-a em local seguro ou defina SEED_PASSWORD e rode novamente com usuários novos.");
  }
  console.log("\nLogins: admin1@stockuniformes.demo · admin2@… · operador1@… · operador2@… · operador3@…");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
