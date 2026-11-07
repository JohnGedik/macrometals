import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Search, UserRound } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export async function SiteHeader() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } = { user: null } } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  return (
    <header className="site-header">
      <div className="header-topline">
        <span>Independent macro research</span>
        <span>Gold · Silver · Oil</span>
      </div>
      <div className="header-main">
        <Link className="wordmark" href="/" aria-label="Macro Metals Monitor home">
          <Image className="wordmark-mark" src="/macro-metals-compass.svg" alt="" width={44} height={44} priority />
          <span className="wordmark-name">Macro Metals<br />Monitor</span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link href="/">Latest</Link>
          <Link href="/tag/gold">Gold</Link>
          <Link href="/tag/silver">Silver</Link>
          <Link href="/tag/oil">Oil</Link>
          <Link href="/author/ufuk-Gedikoglu">About</Link>
        </nav>
        <div className="header-actions">
          <form action="/search" className="header-search">
            <label className="sr-only" htmlFor="header-search">Search articles</label>
            <input id="header-search" name="q" placeholder="Search" />
            <button type="submit" aria-label="Submit search"><Search size={16} /></button>
          </form>
          {user ? (
            <div className="account-actions">
              <Link className="account-link" href="/profile"><UserRound size={16} /> Profile</Link>
              <form action={signOut}><button className="signout-link" type="submit">Sign out</button></form>
            </div>
          ) : (
            <Link className="login-link" href="/login">Sign in <ArrowUpRight size={15} /></Link>
          )}
        </div>
      </div>
    </header>
  );
}