"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Avatar } from "@/components/avatar";
import { addCommentAction, deleteCommentAction, updateCommentAction, type CommentState } from "@/app/comments/actions";

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

function CommentComposer({ articleId, articleSlug }: { articleId: string; articleSlug: string }) {
  const [state, formAction, pending] = useActionState(addCommentAction, initialState);

  return (
    <form className="comment-composer" action={formAction}>
      <input type="hidden" name="article_id" value={articleId} />
      <input type="hidden" name="article_slug" value={articleSlug} />
      <label htmlFor="comment-content">Add to the discussion</label>
      <textarea id="comment-content" name="content" placeholder="Keep it considered and on the subject…" maxLength={3000} rows={4} required />
      <div className="comment-compose-bottom"><span>Up to 3,000 characters</span><button className="button-primary" type="submit" disabled={pending}>{pending ? "Posting…" : "Post comment"} <span>→</span></button></div>
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
    </form>
  );
}

export function CommentSection({
  articleId,
  articleSlug,
  comments,
  currentUserId,
}: {
  articleId: string;
  articleSlug: string;
  comments: Comment[];
  currentUserId: string | null;
}) {
  return (
    <section className="comments-section" id="comments">
      <div className="comments-heading"><div><p className="eyebrow">Reader notes</p><h2>Conversation <span>{comments.length.toString().padStart(2, "0")}</span></h2></div></div>
      {currentUserId ? (
        <CommentComposer articleId={articleId} articleSlug={articleSlug} />
      ) : (
        <div className="comment-signin"><p>Sign in to add a considered note to the conversation.</p><Link className="text-link" href="/login">Sign in <span>→</span></Link></div>
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
                <div className="comment-byline"><strong>{authorName}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></div>
                {ownComment ? (
                  <div className="comment-owner-tools">
                    <form action={updateCommentAction}>
                      <input type="hidden" name="comment_id" value={comment.id} />
                      <input type="hidden" name="article_slug" value={articleSlug} />
                      <label className="sr-only" htmlFor={`edit-${comment.id}`}>Edit your comment</label>
                      <textarea id={`edit-${comment.id}`} name="content" defaultValue={comment.content} maxLength={3000} rows={3} required />
                      <button className="comment-action" type="submit">Save edit</button>
                    </form>
                    <form action={deleteCommentAction}>
                      <input type="hidden" name="comment_id" value={comment.id} />
                      <input type="hidden" name="article_slug" value={articleSlug} />
                      <button className="comment-action delete-action" type="submit">Delete</button>
                    </form>
                  </div>
                ) : <p>{comment.content}</p>}
              </div>
            </article>
          );
        })}
        {comments.length === 0 && <p className="empty-comments">No comments yet. Start with a useful question or observation.</p>}
      </div>
    </section>
  );
}