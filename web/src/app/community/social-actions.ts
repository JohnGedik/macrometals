"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getArticleBySlug } from "@/lib/articles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const topics = new Set(["gold", "silver", "copper", "oil", "macro"]);

function messageUrl(path: string, key: "error" | "notice", value: string) {
  return `${path}?${new URLSearchParams({ [key]: value })}`;
}

function returnPath(value: FormDataEntryValue | null) {
  const path = String(value ?? "");
  return path === "/library" || /^\/articles\/[a-z0-9-]+$/i.test(path) || /^\/discussions\/[0-9a-f-]+$/i.test(path)
    ? path : "/community/topics";
}

export async function saveArticleAction(formData: FormData) {
  const id = String(formData.get("article_id") ?? "");
  const path = returnPath(formData.get("return_to"));
  const remove = formData.get("operation") === "remove";
  if (!uuid.test(id)) redirect(messageUrl(path, "error", "invalid"));
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(messageUrl(path, "error", "failed"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!remove) {
    const slug = path.startsWith("/articles/") ? path.slice("/articles/".length) : "";
    if (!slug || (await getArticleBySlug(slug))?.id !== id) redirect(messageUrl(path, "error", "invalid"));
  }
  const result = remove
    ? await supabase.from("saved_articles").delete().eq("user_id", user.id).eq("article_id", id)
    : await supabase.from("saved_articles").upsert({ user_id: user.id, article_id: id }, { onConflict: "user_id,article_id", ignoreDuplicates: true });
  if (result.error) {
    console.error("Could not update saved article", result.error.code);
    redirect(messageUrl(path, "error", "failed"));
  }
  revalidatePath("/library");
  revalidatePath(path);
  redirect(path);
}

export async function createDiscussionAction(formData: FormData) {
  const topic = String(formData.get("topic") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!topics.has(topic) || !title || title.length > 140 || !content || content.length > 3000) {
    redirect(messageUrl("/discussions/new", "error", "invalid"));
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(messageUrl("/discussions/new", "error", "failed"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.from("discussion_posts")
    .insert({ topic, title, content, author_id: user.id }).select("id").single();
  if (error || !data) {
    console.error("Could not create discussion", error?.code);
    redirect(messageUrl("/discussions/new", "error", "failed"));
  }
  revalidatePath("/community/topics");
  redirect(messageUrl(`/discussions/${data.id}`, "notice", "posted"));
}

export async function addDiscussionReplyAction(formData: FormData) {
  const id = String(formData.get("post_id") ?? "");
  const parent = String(formData.get("parent_id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!uuid.test(id)) redirect(messageUrl("/community/topics", "error", "invalid"));
  const path = `/discussions/${id}`;
  if ((parent && !uuid.test(parent)) || !content || content.length > 3000) redirect(messageUrl(path, "error", "invalid"));
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(messageUrl(path, "error", "failed"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("discussion_replies")
    .insert({ post_id: id, parent_id: parent || null, author_id: user.id, content });
  if (error) {
    console.error("Could not add discussion reply", error.code);
    redirect(messageUrl(path, "error", "failed"));
  }
  revalidatePath(path);
  revalidatePath("/community/topics");
  redirect(messageUrl(path, "notice", "reply"));
}

export async function voteDiscussionAction(formData: FormData) {
  const id = String(formData.get("post_id") ?? "");
  const vote = Number(formData.get("vote"));
  if (!uuid.test(id) || ![-1, 1].includes(vote)) redirect(messageUrl("/community/topics", "error", "invalid"));
  const path = `/discussions/${id}`;
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(messageUrl(path, "error", "failed"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: existing, error: readError } = await supabase.from("discussion_votes")
    .select("vote_type").eq("post_id", id).eq("user_id", user.id).maybeSingle();
  if (readError) {
    console.error("Could not read discussion vote", readError.code);
    redirect(messageUrl(path, "error", "failed"));
  }
  const result = existing?.vote_type === vote
    ? await supabase.from("discussion_votes").delete().eq("post_id", id).eq("user_id", user.id)
    : await supabase.from("discussion_votes").upsert({ post_id: id, user_id: user.id, vote_type: vote }, { onConflict: "post_id,user_id" });
  if (result.error) {
    console.error("Could not update discussion vote", result.error.code);
    redirect(messageUrl(path, "error", "failed"));
  }
  revalidatePath(path);
  revalidatePath("/community/topics");
  redirect(path);
}

export async function reportCommunityContentAction(formData: FormData) {
  const type = String(formData.get("target_type") ?? "");
  const id = String(formData.get("target_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const path = returnPath(formData.get("return_to"));
  if (!["article", "discussion", "reply"].includes(type) || !uuid.test(id) || reason.length < 5 || reason.length > 500) {
    redirect(messageUrl(path, "error", "invalid"));
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(messageUrl(path, "error", "failed"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (type === "article") {
    const slug = path.startsWith("/articles/") ? path.slice("/articles/".length) : "";
    if (!slug || (await getArticleBySlug(slug))?.id !== id) redirect(messageUrl(path, "error", "invalid"));
  } else {
    const table = type === "discussion" ? "discussion_posts" : "discussion_replies";
    const { data, error } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
    if (error) {
      console.error("Could not check reported content", error.code);
      redirect(messageUrl(path, "error", "failed"));
    }
    if (!data) redirect(messageUrl(path, "error", "invalid"));
  }
  const { error } = await supabase.from("community_reports")
    .insert({ reporter_id: user.id, target_type: type, target_id: id, reason });
  if (error) {
    console.error("Could not submit report", error.code);
    redirect(messageUrl(path, "error", "failed"));
  }
  redirect(messageUrl(path, "notice", "reported"));
}
