"use server";

import { revalidatePath } from "next/cache";
import { getCommodityConfiguration } from "@/lib/commodity-config";
import { isMetalModelCommodity, validModelWeights, type ModelWeights, type SavedMetalModel } from "@/lib/metal-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ModelCommand =
  | { kind: "create"; name: string; weights: ModelWeights }
  | { kind: "save"; id: string; revision: number; name: string; weights: ModelWeights }
  | { kind: "delete"; id: string; revision: number }
  | { kind: "default"; id: string };
type Result = { ok: true; model?: SavedMetalModel } | { ok: false; error: "auth" | "invalid" | "duplicate" | "conflict" | "failed" };

export async function changeMetalModel(commodity: string, command: ModelCommand): Promise<Result> {
  const config = isMetalModelCommodity(commodity) ? getCommodityConfiguration(commodity) : undefined;
  if (!config || !command || !["create", "save", "delete", "default"].includes(command.kind)) return { ok: false, error: "invalid" };
  if (command.kind !== "create" && (typeof command.id !== "string" ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(command.id))) return { ok: false, error: "invalid" };
  if ((command.kind === "save" || command.kind === "delete") &&
      (!Number.isSafeInteger(command.revision) || command.revision < 1 || command.revision > 2147483647)) return { ok: false, error: "invalid" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "failed" };
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) return { ok: false, error: "auth" };

  const owner = { user_id: user.id, commodity };
  if (command.kind === "create" || command.kind === "save") {
    const name = typeof command.name === "string" ? command.name.trim() : "";
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name) ||
        !validModelWeights(command.weights, config.indicators.map(({ id }) => id))) return { ok: false, error: "invalid" };
    const fields = { name, weights: command.weights };
    const query = command.kind === "create"
      ? supabase.from("metal_models").insert({ ...owner, ...fields })
      : supabase.from("metal_models").update(fields).match({ ...owner, id: command.id, revision: command.revision });
    const { data, error } = await query.select("id, name, weights, definition_version, revision").maybeSingle<SavedMetalModel>();
    if (error?.code === "23505") return { ok: false, error: "duplicate" };
    if (error) {
      console.error("Could not save metal model", error.code);
      return { ok: false, error: "failed" };
    }
    if (!data) return { ok: false, error: "conflict" };
    if (command.kind === "save") revalidatePath(`/tag/${commodity}`);
    return { ok: true, model: data };
  }

  if (command.kind === "default") {
    const { error } = await supabase.from("metal_model_defaults").upsert(
      { ...owner, model_id: command.id }, { onConflict: "user_id,commodity" },
    );
    if (error?.code === "23503") return { ok: false, error: "conflict" };
    if (error) {
      console.error("Could not set default metal model", error.code);
      return { ok: false, error: "failed" };
    }
    revalidatePath(`/tag/${commodity}`);
    return { ok: true };
  }

  const { data, error } = await supabase.from("metal_models").delete()
    .match({ ...owner, id: command.id, revision: command.revision }).select("id").maybeSingle();
  if (error) {
    console.error("Could not delete metal model", error.code);
    return { ok: false, error: "failed" };
  }
  if (!data) return { ok: false, error: "conflict" };
  revalidatePath(`/tag/${commodity}`);
  return { ok: true };
}
