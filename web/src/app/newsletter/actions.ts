"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NewsletterState = { status: "idle" | "success" | "error"; message: string };

export async function subscribeNewsletterAction(
  _previousState: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { status: "error", message: "Newsletter signup is not configured yet." };
  }

  const { error } = await supabase.from("newsletter_subscribers").insert({ email });
  if (error?.code === "23505") {
    return { status: "success", message: "You are already on the list." };
  }
  if (error) return { status: "error", message: "We could not save your signup. Try again." };
  return { status: "success", message: "You are on the list. Watch your inbox." };
}