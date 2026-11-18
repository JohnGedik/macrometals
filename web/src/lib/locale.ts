import { cookies, headers } from "next/headers";
import type { Locale } from "@/lib/i18n";
import { localeFromAcceptLanguage } from "@/lib/locale-preference";

export async function getLocale(): Promise<Locale> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const value = cookieStore.get("site-locale")?.value;

  if (value === "tr" || value === "en") return value;
  return localeFromAcceptLanguage(requestHeaders.get("accept-language"));
}