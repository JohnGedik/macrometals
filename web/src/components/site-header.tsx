import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Search, UserRound } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { LanguageSwitch } from "@/components/language-switch";
import { messages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function SiteHeader() {
  const locale = await getLocale();
  const t = messages[locale].header;
  const supabase = await createSupabaseServerClient();
  const { data: { user } = { user: null } } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  return (
    <header className="site-header">
      <div className="header-topline">
        <span>{t.tagline}</span>
        <div className="header-top-actions"><span>{t.markets}</span><LanguageSwitch locale={locale} label={t.language} /></div>
      </div>
      <div className="header-main">
        <Link className="wordmark" href="/" aria-label="Macro Metals Monitor home">
          <Image className="wordmark-mark" src="/macro-metals-compass.svg" alt="" width={44} height={44} priority />
          <span className="wordmark-name">Macro Metals<br />Monitor</span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link href="/">{t.latest}</Link>
          <Link href="/tag/gold">{t.gold}</Link>
          <Link href="/tag/silver">{t.silver}</Link>
          <Link href="/tag/oil">{t.oil}</Link>
          <Link href="/author/ufuk-Gedikoglu">{t.about}</Link>
        </nav>
        <div className="header-actions">
          <form action="/search" className="header-search">
            <label className="sr-only" htmlFor="header-search">{t.searchArticles}</label>
            <input id="header-search" name="q" placeholder={t.search} />
            <button type="submit" aria-label={t.submitSearch}><Search size={16} /></button>
          </form>
          {user ? (
            <div className="account-actions">
              <Link className="account-link" href="/profile"><UserRound size={16} /> {t.profile}</Link>
              <form action={signOut}><button className="signout-link" type="submit">{t.signOut}</button></form>
            </div>
          ) : (
            <Link className="login-link" href="/login">{t.signIn} <ArrowUpRight size={15} /></Link>
          )}
        </div>
      </div>
    </header>
  );
}