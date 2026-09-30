import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestMeta } from "@/lib/request-meta";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const { ip, ua } = await getRequestMeta();
    await supabase.rpc("log_audit_event", {
      p_action: "logout",
      p_entity_type: "profile",
      p_entity_id: data.user.id,
      p_metadata: {},
      p_ip: ip,
      p_ua: ua,
    });
  }
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
