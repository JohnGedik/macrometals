import "server-only";

import { getCommodityConfiguration } from "@/lib/commodity-config";
import { scoreCommodity, type CommodityConfiguration } from "@/lib/commodity-score";
import { getCommodityHeaderData, loadCommodityIndicators } from "@/lib/indicators";
import type { ModelWeights } from "@/lib/metal-model";
import {
  calculateSnapshotScore,
  classifyPerformanceSignal,
  scoringEngineVersion,
  type SnapshotIndicatorContribution,
} from "@/lib/model-performance-rules";

type ActiveModel = {
  model_id: string;
  model_name: string;
  metal: string;
  indicator_weights: unknown;
  model_version: number;
  user_id: string | null;
};

type SnapshotResult = {
  modelId: string;
  modelName: string;
  metal: string;
  created: boolean;
  score: number | null;
  signal: string | null;
};

function isWeights(value: unknown, indicatorIds: readonly string[]): value is ModelWeights {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const weights = value as Record<string, unknown>;
  return Object.keys(weights).length === indicatorIds.length && indicatorIds.every((id) =>
    typeof weights[id] === "number" && Number.isInteger(weights[id]) && Number(weights[id]) >= 0)
    && Object.values(weights).reduce<number>((total, weight) => total + Number(weight), 0) === 100;
}

async function captureSnapshot(
  admin: Awaited<ReturnType<typeof createPerformanceAdminClient>>,
  model: ActiveModel,
  snapshotDate: string,
  assetPrice: number | null,
  score: number | null,
  signal: string | null,
  weights: ModelWeights,
  contributions: SnapshotIndicatorContribution[],
): Promise<SnapshotResult> {
  const { data, error } = await admin.rpc("capture_model_snapshot", {
    p_model_id: model.model_id,
    p_snapshot_date: snapshotDate,
    p_model_version: model.model_version,
    p_scoring_engine_version: scoringEngineVersion,
    p_score: score,
    p_signal: signal,
    p_asset_price: assetPrice,
    p_weights_used: weights,
    p_contributions: contributions,
  });
  if (error || !data || typeof data !== "object" || !("created" in data)) {
    throw new Error(`Could not capture model snapshot ${model.model_name}: ${error?.code ?? "invalid response"}`);
  }
  return {
    modelId: model.model_id,
    modelName: model.model_name,
    metal: model.metal,
    created: data.created === true,
    score,
    signal,
  };
}

export async function createPerformanceAdminClient() {
  const { createAdminClient } = await import("@supabase/server/core");
  return createAdminClient();
}

async function loadMetalInputs(config: CommodityConfiguration) {
  const [model, header] = await Promise.all([
    loadCommodityIndicators({ ...config, contextProvider: undefined }, "en").model,
    getCommodityHeaderData(config),
  ]);
  return {
    config: model.config,
    systemScore: scoreCommodity(model.config),
    price: header.price,
  };
}

export async function captureDailyModelSnapshots(snapshotDate = new Date().toISOString().slice(0, 10)) {
  const admin = await createPerformanceAdminClient();
  const { data: models, error } = await admin
    .from("models")
    .select("model_id, model_name, metal, indicator_weights, model_version, user_id")
    .eq("active", true)
    .order("metal")
    .order("model_name")
    .returns<ActiveModel[]>();
  if (error) throw new Error(`Could not load active performance models: ${error.code}`);
  if (!models?.length) throw new Error("No active performance models are registered");

  const metals = [...new Set(models.map((model) => model.metal))];
  const configs = new Map<string, CommodityConfiguration>();
  for (const metal of metals) {
    const config = getCommodityConfiguration(metal);
    if (!config) throw new Error(`Unknown performance metal: ${metal}`);
    configs.set(metal, config);
  }
  const inputs = new Map(await Promise.all(metals.map(async (metal) =>
    [metal, await loadMetalInputs(configs.get(metal)!)] as const)));

  const results: SnapshotResult[] = [];
  for (const model of models) {
    const input = inputs.get(model.metal)!;
    const indicatorIds = input.config.indicators.map(({ id }) => id);
    if (!isWeights(model.indicator_weights, indicatorIds) ||
        !Number.isInteger(model.model_version) || model.model_version < 1) {
      throw new Error(`Invalid active model definition ${model.model_name}`);
    }
    const systemModel = model.user_id === null;
    const publishable = systemModel ? input.systemScore.publishable : true;
    const snapshotScore = calculateSnapshotScore(
      input.systemScore.indicators,
      model.indicator_weights,
      input.config.scoreRules.baseline,
      systemModel && !publishable,
    );
    const score = systemModel && !publishable ? null : snapshotScore.score;
    results.push(await captureSnapshot(
      admin,
      model,
      snapshotDate,
      input.price,
      score,
      classifyPerformanceSignal(score),
      model.indicator_weights,
      snapshotScore.contributions,
    ));
  }
  return results;
}

export async function evaluateDueModelPerformance(snapshotDate = new Date().toISOString().slice(0, 10)) {
  const admin = await createPerformanceAdminClient();
  const { data, error } = await admin.rpc("evaluate_model_performance", { p_as_of: snapshotDate });
  if (error || typeof data !== "number") {
    throw new Error(`Could not evaluate model performance: ${error?.code ?? "invalid response"}`);
  }
  return data;
}
