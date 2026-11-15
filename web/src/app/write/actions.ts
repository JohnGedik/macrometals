"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";

const allowedLanguages = new Set(["en", "tr"]);
const tagSlug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function articleSlug(value: string) {
  return tagSlug(value).slice(0, 100) || "community-article";
}

export async function saveArticleAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    console.error("Article publishing is not configured");
    return { error: "save" as const };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth" as const };

  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const content = String(formData.get("content_markdown") ?? "").trim();
  const categorySlug = String(formData.get("category") ?? "");
  const language = String(formData.get("language") ?? "en");
  const image = String(formData.get("featured_image") ?? "").trim();
  const tags = [...new Set(String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
  const articleId = String(formData.get("article_id") ?? "");
  const intent = String(formData.get("intent") ?? "draft");
  const published = intent === "publish";

  if (!title || title.length > 140 || !summary || summary.length > 300 || !content || content.length > 100000 || !allowedLanguages.has(language) || tags.some((tag) => tag.length > 40)) {
    return { error: "invalid" as const };
  }
  if (image && (!/^https?:\/\//i.test(image) || image.length > 2048)) return { error: "invalid" as const };

  if (!await ensureProfile(supabase, user.id)) return { error: "profile" as const };

  let slug = articleSlug(title);
  const suffix = user.id.slice(0, 6);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: collision, error } = await supabase.from("articles").select("id").eq("slug", slug).maybeSingle();
    if (error) {
      console.error("Could not check article slug", error.code);
      return { error: "save" as const };
    }
    if (!collision || collision.id === articleId) break;
    slug = `${articleSlug(title).slice(0, 92)}-${suffix}${attempt ? `-${attempt}` : ""}`;
  }

  const { data: category, error: categoryError } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
  if (categoryError) {
    console.error("Could not load article category", categoryError.code);
    return { error: "save" as const };
  }
  if (!category) return { error: "invalid" as const };

  const values = {
    author_id: user.id,
    slug,
    title,
    summary,
    body: content,
    content_markdown: content,
    content_html: null,
    cover_image: image || null,
    featured_image: image || null,
    language,
    category_id: category.id,
    published,
    published_at: published ? new Date().toISOString() : null,
  };

  let savedId = articleId;
  if (articleId) {
    const { data, error } = await supabase.from("articles").update(values).eq("id", articleId).eq("author_id", user.id).select("id").maybeSingle();
    if (error || !data) {
      console.error("Could not update article", error?.code);
      return { error: "save" as const };
    }
    savedId = data.id;
  } else {
    const { data, error } = await supabase.from("articles").insert(values).select("id").single();
    if (error || !data) {
      console.error("Could not create article", error?.code);
      return { error: "save" as const };
    }
    savedId = data.id;
  }

  await supabase.from("article_tags").delete().eq("article_id", savedId);
  const tagSlugs = tags.map(tagSlug).filter(Boolean);
  if (tagSlugs.length) {
    const { data: existingTags } = await supabase.from("tags").select("id, slug").in("slug", tagSlugs);
    const existing = existingTags ?? [];
    const existingSlugs = new Set(existing.map((tag) => tag.slug));
    const missingTags = tags.flatMap((name) => {
      const tag = tagSlug(name);
      return tag && !existingSlugs.has(tag) ? [{ name, slug: tag }] : [];
    });
    if (missingTags.length) await supabase.from("tags").insert(missingTags);
    const { data: allTags } = await supabase.from("tags").select("id").in("slug", tagSlugs);
    if (allTags?.length) await supabase.from("article_tags").insert(allTags.map((tag) => ({ article_id: savedId, tag_id: tag.id })));
  }

  revalidatePath("/");
  revalidatePath("/community");
  revalidatePath("/profile");
  revalidatePath(`/articles/${slug}`);
  return { redirectTo: published ? `/articles/${slug}` : `/write/${slug}?saved=1` };
}

export async function deleteArticleAction(formData: FormData) {
  const articleId = String(formData.get("article_id") ?? "");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !articleId) redirect("/profile");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("articles").delete().eq("id", articleId).eq("author_id", user.id);
  if (error) redirect("/profile?error=delete");
  revalidatePath("/");
  revalidatePath("/community");
  revalidatePath("/profile");
  redirect("/profile?deleted=1");
}
