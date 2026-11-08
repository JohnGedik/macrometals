import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NewsletterForm } from "@/components/newsletter-form";
import { getLocale } from "@/lib/locale";
import { messages } from "@/lib/i18n";

export async function SiteFooter() {
  const locale = await getLocale();
  const t = messages[locale].footer;

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link className="footer-wordmark" href="/">Macro Metals Monitor<span>.</span></Link>
          <p>{t.tagline}</p>
        </div>
        <div className="footer-signup">
          <p className="eyebrow">{t.note}</p>
          <h2>{t.newsletterTitle}</h2>
          <NewsletterForm locale={locale} />
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/">{t.latest} <ArrowUpRight size={14} /></Link>
          <Link href="/author/ufuk-Gedikoglu">{t.about} <ArrowUpRight size={14} /></Link>
          <Link href="/profile">{t.profile} <ArrowUpRight size={14} /></Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Macro Metals Monitor</span>
        <span>{t.disclaimer}</span>
      </div>
    </footer>
  );
}