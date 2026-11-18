import "server-only";

import { validModelWeights, type MetalModelCommodity, type ModelWeights } from "@/lib/metal-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardModel =
  | { status: "signed-out" | "no-default" | "unavailable" }
  | { status: "ready"; name: string; weights: ModelWeights };

export async function getDashboardModel(commodity: MetalModelCommodity, indicatorIds: readonly string[]): Promise<DashboardModel> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "unavailable" };
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError?.name === "AuthSessionMissingError") return { status: "signed-out" };
  if (authError) {
    console.error("Could not verify session for dashboard metal model", authError.code ?? authError.name);
    return { status: "unavailable" };
  }
  if (!user) return { status: "signed-out" };

  const { data, error } = await supabase.from("metal_model_defaults")
    .select("metal_models!inner(name, weights, definition_version)")
    .match({ user_id: user.id, commodity })
    .maybeSingle<{ metal_models: { name: string; weights: unknown; definition_version: number } }>();
  if (error) {
    console.error("Could not load default dashboard metal model", error.code);
    return { status: "unavailable" };
  }
  if (!data) return { status: "no-default" };

  const model = data.metal_models;
  if (model?.definition_version !== 1 || typeof model.name !== "string" || !validModelWeights(model.weights, indicatorIds)) {
    console.error("Invalid default dashboard metal model definition", commodity);
    return { status: "unavailable" };
  }
  return { status: "ready", name: model.name, weights: model.weights };
}
