/**
 * Commodity Service - Dados Reais via Yahoo Finance
 * 
 * Busca preços reais de commodities internacionais usando a API Yahoo Finance
 * através do Data API Hub do Manus. Inclui cache em memória para evitar
 * chamadas excessivas à API.
 */

import { getDb } from "../db";
import { commodityPrices } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { callDataApi } from "../_core/dataApi";

// ============================================================
// INTERFACES
// ============================================================

export interface CommodityPrice {
  code: string;
  name: string;
  category: string;
  price: number; // Em centavos de dólar
  currency: string;
  unit: string;
  changePercent: number;
  changeDirection: "up" | "down" | "stable";
  source: string;
  recordedAt: Date;
}

export interface CommodityTrend {
  code: string;
  name: string;
  currentPrice: number;
  averagePrice30d: number;
  minPrice30d: number;
  maxPrice30d: number;
  volatility: number;
  trend: "bullish" | "bearish" | "neutral";
  recommendation: string;
}

// ============================================================
// DEFINIÇÕES DE COMMODITIES COM SÍMBOLOS YAHOO FINANCE
// ============================================================

const COMMODITY_DEFINITIONS: Record<string, {
  name: string;
  category: string;
  unit: string;
  yahooSymbol: string;
  multiplier: number; // Para converter preço em centavos
}> = {
  // Metais
  STEEL_HRC: { name: "Aço Bobina Laminada a Quente", category: "metals", unit: "ton", yahooSymbol: "SLX", multiplier: 100 },
  ALUMINUM_LME: { name: "Alumínio (LME)", category: "metals", unit: "ton", yahooSymbol: "ALI=F", multiplier: 100 },
  COPPER_LME: { name: "Cobre (LME)", category: "metals", unit: "lb", yahooSymbol: "HG=F", multiplier: 100 },
  ZINC_LME: { name: "Zinco (LME)", category: "metals", unit: "ton", yahooSymbol: "ZINC", multiplier: 100 },
  NICKEL_LME: { name: "Níquel (LME)", category: "metals", unit: "ton", yahooSymbol: "^SPGSNI", multiplier: 100 },
  GOLD: { name: "Ouro", category: "metals", unit: "oz", yahooSymbol: "GC=F", multiplier: 100 },
  SILVER: { name: "Prata", category: "metals", unit: "oz", yahooSymbol: "SI=F", multiplier: 100 },

  // Energia
  BRENT_OIL: { name: "Petróleo Brent", category: "energy", unit: "barrel", yahooSymbol: "BZ=F", multiplier: 100 },
  WTI_OIL: { name: "Petróleo WTI", category: "energy", unit: "barrel", yahooSymbol: "CL=F", multiplier: 100 },
  NATURAL_GAS: { name: "Gás Natural", category: "energy", unit: "mmbtu", yahooSymbol: "NG=F", multiplier: 100 },

  // Agrícolas
  SOYBEAN: { name: "Soja", category: "agricultural", unit: "bushel", yahooSymbol: "ZS=F", multiplier: 100 },
  CORN: { name: "Milho", category: "agricultural", unit: "bushel", yahooSymbol: "ZC=F", multiplier: 100 },
  WHEAT: { name: "Trigo", category: "agricultural", unit: "bushel", yahooSymbol: "ZW=F", multiplier: 100 },
  COTTON: { name: "Algodão", category: "agricultural", unit: "lb", yahooSymbol: "CT=F", multiplier: 100 },
  COFFEE: { name: "Café Arábica", category: "agricultural", unit: "lb", yahooSymbol: "KC=F", multiplier: 100 },
  SUGAR: { name: "Açúcar", category: "agricultural", unit: "lb", yahooSymbol: "SB=F", multiplier: 100 },

  // Químicos/Plásticos (usando ETFs proxy)
  POLYETHYLENE: { name: "Polietileno (proxy)", category: "chemicals", unit: "ton", yahooSymbol: "XLB", multiplier: 100 },
  POLYPROPYLENE: { name: "Polipropileno (proxy)", category: "chemicals", unit: "ton", yahooSymbol: "XLB", multiplier: 100 },
  PVC: { name: "PVC (proxy)", category: "chemicals", unit: "ton", yahooSymbol: "XLB", multiplier: 100 },

  // Índices de Frete
  BDI: { name: "Baltic Dry Index ETF", category: "freight", unit: "index", yahooSymbol: "BDRY", multiplier: 100 },
  SCFI: { name: "Global Shipping ETF", category: "freight", unit: "index", yahooSymbol: "SEA", multiplier: 100 },
};

