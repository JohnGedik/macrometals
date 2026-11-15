import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Discussion = {
  id: string;
  topic: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  author: string;
  score: number;
  replyCount: number;
  userVote: number;
};

export async function getDiscussions(topic = "all", sort = "latest"): Promise<Discussion[] | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    console.error("Discussions are not configured");
    return null;
  }
  const { data: posts, error } = await supabase.rpc("get_discussion_feed", { feed_topic: topic, feed_sort: sort });
  if (error) {
    console.error("Could not load discussions", error.code);
    return null;
  }
  return (posts ?? []).map((post: Discussion & { reply_count: number; user_vote: number }): Discussion => ({
    ...post, score: Number(post.score), replyCount: Number(post.reply_count), userVote: Number(post.user_vote),
  }));
}
