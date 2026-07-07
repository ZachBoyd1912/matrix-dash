import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { settings } from "./schema";
import { SETTING_DEFAULTS, type AppSettings } from "@/types/settings";

export function getSetting(key: string): string | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? SETTING_DEFAULTS[key] ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().select().from(settings).all();
  const result: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

function parseFallbackIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function getAppSettings(): AppSettings {
  const all = getAllSettings();
  return {
    autoExtract: all.autoExtract !== "0",
    autoInject: all.autoInject !== "0",
    maxInjectedMemories: Math.max(1, parseInt(all.maxInjectedMemories, 10) || 10),
    systemPrompt: all.systemPrompt ?? "",
    enableThinking: all.enableThinking !== "0",
    fallbackProviderIds: parseFallbackIds(all.fallbackProviderIds),
  };
}