// ============================================================
// CACHE EM MEMÓRIA
// ============================================================

interface CachedPrice {
  data: CommodityPrice;
  fetchedAt: number;
}

const priceCache = new Map<string, CachedPrice>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function getCachedPrice(code: string): CommodityPrice | null {
  const cached = priceCache.get(code);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    priceCache.delete(code);
    return null;
  }
  return cached.data;
}

function setCachedPrice(code: string, data: CommodityPrice): void {
  priceCache.set(code, { data, fetchedAt: Date.now() });
}

// ============================================================
// BUSCA DE PREÇOS REAIS
// ============================================================

/**
 * Busca preço real de uma commodity via Yahoo Finance API
 */
async function fetchRealPrice(code: string): Promise<CommodityPrice | null> {
  const definition = COMMODITY_DEFINITIONS[code];
  if (!definition) return null;

  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: definition.yahooSymbol,
        region: "US",
        interval: "1d",
        range: "5d",
        includeAdjustedClose: "true",
      },
    }) as any;

    if (!result?.chart?.result?.[0]) {
      console.warn(`[Commodity] No data for ${code} (${definition.yahooSymbol})`);
      return null;
    }

    const data = result.chart.result[0];
    const meta = data.meta;
    const quotes = data.indicators?.quote?.[0];
    const timestamps = data.timestamp || [];
    const lastIndex = timestamps.length - 1;
    const previousIndex = lastIndex > 0 ? lastIndex - 1 : 0;

    const currentPrice = meta.regularMarketPrice || quotes?.close?.[lastIndex] || 0;
    const previousPrice = quotes?.close?.[previousIndex] || currentPrice;
    const change = currentPrice - previousPrice;
    const changePercent = previousPrice > 0 ? (change / previousPrice) * 100 : 0;

    const priceInCents = Math.round(currentPrice * definition.multiplier);

    const commodityPrice: CommodityPrice = {
      code,
      name: definition.name,
      category: definition.category,
      price: priceInCents,
      currency: "USD",
      unit: definition.unit,
      changePercent: Math.round(changePercent * 100) / 100,
      changeDirection: changePercent > 0.5 ? "up" : changePercent < -0.5 ? "down" : "stable",
      source: "yahoo_finance",
      recordedAt: new Date(),
    };

    return commodityPrice;
  } catch (error) {
    console.error(`[Commodity] Error fetching ${code}:`, error);
    return null;
  }
}

/**
 * Obtém preço atual de uma commodity (com cache)
 */
export async function getCurrentCommodityPrice(code: string): Promise<CommodityPrice | null> {
  const definition = COMMODITY_DEFINITIONS[code];
  if (!definition) return null;

  // Check cache
  const cached = getCachedPrice(code);
  if (cached) return cached;

  // Fetch real price
  const realPrice = await fetchRealPrice(code);
  if (realPrice) {
    setCachedPrice(code, realPrice);
    return realPrice;
  }

  // Fallback: buscar último preço salvo no banco
  const db = await getDb();
  if (db) {
    try {
      const lastSaved = await db
        .select()
        .from(commodityPrices)
        .where(eq(commodityPrices.commodityCode, code))
        .orderBy(desc(commodityPrices.recordedAt))
        .limit(1);

      if (lastSaved.length > 0) {
        const saved = lastSaved[0];
        const fallbackPrice: CommodityPrice = {
          code,
          name: definition.name,
          category: definition.category,
          price: Number(saved.priceCents),
          currency: saved.currency || "USD",
          unit: definition.unit,
          changePercent: Number(saved.changePercent || 0) / 100,
          changeDirection: (saved.changeDirection as any) || "stable",
          source: "database_fallback",
          recordedAt: saved.recordedAt,
        };
        setCachedPrice(code, fallbackPrice);
        return fallbackPrice;
      }
    } catch (e) {
      // Table might not exist
    }
  }

  return null;
}

/**
 * Obtém preços de todas as commodities (em paralelo com limite de concorrência)
 */
export async function getAllCommodityPrices(): Promise<CommodityPrice[]> {
  const codes = Object.keys(COMMODITY_DEFINITIONS);
  const results: CommodityPrice[] = [];
  const MAX_CONCURRENT = 5;

  for (let i = 0; i < codes.length; i += MAX_CONCURRENT) {
    const batch = codes.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map(code => getCurrentCommodityPrice(code))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }
  }

  return results;
}

/**
 * Obtém preços de commodities por categoria
 */
