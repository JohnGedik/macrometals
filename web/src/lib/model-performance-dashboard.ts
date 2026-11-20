import "server-only";

import type { DashboardModel } from "@/lib/metal-model-default";
import type { MetalModelCommodity } from "@/lib/metal-model";
import { createPerformanceAdminClient } from "@/lib/model-performance";

export const performanceHorizons = [7, 30, 90, 180] as const;

export type ModelPerformanceHorizon = {
  horizon_days: typeof performanceHorizons[number];
  total_predictions: number;
  correct_predictions: number;
  accuracy_percentage: number | null;
  average_forward_return: number | null;
  average_return_after_bullish_signals: number | null;
  average_return_after_bearish_signals: number | null;
};

export type ModelPerformanceDashboard = {
  system: ModelPerformanceHorizon[];
  personal: Record<string, ModelPerformanceHorizon[]>;
};

type PerformanceRow = Omit<ModelPerformanceHorizon, "horizon_days"> & { model_id: string; horizon_days: number };
type RegisteredModel = { model_id: string };

export function emptyPerformanceHorizons(): ModelPerformanceHorizon[] {
  return performanceHorizons.map((horizon_days) => ({
    horizon_days,
    total_predictions: 0,
    correct_predictions: 0,
    accuracy_percentage: null,
    average_forward_return: null,
    average_return_after_bullish_signals: null,
    average_return_after_bearish_signals: null,
  }));
}

function emptyDashboard(): ModelPerformanceDashboard {
  return { system: emptyPerformanceHorizons(), personal: {} };
}

function groupPerformance(rows: PerformanceRow[]): Record<string, ModelPerformanceHorizon[]> {
  const grouped = new Map<string, Map<number, ModelPerformanceHorizon>>();
  for (const row of rows) {
    if (!performanceHorizons.some((horizon) => horizon === row.horizon_days)) continue;
    const metrics = grouped.get(row.model_id) ?? new Map<number, ModelPerformanceHorizon>();
    metrics.set(row.horizon_days, {
      horizon_days: row.horizon_days as ModelPerformanceHorizon["horizon_days"],
      total_predictions: row.total_predictions,
      correct_predictions: row.correct_predictions,
      accuracy_percentage: row.accuracy_percentage,
      average_forward_return: row.average_forward_return,
      average_return_after_bullish_signals: row.average_return_after_bullish_signals,
      average_return_after_bearish_signals: row.average_return_after_bearish_signals,
    });
    grouped.set(row.model_id, metrics);
  }
  return Object.fromEntries([...grouped].map(([modelId, metrics]) => [
    modelId,
    performanceHorizons.map((horizon) => metrics.get(horizon) ?? emptyPerformanceHorizons().find((item) =>
      item.horizon_days === horizon)!),
  ]));
}

export async function getDashboardModelPerformance(
  commodity: MetalModelCommodity,
  dashboardModel: Promise<DashboardModel>,
): Promise<ModelPerformanceDashboard> {
  const fallback = emptyDashboard();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("Model performance metrics are unavailable because the admin Supabase environment is not configured");
    return fallback;
  }

  try {
    const [admin, model] = await Promise.all([createPerformanceAdminClient(), dashboardModel]);
    const { data: systemModel, error: systemError } = await admin
      .from("models")
      .select("model_id")
      .eq("metal", commodity)
      .eq("active", true)
      .is("user_id", null)
      .limit(1)
      .maybeSingle<RegisteredModel>();
    if (systemError || !systemModel) {
      console.error("Could not load the system model performance registry", systemError?.code ?? "missing system model");
      return fallback;
    }

    const personalIds = model.status === "ready" ? model.models.map(({ id }) => id) : [];
    const ids = [systemModel.model_id, ...personalIds];
    const { data, error } = await admin
      .from("model_performance_metrics")
      .select("model_id,horizon_days,total_predictions,correct_predictions,accuracy_percentage,average_forward_return,average_return_after_bullish_signals,average_return_after_bearish_signals")
      .in("model_id", ids)
      .returns<PerformanceRow[]>();
    if (error) {
      console.error("Could not load model performance metrics", error.code);
      return fallback;
    }

    const grouped = groupPerformance(data ?? []);
    return {
      system: grouped[systemModel.model_id] ?? emptyPerformanceHorizons(),
      personal: Object.fromEntries(personalIds.map((id) => [id, grouped[id] ?? emptyPerformanceHorizons()])),
    };
  } catch (error) {
    console.error("Model performance dashboard failed", error instanceof Error ? error.message : "Unknown error");
    return fallback;
  }
}
