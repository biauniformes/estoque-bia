import "server-only";
import { headers } from "next/headers";

/** IP e user-agent do cliente, quando disponíveis (atrás da Vercel vêm em x-forwarded-for). */
export async function getRequestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0] : h.get("x-real-ip"))?.trim() || null;
  const ua = h.get("user-agent")?.slice(0, 300) || null;
  return { ip, ua };
}
