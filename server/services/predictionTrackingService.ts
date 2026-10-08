/**
 * Prediction Tracking Service
 * 
 * Armazena previsões geradas pela IA e compara com resultados reais
 * para medir a acurácia do sistema ao longo do tempo.
 */

import { getDb } from "../db";
import { predictiveAnalysisResults } from "../../drizzle/schema";
import { eq, desc, isNull, lte, and } from "drizzle-orm";
import { getExchangeRate } from "./exchangeService";
import { getCurrentCommodityPrice } from "./commodityService";

// ============================================================
// INTERFACES
// ============================================================

export interface PredictionRecord {
  id: number;
  analysisType: string;
  indicator: string;
  currentValue: number;
  predictedValue: number;
  actualValue: number | null;
  confidence: number;
  timeframeDays: number;
  direction: "up" | "down" | "stable";
  predictionDate: Date;
  targetDate: Date;
  wasAccurate: boolean | null;
  accuracyScore: number | null;
}

export interface PredictionAccuracyReport {
  totalPredictions: number;
  evaluatedPredictions: number;
  pendingPredictions: number;
  overallAccuracy: number; // 0-100
  averageConfidence: number;
  byIndicator: Record<string, {
    total: number;
    accurate: number;
    accuracy: number;
    avgConfidence: number;
  }>;
  byDirection: Record<string, {
    total: number;
    accurate: number;
    accuracy: number;
  }>;
  recentPredictions: PredictionRecord[];
}

// ============================================================
// SALVAR PREVISÕES
// ============================================================

/**
 * Salva previsões geradas pela análise sistêmica
 */
export async function savePredictions(
  predictions: Array<{
    indicator: string;
    currentValue: number;
    predictedValue: number;
    confidence: number;
    timeframe: string;
    direction: "up" | "down" | "stable";
  }>,
  analysisType: string = "systemic",
  userId?: number,
  fullAnalysisJson?: string
): Promise<{ saved: number; errors: number }> {
  const db = await getDb();
  if (!db) return { saved: 0, errors: 0 };

  let saved = 0;
  let errors = 0;

  for (const prediction of predictions) {
    try {
      // Parse timeframe (ex: "30 dias", "60 dias", "90 dias")
      const daysMatch = prediction.timeframe.match(/(\d+)/);
      const timeframeDays = daysMatch ? parseInt(daysMatch[1]) : 30;

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + timeframeDays);

      await db.insert(predictiveAnalysisResults).values({
        userId: userId || null,
        analysisType,
        indicator: prediction.indicator,
        currentValue: Math.round(prediction.currentValue * 100),
        predictedValue: Math.round(prediction.predictedValue * 100),
        confidence: prediction.confidence,
        timeframeDays,
        direction: prediction.direction,
        targetDate,
        fullAnalysis: fullAnalysisJson || null,
      });

      saved++;
    } catch (error) {
      console.error(`[PredictionTracking] Error saving prediction for ${prediction.indicator}:`, error);
      errors++;
    }
  }

  return { saved, errors };
}

// ============================================================
// AVALIAR PREVISÕES
// ============================================================

/**
 * Busca valor real atual para um indicador
 */
async function fetchActualValue(indicator: string): Promise<number | null> {
  const indicatorLower = indicator.toLowerCase();

  // Câmbio
  if (indicatorLower.includes("usd/brl") || indicatorLower.includes("dólar") || indicatorLower.includes("câmbio")) {
    try {
      const rate = await getExchangeRate("USD", "BRL");
      return rate.rate;
    } catch { return null; }
  }

  if (indicatorLower.includes("eur/brl") || indicatorLower.includes("euro")) {
    try {
      const rate = await getExchangeRate("EUR", "BRL");
      return rate.rate;
    } catch { return null; }
  }

  // Commodities
  if (indicatorLower.includes("aço") || indicatorLower.includes("steel")) {
    const data = await getCurrentCommodityPrice("STEEL_HRC");
    return data ? data.price / 100 : null;
  }

  if (indicatorLower.includes("alumínio") || indicatorLower.includes("aluminum")) {
    const data = await getCurrentCommodityPrice("ALUMINUM_LME");
    return data ? data.price / 100 : null;
  }

  if (indicatorLower.includes("cobre") || indicatorLower.includes("copper")) {
    const data = await getCurrentCommodityPrice("COPPER_LME");
    return data ? data.price / 100 : null;
  }

  if (indicatorLower.includes("petróleo") || indicatorLower.includes("brent")) {
    const data = await getCurrentCommodityPrice("BRENT_OIL");
    return data ? data.price / 100 : null;
  }

  return null;
}

