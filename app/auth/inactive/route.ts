import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Usuário desativado com sessão ainda válida: encerra a sessão e volta ao login.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?erro=inativo", request.url));
}
