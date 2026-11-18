import "server-only";

import { validModelWeights, type MetalModelCommodity, type ModelWeights } from "@/lib/metal-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardModel =
  | { status: "signed-out" | "no-default" | "unavailable" }
  | { status: "ready"; models: { id: string; name: string; weights: ModelWeights }[]; defaultId: string };

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
    .select("model_id")
    .match({ user_id: user.id, commodity })
    .maybeSingle<{ model_id: string }>();
  if (error) {
    console.error("Could not load default dashboard metal model", error.code);
    return { status: "unavailable" };
  }
  if (!data) return { status: "no-default" };

  const { data: models, error: modelsError } = await supabase.from("metal_models")
    .select("id, name, weights, definition_version")
    .match({ user_id: user.id, commodity })
    .order("name")
    .returns<{ id: string; name: unknown; weights: unknown; definition_version: number }[]>();
  if (modelsError) {
    console.error("Could not load dashboard metal models", modelsError.code);
    return { status: "unavailable" };
  }
  if (!models?.some(({ id }) => id === data.model_id) || models.some((model) =>
    model.definition_version !== 1 || typeof model.name !== "string" || !validModelWeights(model.weights, indicatorIds))) {
    console.error("Invalid default dashboard metal model definition", commodity);
    return { status: "unavailable" };
  }
  return {
    status: "ready",
    models: models.map(({ id, name, weights }) => ({ id, name: name as string, weights: weights as ModelWeights })),
    defaultId: data.model_id,
  };
}
