"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { subscribeNewsletterAction, type NewsletterState } from "@/app/newsletter/actions";
import { messages, type Locale } from "@/lib/i18n";

const initialState: NewsletterState = { status: "idle", message: "" };

export function NewsletterForm({ locale }: { locale: Locale }) {
  const [state, formAction, pending] = useActionState(subscribeNewsletterAction, initialState);
  const t = messages[locale].newsletter;

  return (
    <form className="newsletter-form" action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <label className="sr-only" htmlFor="newsletter-email">{t.email}</label>
      <input id="newsletter-email" type="email" name="email" placeholder={t.placeholder} required />
      <button type="submit" aria-label={t.subscribe} disabled={pending}>
        <span>{pending ? t.joining : t.subscribe}</span><ArrowRight size={17} />
      </button>
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
    </form>
  );
}