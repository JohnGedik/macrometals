import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const nextPath = requestUrl.searchParams.get("next");
  const destination =
    nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/profile";
  const code = requestUrl.searchParams.get("code");
  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/login?error=Sign-in+could+not+be+completed", requestUrl.origin));
}