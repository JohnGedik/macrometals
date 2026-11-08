import { cookies } from "next/headers";
import type { Locale } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("site-locale")?.value;
  return value === "tr" ? "tr" : "en";
}