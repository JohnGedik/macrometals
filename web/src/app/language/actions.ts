"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function changeLanguageAction(formData: FormData) {
  const language = formData.get("language");
  const locale = language === "tr" ? "tr" : "en";
  const requestedPath = String(formData.get("returnTo") ?? "/");
  const returnTo = requestedPath.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : "/";

  (await cookies()).set("site-locale", locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(returnTo);
}