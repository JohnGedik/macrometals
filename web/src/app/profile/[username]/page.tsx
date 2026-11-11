import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article-card";
import { Avatar } from "@/components/avatar";
import { getArticles } from "@/lib/articles";
import { getLocale } from "@/lib/locale";
import { messages } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteProps = { params: Promise<{ username: string }> };

async function getPublicProfile(username: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("profiles")
    .select("id, username, display_name, bio, avatar_url, created_at")
    .ilike("username", username).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  return profile ? { title: profile.display_name ?? profile.username, description: profile.bio ?? "" } : { title: "Profile not found" };
}

export default async function PublicProfilePage({ params }: RouteProps) {
  const { username } = await params;
  const locale = await getLocale();
  const t = messages[locale].profile;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();

  const articles = (await getArticles(locale)).filter((article) => article.authorId === profile.id);
  const votesReceived = articles.reduce((total, article) => total + (article.upvotes ?? 0) + (article.downvotes ?? 0), 0);
  const joined = new Date(profile.created_at).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="author-page content-width">
      <div className="section-kicker"><span className="eyebrow">{t.publicProfile}</span><span className="kicker-line" /></div>
      <div className="author-profile"><Avatar name={profile.display_name ?? profile.username} imageUrl={profile.avatar_url} size="large" /><div><p className="eyebrow">@{profile.username}</p><h1>{profile.display_name ?? profile.username}</h1><p>{profile.bio}</p></div></div>
      <dl className="community-profile-stats">
        <div><dt>{t.joined}</dt><dd>{joined}</dd></div>
        <div><dt>{t.articleCount}</dt><dd>{articles.length}</dd></div>
        <div><dt>{t.votesReceived}</dt><dd>{votesReceived}</dd></div>
      </dl>
      <div className="section-heading"><div><p className="eyebrow">{messages[locale].author.fromDesk}</p><h2>{messages[locale].author.articlesBy.replace("{name}", profile.display_name ?? profile.username)}</h2></div></div>
      {articles.length ? <div className="article-grid">{articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} locale={locale} />)}</div> : <p className="empty-state">{messages[locale].author.empty}</p>}
    </section>
  );
}
