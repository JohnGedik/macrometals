"use client";

import { useRef, type FormEvent } from "react";
import { changeLanguageAction } from "@/app/language/actions";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  const returnTo = useRef<HTMLInputElement>(null);

  function rememberCurrentUrl(event: FormEvent<HTMLFormElement>) {
    if (returnTo.current) {
      returnTo.current.value = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }
    event.currentTarget.querySelector<HTMLButtonElement>("button[type=submit]")?.blur();
  }

  return (
    <form className="language-switch" action={changeLanguageAction} onSubmit={rememberCurrentUrl} aria-label={label}>
      <input ref={returnTo} type="hidden" name="returnTo" value="/" />
      <button className={locale === "en" ? "active" : ""} type="submit" name="language" value="en" aria-pressed={locale === "en"}>EN</button>
      <button className={locale === "tr" ? "active" : ""} type="submit" name="language" value="tr" aria-pressed={locale === "tr"}>TR</button>
    </form>
  );
}