/**
 * Avalia previsões que já atingiram a data alvo
 */
export async function evaluateExpiredPredictions(): Promise<{
  evaluated: number;
  accurate: number;
  inaccurate: number;
}> {
  const db = await getDb();
  if (!db) return { evaluated: 0, accurate: 0, inaccurate: 0 };

  let evaluated = 0;
  let accurate = 0;
  let inaccurate = 0;

  try {
    // Buscar previsões não avaliadas cuja data alvo já passou
    const pendingPredictions = await db
      .select()
      .from(predictiveAnalysisResults)
      .where(
        and(
          isNull(predictiveAnalysisResults.wasAccurate),
          lte(predictiveAnalysisResults.targetDate, new Date())
        )
      )
      .limit(50);

    for (const prediction of pendingPredictions) {
      const actualValue = await fetchActualValue(prediction.indicator);
      if (actualValue === null) continue;

      const actualValueCents = Math.round(actualValue * 100);
      const predictedValueCents = prediction.predictedValue;
      const currentValueCents = prediction.currentValue;

      // Calcular acurácia
      // Direção correta?
      const actualDirection = actualValueCents > currentValueCents ? "up" :
        actualValueCents < currentValueCents ? "down" : "stable";
      const directionCorrect = prediction.direction === actualDirection;

      // Proximidade do valor previsto (0-100)
      const predictedChange = Math.abs(predictedValueCents - currentValueCents);
      const actualChange = Math.abs(actualValueCents - currentValueCents);
      const maxChange = Math.max(predictedChange, actualChange, 1);
      const changeError = Math.abs(predictedChange - actualChange) / maxChange;
      const proximityScore = Math.max(0, Math.round((1 - changeError) * 100));

      // Score final: 60% direção + 40% proximidade
      const accuracyScore = Math.round(
        (directionCorrect ? 60 : 0) + (proximityScore * 0.4)
      );
      const wasAccurate = accuracyScore >= 50;

      // Atualizar no banco
      await db
        .update(predictiveAnalysisResults)
        .set({
          actualValue: actualValueCents,
          wasAccurate,
          accuracyScore,
        })
        .where(eq(predictiveAnalysisResults.id, prediction.id));

      evaluated++;
      if (wasAccurate) accurate++;
      else inaccurate++;
    }
  } catch (error) {
    console.error("[PredictionTracking] Error evaluating predictions:", error);
  }

  return { evaluated, accurate, inaccurate };
}

// ============================================================
// RELATÓRIO DE ACURÁCIA
// ============================================================

/**
 * Gera relatório de acurácia das previsões
 */
