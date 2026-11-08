"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messages, type Locale } from "@/lib/i18n";

export type CommentState = { status: "idle" | "error" | "success"; message: string };

export async function addCommentAction(
  _previousState: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const content = String(formData.get("content") ?? "").trim();
  const articleId = String(formData.get("article_id") ?? "");
  const slug = String(formData.get("article_slug") ?? "");
  const locale: Locale = formData.get("locale") === "tr" ? "tr" : "en";
  const t = messages[locale].article;
  if (!content || content.length > 3000) {
    return { status: "error", message: t.invalidComment };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: t.commentsNotConfigured };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: t.signInToComment };

  const { error } = await supabase.from("comments").insert({ article_id: articleId, user_id: user.id, content });
  if (error) return { status: "error", message: t.postFailed };

  revalidatePath(`/articles/${slug}`);
  return { status: "success", message: t.commentPosted };
}

export async function updateCommentAction(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  const commentId = String(formData.get("comment_id") ?? "");
  const slug = String(formData.get("article_slug") ?? "");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !content || content.length > 3000) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("comments").update({ content }).eq("id", commentId).eq("user_id", user.id);
  revalidatePath(`/articles/${slug}`);
}

export async function deleteCommentAction(formData: FormData) {
  const commentId = String(formData.get("comment_id") ?? "");
  const slug = String(formData.get("article_slug") ?? "");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("comments").delete().eq("id", commentId).eq("user_id", user.id);
  revalidatePath(`/articles/${slug}`);
}