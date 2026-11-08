"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Avatar } from "@/components/avatar";
import { addCommentAction, deleteCommentAction, updateCommentAction, type CommentState } from "@/app/comments/actions";
import { messages, type Locale } from "@/lib/i18n";

type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles:
    | { display_name: string | null; avatar_url: string | null }
    | Array<{ display_name: string | null; avatar_url: string | null }>
    | null;
};

const initialState: CommentState = { status: "idle", message: "" };

function CommentComposer({ articleId, articleSlug, locale }: { articleId: string; articleSlug: string; locale: Locale }) {
  const [state, formAction, pending] = useActionState(addCommentAction, initialState);
  const t = messages[locale].article;

  return (
    <form className="comment-composer" action={formAction}>
      <input type="hidden" name="article_id" value={articleId} />
      <input type="hidden" name="article_slug" value={articleSlug} />
      <input type="hidden" name="locale" value={locale} />
      <label htmlFor="comment-content">{t.addDiscussion}</label>
      <textarea id="comment-content" name="content" placeholder={t.commentPlaceholder} maxLength={3000} rows={4} required />
      <div className="comment-compose-bottom"><span>{t.characterLimit}</span><button className="button-primary" type="submit" disabled={pending}>{pending ? t.posting : t.postComment} <span>→</span></button></div>
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
    </form>
  );
}

export function CommentSection({
  articleId,
  articleSlug,
  comments,
  currentUserId,
  locale,
}: {
  articleId: string;
  articleSlug: string;
  comments: Comment[];
  currentUserId: string | null;
  locale: Locale;
}) {
  const t = messages[locale].article;

  return (
    <section className="comments-section" id="comments">
      <div className="comments-heading"><div><p className="eyebrow">{t.readerNotes}</p><h2>{t.conversation} <span>{comments.length.toString().padStart(2, "0")}</span></h2></div></div>
      {currentUserId ? (
        <CommentComposer articleId={articleId} articleSlug={articleSlug} locale={locale} />
      ) : (
        <div className="comment-signin"><p>{t.signInToComment}</p><Link className="text-link" href="/login">{messages[locale].header.signIn} <span>→</span></Link></div>
      )}
      <div className="comment-list">
        {comments.map((comment) => {
          const profile = Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles;
          const authorName = profile?.display_name ?? "Reader";
          const ownComment = comment.user_id === currentUserId;
          return (
            <article className="comment-item" key={comment.id}>
              <Avatar name={authorName} imageUrl={profile?.avatar_url} />
              <div className="comment-content">
                <div className="comment-byline"><strong>{authorName}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></div>
                {ownComment ? (
                  <div className="comment-owner-tools">
                    <form action={updateCommentAction}>
                      <input type="hidden" name="comment_id" value={comment.id} />
                      <input type="hidden" name="article_slug" value={articleSlug} />
                      <label className="sr-only" htmlFor={`edit-${comment.id}`}>{t.editComment}</label>
                      <textarea id={`edit-${comment.id}`} name="content" defaultValue={comment.content} maxLength={3000} rows={3} required />
                      <button className="comment-action" type="submit">{t.saveEdit}</button>
                    </form>
                    <form action={deleteCommentAction}>
                      <input type="hidden" name="comment_id" value={comment.id} />
                      <input type="hidden" name="article_slug" value={articleSlug} />
                      <button className="comment-action delete-action" type="submit">{t.delete}</button>
                    </form>
                  </div>
                ) : <p>{comment.content}</p>}
              </div>
            </article>
          );
        })}
        {comments.length === 0 && <p className="empty-comments">{t.noComments}</p>}
      </div>
    </section>
  );
}