export async function getCommodityPricesByCategory(category: string): Promise<CommodityPrice[]> {
  const codes = Object.entries(COMMODITY_DEFINITIONS)
    .filter(([_, def]) => def.category === category)
    .map(([code]) => code);

  const results: CommodityPrice[] = [];
  const batchResults = await Promise.allSettled(
    codes.map(code => getCurrentCommodityPrice(code))
  );

  for (const result of batchResults) {
    if (result.status === "fulfilled" && result.value) {
      results.push(result.value);
    }
  }

  return results;
}

// ============================================================
// PERSISTÊNCIA E HISTÓRICO
// ============================================================

/**
 * Salva preço de commodity no banco de dados
 */
export async function saveCommodityPrice(price: CommodityPrice): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    await db.insert(commodityPrices).values({
      commodityCode: price.code,
      commodityName: price.name,
      category: price.category,
      priceCents: price.price,
      currency: price.currency,
      unit: price.unit,
      changePercent: Math.round(price.changePercent * 100),
      changeDirection: price.changeDirection,
      source: price.source,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Obtém histórico de preços de uma commodity
 */
export async function getCommodityHistory(
  code: string,
  days: number = 30
): Promise<{ date: Date; price: number }[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const history = await db
      .select()
      .from(commodityPrices)
      .where(eq(commodityPrices.commodityCode, code))
      .orderBy(desc(commodityPrices.recordedAt))
      .limit(days);

    return history.map(h => ({
      date: h.recordedAt,
      price: Number(h.priceCents),
    }));
  } catch (error) {
    console.error("[Commodity] Error fetching history:", error);
    return [];
  }
}

/**
 * Atualiza e salva todos os preços de commodities
 */
export async function refreshAndSaveAllPrices(): Promise<{
  updated: number;
  failed: number;
  prices: CommodityPrice[];
}> {
  // Limpar cache para forçar busca fresca
  priceCache.clear();

  const prices = await getAllCommodityPrices();
  let saved = 0;
  let failed = 0;

  for (const price of prices) {
    const result = await saveCommodityPrice(price);
    if (result.success) saved++;
    else failed++;
  }

  console.log(`[Commodity] Refreshed: ${saved} saved, ${failed} failed`);
  return { updated: saved, failed, prices };
}

// ============================================================
// ANÁLISE DE TENDÊNCIA
// ============================================================

/**
 * Analisa tendência de uma commodity baseado em histórico
 */
export function analyzeCommodityTrend(
  code: string,
  history: { date: Date; price: number }[]
): CommodityTrend {
  const definition = COMMODITY_DEFINITIONS[code];
  const currentPrice = history[0]?.price || 0;

  if (history.length < 2) {
    return {
      code,
      name: definition?.name || code,
      currentPrice,
      averagePrice30d: currentPrice,
      minPrice30d: currentPrice,
      maxPrice30d: currentPrice,
      volatility: 0,
      trend: "neutral",
      recommendation: "Dados históricos insuficientes para análise de tendência",
    };
  }

  const prices = history.map(h => h.price);
  const averagePrice30d = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const minPrice30d = Math.min(...prices);
  const maxPrice30d = Math.max(...prices);

  // Calcular volatilidade (desvio padrão percentual)
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - averagePrice30d, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const volatility = Math.round((stdDev / averagePrice30d) * 10000) / 100;

  // Determinar tendência
  const recentPrices = prices.slice(0, Math.min(7, prices.length));
  const olderPrices = prices.slice(Math.min(7, prices.length));
  const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const olderAvg = olderPrices.length > 0
    ? olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length
    : recentAvg;

  const trendPercent = ((recentAvg - olderAvg) / olderAvg) * 100;
  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  let recommendation = "";

  if (trendPercent > 3) {
    trend = "bullish";
    recommendation = `Preços em alta (+${trendPercent.toFixed(1)}%). Considere antecipar compras se possível.`;
  } else if (trendPercent < -3) {
    trend = "bearish";
    recommendation = `Preços em queda (${trendPercent.toFixed(1)}%). Pode ser bom momento para aguardar antes de comprar.`;
  } else {
    trend = "neutral";
    recommendation = `Preços estáveis (${trendPercent.toFixed(1)}%). Mercado sem tendência definida.`;
  }

  if (volatility > 10) {
    recommendation += ` Alta volatilidade (${volatility.toFixed(1)}%) - considere hedging.`;
  }

  return {
    code,
    name: definition?.name || code,
    currentPrice,
    averagePrice30d,
    minPrice30d,
    maxPrice30d,
    volatility,
    trend,
    recommendation,
  };
}

// ============================================================
// MAPEAMENTO NCM → COMMODITIES
// ============================================================

/**
 * Obtém commodities relevantes para um NCM
 */
export function getRelevantCommodities(ncmCode: string): string[] {
  const chapter = ncmCode.substring(0, 2);

  const ncmToCommodities: Record<string, string[]> = {
    "72": ["STEEL_HRC", "GOLD"], // Ferro e aço
    "73": ["STEEL_HRC"], // Obras de ferro ou aço
    "74": ["COPPER_LME"], // Cobre
    "75": ["NICKEL_LME"], // Níquel
    "76": ["ALUMINUM_LME"], // Alumínio
    "79": ["ZINC_LME"], // Zinco
    "71": ["GOLD", "SILVER"], // Pedras e metais preciosos
    "39": ["POLYETHYLENE", "POLYPROPYLENE", "PVC", "BRENT_OIL"], // Plásticos
    "52": ["COTTON"], // Algodão
    "54": ["POLYETHYLENE"], // Fibras sintéticas
    "55": ["POLYETHYLENE"], // Fibras sintéticas
    "09": ["COFFEE"], // Café
    "10": ["WHEAT", "CORN"], // Cereais
    "12": ["SOYBEAN"], // Oleaginosas
    "17": ["SUGAR"], // Açúcares
    "27": ["BRENT_OIL", "WTI_OIL", "NATURAL_GAS"], // Combustíveis
    "84": ["STEEL_HRC", "ALUMINUM_LME", "COPPER_LME", "BRENT_OIL"], // Máquinas
    "85": ["COPPER_LME", "ALUMINUM_LME", "STEEL_HRC"], // Elétricos
    "87": ["STEEL_HRC", "ALUMINUM_LME", "BRENT_OIL"], // Veículos
    "90": ["COPPER_LME", "GOLD", "SILVER"], // Instrumentos ópticos
  };

  return ncmToCommodities[chapter] || ["BDI", "SCFI"];
}

// ============================================================
// RELATÓRIO
// ============================================================

/**
 * Gera relatório de commodities
 */
export function generateCommodityReport(prices: CommodityPrice[]): string {
  let report = `
RELATÓRIO DE COMMODITIES INTERNACIONAIS
=======================================
Data: ${new Date().toLocaleDateString("pt-BR")}
Fonte: Yahoo Finance (dados em tempo real)

`;

  const byCategory: Record<string, CommodityPrice[]> = {};
  for (const price of prices) {
    if (!byCategory[price.category]) {
      byCategory[price.category] = [];
    }
    byCategory[price.category].push(price);
  }

  const categoryNames: Record<string, string> = {
    metals: "METAIS",
    energy: "ENERGIA",
    agricultural: "AGRÍCOLAS",
    chemicals: "QUÍMICOS",
    freight: "ÍNDICES DE FRETE",
  };

  for (const [category, categoryPrices] of Object.entries(byCategory)) {
    report += `\n${categoryNames[category] || category.toUpperCase()}\n`;
    report += "-".repeat(40) + "\n";

    for (const price of categoryPrices) {
      const arrow = price.changeDirection === "up" ? "↑" : price.changeDirection === "down" ? "↓" : "→";
      const priceFormatted = (price.price / 100).toFixed(2);
      report += `${price.name}: $${priceFormatted}/${price.unit} ${arrow} ${price.changePercent.toFixed(1)}%\n`;
    }
  }

  return report.trim();
}

/**
 * Calcula impacto de variação de commodity no custo de importação
 */
export function calculateCommodityImpact(params: {
  commodityCode: string;
  currentPrice: number;
  projectedChange: number;
  importValueCents: number;
  commodityWeightPercent: number;
}): {
  currentCost: number;
  projectedCost: number;
  impact: number;
  impactPercent: number;
} {
  const commodityCost = Math.round(params.importValueCents * params.commodityWeightPercent / 100);
  const projectedCommodityCost = Math.round(commodityCost * (1 + params.projectedChange / 100));
  const impact = projectedCommodityCost - commodityCost;
  const impactPercent = (impact / params.importValueCents) * 100;

  return {
    currentCost: commodityCost,
    projectedCost: projectedCommodityCost,
    impact,
    impactPercent,
  };
}

/**
 * Retorna definições de commodities disponíveis
 */
export function getCommodityDefinitions() {
  return COMMODITY_DEFINITIONS;
}

/**
 * Limpa cache de preços
 */
export function clearPriceCache(): void {
  priceCache.clear();
  console.log("[Commodity] Price cache cleared");
}
