"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function recordArticleViewAction(articleId: string) {
  if (!articleId) return;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  await supabase.rpc("increment_article_view", { target_article_id: articleId });
}

export async function voteOnArticleAction(formData: FormData) {
  const articleId = String(formData.get("article_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const requestedVote = Number(formData.get("vote_type"));
  if (!articleId || !slug || ![-1, 0, 1].includes(requestedVote)) return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("article_votes")
    .select("vote_type")
    .eq("article_id", articleId)
    .eq("user_id", user.id)
    .maybeSingle();

  const result = requestedVote === 0 || existing?.vote_type === requestedVote
    ? await supabase.from("article_votes").delete().eq("article_id", articleId).eq("user_id", user.id)
    : await supabase.from("article_votes").upsert(
        { article_id: articleId, user_id: user.id, vote_type: requestedVote },
        { onConflict: "article_id,user_id" },
      );
  if (result.error) return;

  revalidatePath(`/articles/${slug}`);
  revalidatePath("/community");
  revalidatePath("/");
}
