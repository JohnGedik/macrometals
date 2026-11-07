"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { subscribeNewsletterAction, type NewsletterState } from "@/app/newsletter/actions";

const initialState: NewsletterState = { status: "idle", message: "" };

export function NewsletterForm() {
  const [state, formAction, pending] = useActionState(subscribeNewsletterAction, initialState);

  return (
    <form className="newsletter-form" action={formAction}>
      <label className="sr-only" htmlFor="newsletter-email">Email address</label>
      <input id="newsletter-email" type="email" name="email" placeholder="Your email address" required />
      <button type="submit" aria-label="Subscribe to the newsletter" disabled={pending}>
        <span>{pending ? "Joining" : "Subscribe"}</span><ArrowRight size={17} />
      </button>
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
    </form>
  );
}