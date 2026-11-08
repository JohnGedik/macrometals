import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { saveProfileAction } from "@/app/profile/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { messages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: messages[(await getLocale())].profile.yourProfile };
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=Supabase+is+not+configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, slug")
    .eq("id", user.id)
    .maybeSingle();
  const params = await searchParams;
  const locale = await getLocale();
  const t = messages[locale].profile;
  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Reader";

  return (
    <section className="profile-page content-width">
      <div className="section-kicker"><span className="eyebrow">{t.account}</span><span className="kicker-line" /></div>
      <div className="profile-heading"><Avatar name={displayName} imageUrl={profile?.avatar_url} size="large" /><div><p className="eyebrow">{t.yourProfile}</p><h1>{displayName}</h1></div></div>
      <div className="profile-layout">
        <div className="profile-form-wrap">
          <h2>{t.details}</h2>
          <p className="muted-copy">{t.description}</p>
          {params.error && <p className="form-alert error" role="alert">{params.error}</p>}
          {params.saved && <p className="form-alert success" role="status">{t.saved}</p>}
          <form className="profile-form" action={saveProfileAction}>
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="profile-email">{t.email}</label>
            <input id="profile-email" type="email" value={user.email ?? ""} disabled />
            <label htmlFor="display-name">{t.displayName}</label>
            <input id="display-name" name="display_name" defaultValue={displayName} maxLength={80} required />
            <label htmlFor="profile-bio">{t.bio}</label>
            <textarea id="profile-bio" name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} rows={5} />
            <label htmlFor="avatar">{t.avatar}</label>
            <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
            <span className="fine-print">{t.avatarHint}</span>
            <button className="button-primary profile-save" type="submit">{t.save} <span>→</span></button>
          </form>
        </div>
        <aside className="profile-aside">
          <span className="eyebrow">{t.authorPage}</span>
          <h3>{t.publicWriting}</h3>
          <p className="muted-copy">{t.writingDescription}</p>
          {profile?.slug && <a className="text-link" href={`/author/${profile.slug}`}>{t.viewAuthor} <span>↗</span></a>}
          <div className="profile-email-note"><span className="eyebrow">{t.signedInAs}</span><span>{user.email}</span></div>
        </aside>
      </div>
    </section>
  );
}