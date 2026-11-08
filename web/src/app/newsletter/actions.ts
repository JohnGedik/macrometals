"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messages, type Locale } from "@/lib/i18n";

export type NewsletterState = { status: "idle" | "success" | "error"; message: string };

export async function subscribeNewsletterAction(
  _previousState: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const locale: Locale = formData.get("locale") === "tr" ? "tr" : "en";
  const t = messages[locale].newsletter;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: t.invalid };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { status: "error", message: t.notConfigured };
  }

  const { error } = await supabase.from("newsletter_subscribers").insert({ email });
  if (error?.code === "23505") {
    return { status: "success", message: t.duplicate };
  }
  if (error) return { status: "error", message: t.failed };
  return { status: "success", message: t.success };
}