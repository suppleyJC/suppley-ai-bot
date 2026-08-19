/**
 * usageDb — medição de tokens/custo de LLM.
 * Grava por chamada (fire-and-forget) e agrega custo estimado por modelo.
 */
import { gte, sql } from "drizzle-orm";
import { llmUsage, type InsertLlmUsage } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function recordLlmUsage(data: InsertLlmUsage): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(llmUsage).values(data);
}

/** Preço por 1M tokens (USD): [input, output]. Cache read ~0,1x input; write ~1,25x. */
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
function priceFor(model: string) {
  const key = Object.keys(PRICE).find((k) => model.startsWith(k));
  return key ? PRICE[key] : { in: 5, out: 25 }; // fallback Opus-tier
}

export interface UsageSummaryRow {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  estCostUsd: number;
}
export interface UsageSummary {
  periodDays: number;
  totalCalls: number;
  totalEstCostUsd: number;
  avgCostPerCallUsd: number;
  byModel: UsageSummaryRow[];
}

export async function getLlmUsageSummary(days = 30): Promise<UsageSummary> {
  const db = await getDb();
  if (!db) return { periodDays: days, totalCalls: 0, totalEstCostUsd: 0, avgCostPerCallUsd: 0, byModel: [] };

  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      model: llmUsage.model,
      calls: sql<number>`COUNT(*)`,
      promptTokens: sql<number>`COALESCE(SUM(${llmUsage.promptTokens}),0)`,
      completionTokens: sql<number>`COALESCE(SUM(${llmUsage.completionTokens}),0)`,
      cacheCreationTokens: sql<number>`COALESCE(SUM(${llmUsage.cacheCreationTokens}),0)`,
      cacheReadTokens: sql<number>`COALESCE(SUM(${llmUsage.cacheReadTokens}),0)`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, since))
    .groupBy(llmUsage.model);

  const byModel: UsageSummaryRow[] = rows.map((r) => {
    const p = priceFor(r.model);
    const estCostUsd =
      (Number(r.promptTokens) * p.in +
        Number(r.cacheCreationTokens) * p.in * 1.25 +
        Number(r.cacheReadTokens) * p.in * 0.1 +
        Number(r.completionTokens) * p.out) / 1_000_000;
    return {
      model: r.model,
      calls: Number(r.calls),
      promptTokens: Number(r.promptTokens),
      completionTokens: Number(r.completionTokens),
      cacheCreationTokens: Number(r.cacheCreationTokens),
      cacheReadTokens: Number(r.cacheReadTokens),
      estCostUsd,
    };
  });

  const totalCalls = byModel.reduce((a, m) => a + m.calls, 0);
  const totalEstCostUsd = byModel.reduce((a, m) => a + m.estCostUsd, 0);
  return {
    periodDays: days,
    totalCalls,
    totalEstCostUsd,
    avgCostPerCallUsd: totalCalls > 0 ? totalEstCostUsd / totalCalls : 0,
    byModel: byModel.sort((a, b) => b.estCostUsd - a.estCostUsd),
  };
}
