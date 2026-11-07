import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { saveProfileAction } from "@/app/profile/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

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
  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Reader";

  return (
    <section className="profile-page content-width">
      <div className="section-kicker"><span className="eyebrow">Account</span><span className="kicker-line" /></div>
      <div className="profile-heading"><Avatar name={displayName} imageUrl={profile?.avatar_url} size="large" /><div><p className="eyebrow">Your profile</p><h1>{displayName}</h1></div></div>
      <div className="profile-layout">
        <div className="profile-form-wrap">
          <h2>Profile details</h2>
          <p className="muted-copy">Your name, bio, and photo appear beside your comments and on your author page.</p>
          {params.error && <p className="form-alert error" role="alert">{params.error.replaceAll("+", " ")}</p>}
          {params.saved && <p className="form-alert success" role="status">Profile saved.</p>}
          <form className="profile-form" action={saveProfileAction} encType="multipart/form-data">
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={user.email ?? ""} disabled />
            <label htmlFor="display-name">Display name</label>
            <input id="display-name" name="display_name" defaultValue={displayName} maxLength={80} required />
            <label htmlFor="profile-bio">Bio</label>
            <textarea id="profile-bio" name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} rows={5} />
            <label htmlFor="avatar">Avatar image</label>
            <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
            <span className="fine-print">JPG, PNG, or WebP · up to 5 MB</span>
            <button className="button-primary profile-save" type="submit">Save profile <span>→</span></button>
          </form>
        </div>
        <aside className="profile-aside">
          <span className="eyebrow">Author page</span>
          <h3>Your public writing</h3>
          <p className="muted-copy">Published articles associated with your account will appear on your author page.</p>
          {profile?.slug && <a className="text-link" href={`/author/${profile.slug}`}>View author page <span>↗</span></a>}
          <div className="profile-email-note"><span className="eyebrow">Signed in as</span><span>{user.email}</span></div>
        </aside>
      </div>
    </section>
  );
}