export async function getAccuracyReport(userId?: number): Promise<PredictionAccuracyReport> {
  const db = await getDb();
  if (!db) {
    return {
      totalPredictions: 0,
      evaluatedPredictions: 0,
      pendingPredictions: 0,
      overallAccuracy: 0,
      averageConfidence: 0,
      byIndicator: {},
      byDirection: {},
      recentPredictions: [],
    };
  }

  try {
    // Buscar todas as previsões
    const allPredictions = await db
      .select()
      .from(predictiveAnalysisResults)
      .orderBy(desc(predictiveAnalysisResults.predictionDate))
      .limit(200);

    const total = allPredictions.length;
    const evaluated = allPredictions.filter(p => p.wasAccurate !== null);
    const pending = allPredictions.filter(p => p.wasAccurate === null);

    // Calcular acurácia geral
    const accurateCount = evaluated.filter(p => p.wasAccurate === true).length;
    const overallAccuracy = evaluated.length > 0
      ? Math.round((accurateCount / evaluated.length) * 100)
      : 0;

    // Média de confiança
    const avgConfidence = total > 0
      ? Math.round(allPredictions.reduce((sum, p) => sum + p.confidence, 0) / total)
      : 0;

    // Por indicador
    const byIndicator: Record<string, { total: number; accurate: number; accuracy: number; avgConfidence: number }> = {};
    for (const p of allPredictions) {
      if (!byIndicator[p.indicator]) {
        byIndicator[p.indicator] = { total: 0, accurate: 0, accuracy: 0, avgConfidence: 0 };
      }
      byIndicator[p.indicator].total++;
      if (p.wasAccurate === true) byIndicator[p.indicator].accurate++;
      byIndicator[p.indicator].avgConfidence += p.confidence;
    }
    for (const key of Object.keys(byIndicator)) {
      const entry = byIndicator[key];
      entry.accuracy = entry.total > 0 ? Math.round((entry.accurate / entry.total) * 100) : 0;
      entry.avgConfidence = entry.total > 0 ? Math.round(entry.avgConfidence / entry.total) : 0;
    }

    // Por direção
    const byDirection: Record<string, { total: number; accurate: number; accuracy: number }> = {};
    for (const p of evaluated) {
      if (!byDirection[p.direction]) {
        byDirection[p.direction] = { total: 0, accurate: 0, accuracy: 0 };
      }
      byDirection[p.direction].total++;
      if (p.wasAccurate === true) byDirection[p.direction].accurate++;
    }
    for (const key of Object.keys(byDirection)) {
      const entry = byDirection[key];
      entry.accuracy = entry.total > 0 ? Math.round((entry.accurate / entry.total) * 100) : 0;
    }

    // Previsões recentes
    const recentPredictions: PredictionRecord[] = allPredictions.slice(0, 20).map(p => ({
      id: p.id,
      analysisType: p.analysisType,
      indicator: p.indicator,
      currentValue: p.currentValue / 100,
      predictedValue: p.predictedValue / 100,
      actualValue: p.actualValue !== null ? p.actualValue / 100 : null,
      confidence: p.confidence,
      timeframeDays: p.timeframeDays,
      direction: p.direction as "up" | "down" | "stable",
      predictionDate: p.predictionDate,
      targetDate: p.targetDate,
      wasAccurate: p.wasAccurate,
      accuracyScore: p.accuracyScore,
    }));

    return {
      totalPredictions: total,
      evaluatedPredictions: evaluated.length,
      pendingPredictions: pending.length,
      overallAccuracy,
      averageConfidence: avgConfidence,
      byIndicator,
      byDirection,
      recentPredictions,
    };
  } catch (error) {
    console.error("[PredictionTracking] Error generating report:", error);
    return {
      totalPredictions: 0,
      evaluatedPredictions: 0,
      pendingPredictions: 0,
      overallAccuracy: 0,
      averageConfidence: 0,
      byIndicator: {},
      byDirection: {},
      recentPredictions: [],
    };
  }
}

// ============================================================
// HISTÓRICO DE PREVISÕES
// ============================================================

/**
 * Obtém histórico de previsões para um indicador específico
 */
export async function getPredictionHistory(
  indicator: string,
  limit: number = 30
): Promise<PredictionRecord[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const results = await db
      .select()
      .from(predictiveAnalysisResults)
      .where(eq(predictiveAnalysisResults.indicator, indicator))
      .orderBy(desc(predictiveAnalysisResults.predictionDate))
      .limit(limit);

    return results.map(p => ({
      id: p.id,
      analysisType: p.analysisType,
      indicator: p.indicator,
      currentValue: p.currentValue / 100,
      predictedValue: p.predictedValue / 100,
      actualValue: p.actualValue !== null ? p.actualValue / 100 : null,
      confidence: p.confidence,
      timeframeDays: p.timeframeDays,
      direction: p.direction as "up" | "down" | "stable",
      predictionDate: p.predictionDate,
      targetDate: p.targetDate,
      wasAccurate: p.wasAccurate,
      accuracyScore: p.accuracyScore,
    }));
  } catch (error) {
    console.error("[PredictionTracking] Error fetching history:", error);
    return [];
  }
}
