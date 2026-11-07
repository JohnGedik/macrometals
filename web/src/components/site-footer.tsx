import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NewsletterForm } from "@/components/newsletter-form";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link className="footer-wordmark" href="/">Macro Metals Monitor<span>.</span></Link>
          <p>Markets leave clues. We follow the relationships.</p>
        </div>
        <div className="footer-signup">
          <p className="eyebrow">A considered note, not a daily deluge</p>
          <h2>Get future macro analysis by email</h2>
          <NewsletterForm />
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/">Latest <ArrowUpRight size={14} /></Link>
          <Link href="/author/ufuk-Gedikoglu">About <ArrowUpRight size={14} /></Link>
          <Link href="/profile">Profile <ArrowUpRight size={14} /></Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Macro Metals Monitor</span>
        <span>Independent research. Not investment advice.</span>
      </div>
    </footer>
  );
}