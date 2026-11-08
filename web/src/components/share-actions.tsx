"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { messages, type Locale } from "@/lib/i18n";

export function ShareActions({ title, locale }: { title: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const t = messages[locale].article;

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const encodedTitle = encodeURIComponent(title);
  const share = (service: "x" | "linkedin" | "email") => {
    const encodedUrl = encodeURIComponent(window.location.href);
    const destination = service === "x"
      ? `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
      : service === "linkedin"
        ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
        : `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;

    if (service === "email") window.location.href = destination;
    else window.open(destination, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="share-actions" aria-label={t.share}>
      <span className="eyebrow">{t.share}</span>
      <button type="button" onClick={() => share("x")} aria-label={t.shareX}><span className="x-mark">𝕏</span></button>
      <button type="button" onClick={() => share("linkedin")} aria-label={t.shareLinkedIn}><span className="linkedin-mark">in</span></button>
      <button type="button" onClick={() => share("email")} aria-label={t.shareEmail}><Mail size={16} /></button>
      <button type="button" onClick={copyLink} aria-label={copied ? t.copied : t.copyLink} title={copied ? t.linkCopied : t.copyLink}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
    </div>
  );
}