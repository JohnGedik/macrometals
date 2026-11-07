import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article-card";
import { Avatar } from "@/components/avatar";
import { getAuthorBySlug } from "@/lib/articles";

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getAuthorBySlug(slug);
  return profile
    ? { title: profile.author.displayName, description: profile.author.bio }
    : { title: "Author not found" };
}

export default async function AuthorPage({ params }: RouteProps) {
  const { slug } = await params;
  const profile = await getAuthorBySlug(slug);
  if (!profile) notFound();

  return (
    <section className="author-page content-width">
      <div className="section-kicker"><span className="eyebrow">Contributors</span><span className="kicker-line" /></div>
      <div className="author-profile"><Avatar name={profile.author.displayName} imageUrl={profile.author.avatarUrl} size="large" /><div><p className="eyebrow">Author</p><h1>{profile.author.displayName}</h1><p>{profile.author.bio}</p></div></div>
      <div className="section-heading"><div><p className="eyebrow">From the desk</p><h2>Articles by {profile.author.displayName}</h2></div></div>
      {profile.articles.length ? <div className="article-grid">{profile.articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} />)}</div> : <p className="empty-state">No published articles yet.</p>}
    </section>
  );
}