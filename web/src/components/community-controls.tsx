import Link from "next/link";
import { reportCommunityContentAction, saveArticleAction } from "@/app/community/social-actions";
import { communityCopy } from "@/lib/community-copy";
import type { Locale } from "@/lib/i18n";

export function CommunityNotice({ error, notice, locale }: { error?: string; notice?: string; locale: Locale }) {
  const t = communityCopy[locale];
  if (error) return <p className="form-alert error" role="alert">{error === "invalid" ? t.invalid : t.failed}</p>;
  if (notice === "reported") return <p className="form-alert success" role="status">{t.reported}</p>;
  if (notice === "posted" || notice === "reply") return <p className="form-alert success" role="status">{notice === "posted" ? t.discussionPosted : t.replyPosted}</p>;
  return null;
}

export function SaveArticleControl({ id, path, saved, signedIn, locale }: {
  id: string; path: string; saved: boolean; signedIn: boolean; locale: Locale;
}) {
  const t = communityCopy[locale];
  if (!signedIn) return <Link className="text-link" href="/login">{t.login}</Link>;
  return <form action={saveArticleAction}>
    <input type="hidden" name="article_id" value={id} />
    <input type="hidden" name="return_to" value={path} />
    <input type="hidden" name="operation" value={saved ? "remove" : "save"} />
    <button className="button-secondary" type="submit">{saved ? t.removeSaved : t.save}</button>
  </form>;
}

export function ReportControl({ type, id, path, signedIn, locale }: {
  type: "article" | "discussion" | "reply"; id: string; path: string; signedIn: boolean; locale: Locale;
}) {
  const t = communityCopy[locale];
  if (!signedIn) return null;
  return <details className="community-report">
    <summary>{t.report}</summary>
    <form action={reportCommunityContentAction}>
      <input type="hidden" name="target_type" value={type} />
      <input type="hidden" name="target_id" value={id} />
      <input type="hidden" name="return_to" value={path} />
      <label>{t.reportReason}<textarea name="reason" minLength={5} maxLength={500} required rows={3} /></label>
      <p>{t.reportHint}</p>
      <button className="button-secondary" type="submit">{t.submitReport}</button>
    </form>
  </details>;
}
