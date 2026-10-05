import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "America/Sao_Paulo";

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(",", "");
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value),
  );
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export function signed(tipo: "entrada" | "saida", qty: number) {
  return `${tipo === "entrada" ? "+" : "−"}${formatNumber(qty)}`;
}

/** Chave de idempotência (randomUUID exige contexto seguro; há fallback para HTTP em rede local). */
export function newKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "2026-09-30" (horário de Brasília) → ISO para filtros no banco. */
export function dayStartISO(date: string) {
  return new Date(`${date}T00:00:00-03:00`).toISOString();
}
export function dayEndISO(date: string) {
  return new Date(`${date}T23:59:59.999-03:00`).toISOString();
}

export function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Escapa curingas do LIKE/ILIKE e caracteres especiais do filtro .or() do PostgREST. */
export function safeLike(term: string) {
  return term
    .replace(/[\\%_]/g, (c) => `\\${c}`)
    .replace(/[,()"]/g, " ")
    .trim();
}

export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** "OC 22", "oc-22" e "22" → "22" (mesma regra do banco). */
export function normalizeOc(v: string) {
  return v.trim().toUpperCase().replace(/^OC[\s._-]*/, "");
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(n: number | null | undefined) {
  return BRL.format(Number(n ?? 0));
}

/** Aceita "19,90", "1.234,56", "19.9" ou número; devolve número ou NaN. */
export function parseMoney(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}

/** Itens importados têm cor/tamanho "Único": nesses casos não há o que mostrar. */
export function variantLabel(cor: string, tamanho: string) {
  const unico = (s: string) => ["único", "unico", "-", "—"].includes(s.trim().toLowerCase());
  if (unico(cor) && unico(tamanho)) return "";
  return `${cor} / ${tamanho}`;
}
