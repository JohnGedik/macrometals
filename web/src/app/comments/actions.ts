"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CommentState = { status: "idle" | "error" | "success"; message: string };

export async function addCommentAction(
  _previousState: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const content = String(formData.get("content") ?? "").trim();
  const articleId = String(formData.get("article_id") ?? "");
  const slug = String(formData.get("article_slug") ?? "");
  if (!content || content.length > 3000) {
    return { status: "error", message: "Comments must be between 1 and 3,000 characters." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Comments are not configured yet." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in to join the conversation." };

  const { error } = await supabase.from("comments").insert({ article_id: articleId, user_id: user.id, content });
  if (error) return { status: "error", message: "Your comment could not be posted." };

  revalidatePath(`/articles/${slug}`);
  return { status: "success", message: "Comment posted." };
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