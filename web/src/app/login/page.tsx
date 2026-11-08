import type { Metadata } from "next";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { signInWithEmail, signInWithGoogle } from "@/app/auth/actions";
import { messages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: messages[(await getLocale())].login.title };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = messages[locale].login;
  const errorKey = params.error?.replaceAll("+", " ") as keyof typeof t.errors | undefined;
  const errorMessage = errorKey ? t.errors[errorKey] : undefined;

  return (
    <section className="auth-page">
      <div className="auth-aside">
        <span className="eyebrow">Macro Metals Monitor</span>
        <p className="auth-quote">{t.quote}</p>
        <span className="auth-aside-note">{t.aside}</span>
      </div>
      <div className="auth-panel">
        <Link className="back-link" href="/"><ArrowLeft size={15} /> {t.back}</Link>
        <span className="eyebrow">{t.eyebrow}</span>
        <h1>{t.title}</h1>
        <p className="auth-intro">{t.intro}</p>
        {params.error && <p className="form-alert error" role="alert">{errorMessage ?? params.error.replaceAll("+", " ")}</p>}
        {params.sent && <p className="form-alert success" role="status">{t.checkInbox}</p>}
        <form action={signInWithGoogle}>
          <button className="oauth-button" type="submit"><span className="google-mark">G</span> {t.google}</button>
        </form>
        <div className="auth-divider"><span>{t.orEmail}</span></div>
        <form className="email-login-form" action={signInWithEmail}>
          <label htmlFor="login-email">{t.email}</label>
          <div className="input-with-icon"><Mail size={17} /><input id="login-email" name="email" type="email" placeholder={t.emailPlaceholder} autoComplete="email" required /></div>
          <button className="button-primary" type="submit">{t.sendLink} <span>→</span></button>
          <p className="fine-print">{t.finePrint}</p>
        </form>
      </div>
    </section>
  );
}