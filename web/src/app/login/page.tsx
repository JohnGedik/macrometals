import type { Metadata } from "next";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { signInWithEmail, signInWithGoogle } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <section className="auth-page">
      <div className="auth-aside">
        <span className="eyebrow">Macro Metals Monitor</span>
        <p className="auth-quote">“The first step is to see the relationship.”</p>
        <span className="auth-aside-note">Research for a longer view.</span>
      </div>
      <div className="auth-panel">
        <Link className="back-link" href="/"><ArrowLeft size={15} /> Back to the journal</Link>
        <span className="eyebrow">Your reading room</span>
        <h1>Sign in</h1>
        <p className="auth-intro">Join the conversation and keep your profile in one place.</p>
        {params.error && <p className="form-alert error" role="alert">{params.error.replaceAll("+", " ")}</p>}
        {params.sent && <p className="form-alert success" role="status">Check your inbox for a secure sign-in link.</p>}
        <form action={signInWithGoogle}>
          <button className="oauth-button" type="submit"><span className="google-mark">G</span> Continue with Google</button>
        </form>
        <div className="auth-divider"><span>or use email</span></div>
        <form className="email-login-form" action={signInWithEmail}>
          <label htmlFor="login-email">Email address</label>
          <div className="input-with-icon"><Mail size={17} /><input id="login-email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></div>
          <button className="button-primary" type="submit">Send sign-in link <span>→</span></button>
          <p className="fine-print">We’ll email you a secure link. No password to remember.</p>
        </form>
      </div>
    </section>
  );
}