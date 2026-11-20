import Link from "next/link";
import { createDiscussionAction } from "@/app/community/social-actions";
import { CommunityNotice } from "@/components/community-controls";
import { communityCopy } from "@/lib/community-copy";
import { getLocale } from "@/lib/locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New discussion",
  robots: { index: false, follow: true },
};

export default async function NewDiscussionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const locale = await getLocale();
  const t = communityCopy[locale];
  const status = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    console.error("Discussions are not configured");
    return <section className="community-page content-width community-social"><h1>{t.newDiscussion}</h1><p role="alert">{t.failed}</p></section>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  return <section className="community-page content-width community-social">
    <h1>{t.newDiscussion}</h1>
    <CommunityNotice error={status.error} locale={locale} />
    {user ? <form action={createDiscussionAction} className="community-social-form">
      <label>{t.topic}<select name="topic" required><option value="gold">{t.gold}</option><option value="silver">{t.silver}</option><option value="copper">{t.copper}</option><option value="oil">{t.oil}</option><option value="macro">{t.macro}</option></select></label>
      <label>{t.title}<input name="title" maxLength={140} required /></label>
      <label>{t.content}<textarea name="content" maxLength={3000} rows={8} required /></label>
      <button className="button-primary" type="submit">{t.post}</button>
    </form> : <p>{t.signIn} <Link href="/login">{t.login}</Link></p>}
  </section>;
}
