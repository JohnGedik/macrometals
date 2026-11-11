"use client";

import { useSyncExternalStore } from "react";
import type { ChangePeriod } from "@/lib/commodity-changes";

type PreferenceValues = { "driver-tab": "drivers" | "changes"; "change-period": ChangePeriod };
type PreferenceKey = keyof PreferenceValues;
const defaults: PreferenceValues = { "driver-tab": "drivers", "change-period": "monthly" };
const choices = { "driver-tab": ["drivers", "changes"], "change-period": ["monthly", "quarterly", "yoy"] } as const;
const prefix = "macro-metals.dashboard.";
const changeEvent = "macro-metals-dashboard-preference";
const memory = new Map<PreferenceKey, string>();

export function normalizeDashboardPreference<Key extends PreferenceKey>(key: Key, value: string | null): PreferenceValues[Key] {
  const allowed: readonly string[] = choices[key];
  return (value !== null && allowed.includes(value) ? value : defaults[key]) as PreferenceValues[Key];
}

export function readDashboardPreference<Key extends PreferenceKey>(key: Key): PreferenceValues[Key] {
  if (typeof window === "undefined") return defaults[key];
  const saved = memory.get(key);
  if (saved !== undefined) return normalizeDashboardPreference(key, saved);
  try { return normalizeDashboardPreference(key, window.localStorage.getItem(`${prefix}${key}`)); }
  catch { return defaults[key]; }
}

export function writeDashboardPreference<Key extends PreferenceKey>(key: Key, value: PreferenceValues[Key]) {
  if (typeof window === "undefined") return;
  const validated = normalizeDashboardPreference(key, value);
  memory.set(key, validated);
  try { window.localStorage.setItem(`${prefix}${key}`, validated); } catch {}
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    memory.clear();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, onChange);
  };
}

export function useDashboardPreference<Key extends PreferenceKey>(key: Key) {
  const value = useSyncExternalStore(subscribe, () => readDashboardPreference(key), () => defaults[key]);
  return [value, (next: PreferenceValues[Key]) => writeDashboardPreference(key, next)] as const;
}