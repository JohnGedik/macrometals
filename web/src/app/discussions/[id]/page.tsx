import Link from "next/link";
import { notFound } from "next/navigation";
import { addDiscussionReplyAction, voteDiscussionAction } from "@/app/community/social-actions";
import { CommunityNotice, ReportControl } from "@/components/community-controls";
import { communityCopy } from "@/lib/community-copy";
import type { Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Reply = { id: string; parent_id: string | null; author_id: string; content: string; created_at: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ReplyForm({ postId, parentId, locale }: { postId: string; parentId?: string; locale: Locale }) {
  const t = communityCopy[locale];
  return <form action={addDiscussionReplyAction} className="community-social-form">
    <input type="hidden" name="post_id" value={postId} />
    {parentId && <input type="hidden" name="parent_id" value={parentId} />}
    <label>{t.reply}<textarea name="content" maxLength={3000} rows={3} placeholder={t.replyPlaceholder} required /></label>
    <button className="button-secondary" type="submit">{t.reply}</button>
  </form>;
}

function ReplyThread({ parentId, depth, replies, authors, postId, signedIn, locale }: {
  parentId: string | null; depth: number; replies: Reply[]; authors: Map<string, string>;
  postId: string; signedIn: boolean; locale: Locale;
}) {
  const t = communityCopy[locale];
  const children = replies.filter((reply) => reply.parent_id === parentId);
  if (!children.length) return null;
  return <ul className="discussion-replies">{children.map((reply) => <li key={reply.id}>
    <p className="discussion-meta">{authors.get(reply.author_id) ?? "Reader"} · {new Date(reply.created_at).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US")}</p>
    <p className="discussion-content">{reply.content}</p>
    <ReportControl type="reply" id={reply.id} path={`/discussions/${postId}`} signedIn={signedIn} locale={locale} />
    {signedIn && depth < 3 && <details><summary>{t.reply}</summary><ReplyForm postId={postId} parentId={reply.id} locale={locale} /></details>}
    <ReplyThread parentId={reply.id} depth={depth + 1} replies={replies} authors={authors} postId={postId} signedIn={signedIn} locale={locale} />
  </li>)}</ul>;
}

export default async function DiscussionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const locale = await getLocale();
  const t = communityCopy[locale];
  const status = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    console.error("Discussions are not configured");
    return <section className="community-page content-width community-social"><p role="alert">{t.failed}</p></section>;
  }
  const [postResult, summaryResult, userResult] = await Promise.all([
    supabase.from("discussion_posts").select("id, author_id, title, content, created_at").eq("id", id).maybeSingle(),
    supabase.rpc("get_discussion_summaries", { post_ids: [id] }),
    supabase.auth.getUser(),
  ]);
  if (postResult.error || summaryResult.error) {
    console.error("Could not load discussion", postResult.error?.code ?? summaryResult.error?.code);
    return <section className="community-page content-width community-social"><p role="alert">{t.failed}</p></section>;
  }
  const post = postResult.data;
  if (!post) notFound();
  const replies: Reply[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from("discussion_replies").select("id, parent_id, author_id, content, created_at")
      .eq("post_id", id).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 499);
    if (result.error) {
      console.error("Could not load discussion replies", result.error.code);
      return <section className="community-page content-width community-social"><p role="alert">{t.failed}</p></section>;
    }
    replies.push(...result.data);
    if (result.data.length < 500) break;
  }
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, display_name")
    .in("id", [...new Set([post.author_id, ...replies.map((reply) => reply.author_id)])]);
  if (profileError) {
    console.error("Could not load discussion authors", profileError.code);
    return <section className="community-page content-width community-social"><p role="alert">{t.failed}</p></section>;
  }
  const authors = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name ?? "Reader"]));
  const summary = summaryResult.data?.[0];
  const score = Number(summary?.score ?? 0);
  const userVote = Number(summary?.user_vote ?? 0);
  const signedIn = !!userResult.data.user;
  const path = `/discussions/${id}`;
  return <article className="community-page content-width community-social">
    <p><Link className="text-link" href="/community/topics">{t.topicFeeds}</Link></p>
    <h1>{post.title}</h1>
    <p className="discussion-meta">{authors.get(post.author_id) ?? "Reader"} · {new Date(post.created_at).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US")}</p>
    <CommunityNotice error={status.error} notice={status.notice} locale={locale} />
    <p className="discussion-content">{post.content}</p>
    <div className="discussion-votes">
      {signedIn && [1, -1].map((vote) => <form action={voteDiscussionAction} key={vote}>
        <input type="hidden" name="post_id" value={id} /><input type="hidden" name="vote" value={vote} />
        <button className="button-secondary" type="submit" aria-pressed={userVote === vote}>{vote === 1 ? `▲ ${t.upvote}` : `▼ ${t.downvote}`}</button>
      </form>)}
      <span>▲ {score}</span>
    </div>
    <ReportControl type="discussion" id={id} path={path} signedIn={signedIn} locale={locale} />
    <h2>{t.replies}</h2><p>{t.replyLimit}</p>
    {signedIn ? <ReplyForm postId={id} locale={locale} /> : <p>{t.signIn} <Link href="/login">{t.login}</Link></p>}
    <ReplyThread parentId={null} depth={1} replies={replies} authors={authors} postId={id} signedIn={signedIn} locale={locale} />
  </article>;
}
