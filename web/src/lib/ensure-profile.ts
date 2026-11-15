import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureProfile(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile, error } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (error) {
    console.error("Could not load profile", error.code);
    return false;
  }
  if (profile) return true;

  const { error: createError } = await supabase.rpc("ensure_own_profile");
  if (createError) {
    console.error("Could not create missing profile", createError.code);
    return false;
  }
  return true;
}
