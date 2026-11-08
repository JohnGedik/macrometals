"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messages } from "@/lib/i18n";

export async function saveProfileAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=Supabase+is+not+configured");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const locale = formData.get("locale") === "tr" ? "tr" : "en";
  const t = messages[locale].profile;
  const avatar = formData.get("avatar");

  if (!displayName || displayName.length > 80 || bio.length > 500) {
    redirect(`/profile?error=${encodeURIComponent(t.invalidFields)}`);
  }

  let avatarUrl: string | null = null;
  if (avatar instanceof File && avatar.size > 0) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(avatar.type) || avatar.size > 5 * 1024 * 1024) {
      redirect(`/profile?error=${encodeURIComponent(t.invalidAvatar)}`);
    }

    const extension = avatar.type === "image/png" ? "png" : avatar.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatar, { contentType: avatar.type, cacheControl: "3600" });
    if (uploadError) redirect(`/profile?error=${encodeURIComponent(t.uploadFailed)}`);
    avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  const values = { display_name: displayName, bio };
  const result = avatarUrl
    ? await supabase.from("profiles").update({ ...values, avatar_url: avatarUrl }).eq("id", user.id)
    : await supabase.from("profiles").update(values).eq("id", user.id);

  if (result.error) redirect(`/profile?error=${encodeURIComponent(t.saveError)}`);
  redirect("/profile?saved=1");
}