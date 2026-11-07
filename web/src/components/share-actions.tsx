"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

export function ShareActions({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

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
    <div className="share-actions" aria-label="Share this article">
      <span className="eyebrow">Share</span>
      <button type="button" onClick={() => share("x")} aria-label="Share on X"><span className="x-mark">𝕏</span></button>
      <button type="button" onClick={() => share("linkedin")} aria-label="Share on LinkedIn"><span className="linkedin-mark">in</span></button>
      <button type="button" onClick={() => share("email")} aria-label="Share by email"><Mail size={16} /></button>
      <button type="button" onClick={copyLink} aria-label={copied ? "Link copied" : "Copy article link"} title={copied ? "Copied" : "Copy link"}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
    </div>
  );
}