import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { voteOnArticleAction } from "@/app/community/actions";
import { messages, type Locale } from "@/lib/i18n";

export function VoteWidget({
  articleId,
  slug,
  upvotes,
  downvotes,
  userVote,
  signedIn,
  locale,
}: {
  articleId: string;
  slug: string;
  upvotes: number;
  downvotes: number;
  userVote: -1 | 0 | 1;
  signedIn: boolean;
  locale: Locale;
}) {
  const t = messages[locale].article;
  const score = upvotes - downvotes;
  if (!signedIn) {
    return (
      <section className="vote-panel" aria-label={t.voting}>
        <div className="vote-summary"><strong>{score}</strong><span>{t.netScore}</span></div>
        <div className="vote-totals"><span>{t.totalUpvotes}: {upvotes}</span><span>{t.totalDownvotes}: {downvotes}</span></div>
        <Link className="text-link" href="/login">{t.signInToVote}</Link>
      </section>
    );
  }

  return (
    <section className="vote-panel" aria-label={t.voting}>
      <div className="vote-summary"><strong>{score}</strong><span>{t.netScore}</span></div>
      <div className="vote-controls">
        <form action={voteOnArticleAction}>
          <input type="hidden" name="article_id" value={articleId} />
          <input type="hidden" name="slug" value={slug} />
          <button className={userVote === 1 ? "vote-button is-selected" : "vote-button"} type="submit" name="vote_type" value="1" aria-label={`${t.upvote}: ${upvotes}`} title={t.upvote}><ArrowUp size={17} /><span>{upvotes}</span></button>
        </form>
        <form action={voteOnArticleAction}>
          <input type="hidden" name="article_id" value={articleId} />
          <input type="hidden" name="slug" value={slug} />
          <button className={userVote === -1 ? "vote-button is-selected" : "vote-button"} type="submit" name="vote_type" value="-1" aria-label={`${t.downvote}: ${downvotes}`} title={t.downvote}><ArrowDown size={17} /><span>{downvotes}</span></button>
        </form>
        {userVote !== 0 && <form action={voteOnArticleAction}>
          <input type="hidden" name="article_id" value={articleId} />
          <input type="hidden" name="slug" value={slug} />
          <button className="vote-remove" type="submit" name="vote_type" value="0">{t.removeVote}</button>
        </form>}
      </div>
    </section>
  );
}
