/**
 * Market Data Service
 * Integração com APIs de mercado para captar indicadores relevantes para importação
 * - Yahoo Finance: Commodities, índices, ações
 * - DataBank (World Bank): Indicadores econômicos globais
 */

import { callDataApi } from "../_core/dataApi";
import { getDb } from "../db";
import { marketIndicators } from "../../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";

// Símbolos de commodities e índices relevantes para importação
const MARKET_SYMBOLS = {
  // Commodities
  commodities: {
    gold: { symbol: "GC=F", name: "Ouro", unit: "USD/oz", category: "metal" },
    silver: { symbol: "SI=F", name: "Prata", unit: "USD/oz", category: "metal" },
    copper: { symbol: "HG=F", name: "Cobre", unit: "USD/lb", category: "metal" },
    aluminum: { symbol: "ALI=F", name: "Alumínio", unit: "USD/lb", category: "metal" },
    steel: { symbol: "SLX", name: "Aço (ETF)", unit: "USD", category: "metal" },
    oil: { symbol: "CL=F", name: "Petróleo WTI", unit: "USD/bbl", category: "energy" },
    brent: { symbol: "BZ=F", name: "Petróleo Brent", unit: "USD/bbl", category: "energy" },
    naturalGas: { symbol: "NG=F", name: "Gás Natural", unit: "USD/MMBtu", category: "energy" },
    corn: { symbol: "ZC=F", name: "Milho", unit: "USD/bu", category: "agricultural" },
    wheat: { symbol: "ZW=F", name: "Trigo", unit: "USD/bu", category: "agricultural" },
    soybean: { symbol: "ZS=F", name: "Soja", unit: "USD/bu", category: "agricultural" },
    cotton: { symbol: "CT=F", name: "Algodão", unit: "USD/lb", category: "agricultural" },
  },
  // Índices de mercado
  indices: {
    sp500: { symbol: "^GSPC", name: "S&P 500", unit: "pts", category: "index" },
    dowJones: { symbol: "^DJI", name: "Dow Jones", unit: "pts", category: "index" },
    nasdaq: { symbol: "^IXIC", name: "NASDAQ", unit: "pts", category: "index" },
    ibovespa: { symbol: "^BVSP", name: "Ibovespa", unit: "pts", category: "index" },
    shanghai: { symbol: "000001.SS", name: "Shanghai Composite", unit: "pts", category: "index" },
  },
  // Moedas
  currencies: {
    usdBrl: { symbol: "BRL=X", name: "USD/BRL", unit: "BRL", category: "currency" },
    eurBrl: { symbol: "EURBRL=X", name: "EUR/BRL", unit: "BRL", category: "currency" },
    cnyBrl: { symbol: "CNYBRL=X", name: "CNY/BRL", unit: "BRL", category: "currency" },
    usdCny: { symbol: "CNY=X", name: "USD/CNY", unit: "CNY", category: "currency" },
  },
  // Frete marítimo (ETFs relacionados)
  shipping: {
    bdry: { symbol: "BDRY", name: "Baltic Dry Index ETF", unit: "USD", category: "shipping" },
    sea: { symbol: "SEA", name: "US Global Sea to Sky Cargo", unit: "USD", category: "shipping" },
  },
};

// Indicadores econômicos do World Bank
const ECONOMIC_INDICATORS = {
  gdpGrowth: { code: "NY.GDP.MKTP.KD.ZG", name: "Crescimento PIB (%)", category: "economic" },
  inflation: { code: "FP.CPI.TOTL.ZG", name: "Inflação (%)", category: "economic" },
  unemployment: { code: "SL.UEM.TOTL.ZS", name: "Desemprego (%)", category: "economic" },
  tradeBalance: { code: "NE.RSB.GNFS.ZS", name: "Balança Comercial (% PIB)", category: "trade" },
  imports: { code: "NE.IMP.GNFS.ZS", name: "Importações (% PIB)", category: "trade" },
  exports: { code: "NE.EXP.GNFS.ZS", name: "Exportações (% PIB)", category: "trade" },
};

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  timestamp: number;
  unit: string;
  category: string;
}

interface EconomicIndicator {
  code: string;
  name: string;
  value: number;
  country: string;
  year: number;
  category: string;
}

/**
 * Busca cotação de um símbolo via Yahoo Finance
 */
export async function getMarketQuote(symbol: string): Promise<MarketQuote | null> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol,
        region: "US",
        interval: "1d",
        range: "5d",
        includeAdjustedClose: "true",
      },
    }) as any;

    if (!result?.chart?.result?.[0]) {
      return null;
    }

    const data = result.chart.result[0];
    const meta = data.meta;
    const quotes = data.indicators?.quote?.[0];
    const timestamps = data.timestamp || [];

    // Pegar último preço disponível
    const lastIndex = timestamps.length - 1;
    const previousIndex = lastIndex > 0 ? lastIndex - 1 : 0;

    const currentPrice = meta.regularMarketPrice || quotes?.close?.[lastIndex] || 0;
    const previousPrice = quotes?.close?.[previousIndex] || currentPrice;
    const change = currentPrice - previousPrice;
    const changePercent = previousPrice > 0 ? (change / previousPrice) * 100 : 0;

    // Encontrar info do símbolo
    let symbolInfo = { name: meta.longName || symbol, unit: "USD", category: "other" };
    for (const category of Object.values(MARKET_SYMBOLS)) {
      for (const [key, info] of Object.entries(category)) {
        if (info.symbol === symbol) {
          symbolInfo = info;
          break;
        }
      }
    }

    return {
      symbol,
      name: symbolInfo.name,
      price: currentPrice,
      change,
      changePercent,
      high: meta.regularMarketDayHigh || quotes?.high?.[lastIndex] || 0,
      low: meta.regularMarketDayLow || quotes?.low?.[lastIndex] || 0,
      volume: meta.regularMarketVolume || quotes?.volume?.[lastIndex] || 0,
      timestamp: timestamps[lastIndex] ? timestamps[lastIndex] * 1000 : Date.now(),
      unit: symbolInfo.unit,
      category: symbolInfo.category,
    };
  } catch (error) {
    console.error(`[MarketData] Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Busca todas as cotações de mercado relevantes
 */
export async function getAllMarketQuotes(): Promise<MarketQuote[]> {
  const quotes: MarketQuote[] = [];
  const allSymbols = [
    ...Object.values(MARKET_SYMBOLS.commodities),
    ...Object.values(MARKET_SYMBOLS.indices),
    ...Object.values(MARKET_SYMBOLS.currencies),
    ...Object.values(MARKET_SYMBOLS.shipping),
  ];

  // Buscar em paralelo com limite de concorrência
  const batchSize = 5;
  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (info) => {
        const quote = await getMarketQuote(info.symbol);
        if (quote) {
          quote.name = info.name;
          quote.unit = info.unit;
          quote.category = info.category;
        }
        return quote;
      })
    );
    quotes.push(...results.filter((q): q is MarketQuote => q !== null));
  }

  return quotes;
}

/**
 * Busca indicadores econômicos do World Bank
 */
export async function getEconomicIndicators(countryCode: string = "BRA"): Promise<EconomicIndicator[]> {
  const indicators: EconomicIndicator[] = [];

  for (const [key, info] of Object.entries(ECONOMIC_INDICATORS)) {
    try {
      const result = await callDataApi("DataBank/indicator_detail", {
        pathParams: { indicatorCode: info.code },
      }) as any;

      if (result) {
        indicators.push({
          code: info.code,
          name: info.name,
          value: result.value || 0,
          country: countryCode,
          year: new Date().getFullYear(),
          category: info.category,
        });
      }
    } catch (error) {
      console.error(`[MarketData] Error fetching indicator ${info.code}:`, error);
    }
  }

  return indicators;
}

/**
 * Salva indicadores de mercado no banco de dados
 */
export async function saveMarketIndicators(quotes: MarketQuote[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  for (const quote of quotes) {
    try {
      // Inserir novo registro usando a estrutura existente da tabela
      await db.insert(marketIndicators).values({
        indicatorType: quote.category,
        indicatorName: quote.symbol,
        value: Math.round(quote.price * 100), // Valor * 100 para precisão
        metadata: JSON.stringify({
          name: quote.name,
          change: quote.change,
          changePercent: quote.changePercent,
          high: quote.high,
          low: quote.low,
          volume: quote.volume,
          unit: quote.unit,
          timestamp: quote.timestamp,
        }),
        source: "yahoo_finance",
        recordedAt: new Date(),
      });
    } catch (error) {
      console.error(`[MarketData] Error saving indicator ${quote.symbol}:`, error);
    }
  }
}

/**
 * Busca histórico de indicadores de mercado
 */
export async function getMarketHistory(
  symbol: string,
  days: number = 30
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const history = await db
    .select()
    .from(marketIndicators)
    .where(
      and(
        eq(marketIndicators.indicatorName, symbol),
        gte(marketIndicators.recordedAt, startDate)
      )
    )
    .orderBy(desc(marketIndicators.recordedAt));

  return history.map((h: any) => ({
    ...h,
    price: h.value / 100,
    metadata: h.metadata ? JSON.parse(h.metadata) : {},
  }));
}

/**
 * Busca últimos indicadores de mercado salvos
 */
export async function getLatestMarketIndicators(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar indicadores mais recentes (últimos 2 dias para garantir dados)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const indicators = await db
    .select()
    .from(marketIndicators)
    .where(gte(marketIndicators.recordedAt, yesterday))
    .orderBy(desc(marketIndicators.recordedAt));

  // Agrupar por símbolo e pegar o mais recente
  const latestBySymbol = new Map<string, any>();
  for (const indicator of indicators) {
    if (!latestBySymbol.has(indicator.indicatorName)) {
      const metadata = indicator.metadata ? JSON.parse(indicator.metadata) : {};
      latestBySymbol.set(indicator.indicatorName, {
        symbol: indicator.indicatorName,
        category: indicator.indicatorType,
        price: indicator.value / 100,
        ...metadata,
        recordedAt: indicator.recordedAt,
      });
    }
  }

  return Array.from(latestBySymbol.values());
}

/**
 * Gera insights de mercado usando IA
 */
export async function generateMarketInsights(quotes: MarketQuote[]): Promise<string[]> {
  const insights: string[] = [];

  // Análise de commodities metálicas
  const metals = quotes.filter((q) => q.category === "metal");
  const metalsTrend = metals.reduce((acc, m) => acc + m.changePercent, 0) / metals.length;
  if (metalsTrend > 2) {
    insights.push(
      `📈 **Metais em alta**: Média de +${metalsTrend.toFixed(1)}%. Considere antecipar compras de insumos metálicos.`
    );
  } else if (metalsTrend < -2) {
    insights.push(
      `📉 **Metais em queda**: Média de ${metalsTrend.toFixed(1)}%. Momento favorável para negociar preços com fornecedores.`
    );
  }

  // Análise de energia
  const energy = quotes.filter((q) => q.category === "energy");
  const oilQuote = energy.find((q) => q.symbol === "CL=F");
  if (oilQuote) {
    if (oilQuote.changePercent > 3) {
      insights.push(
        `⛽ **Petróleo em alta**: +${oilQuote.changePercent.toFixed(1)}%. Custos de frete podem aumentar.`
      );
    } else if (oilQuote.changePercent < -3) {
      insights.push(
        `⛽ **Petróleo em queda**: ${oilQuote.changePercent.toFixed(1)}%. Oportunidade para negociar fretes.`
      );
    }
  }

  // Análise de câmbio
  const currencies = quotes.filter((q) => q.category === "currency");
  const usdBrl = currencies.find((q) => q.symbol === "BRL=X");
  if (usdBrl) {
    if (usdBrl.changePercent > 1) {
      insights.push(
        `💵 **Dólar valorizando**: +${usdBrl.changePercent.toFixed(1)}%. Importações ficam mais caras.`
      );
    } else if (usdBrl.changePercent < -1) {
      insights.push(
        `💵 **Dólar desvalorizando**: ${usdBrl.changePercent.toFixed(1)}%. Momento favorável para importar.`
      );
    }
  }

  // Análise de frete marítimo
  const shipping = quotes.filter((q) => q.category === "shipping");
  const shippingTrend = shipping.reduce((acc, s) => acc + s.changePercent, 0) / (shipping.length || 1);
  if (shippingTrend > 5) {
    insights.push(
      `🚢 **Frete marítimo em alta**: +${shippingTrend.toFixed(1)}%. Considere consolidar embarques.`
    );
  }

  // Análise de índices
  const indices = quotes.filter((q) => q.category === "index");
  const sp500 = indices.find((q) => q.symbol === "^GSPC");
  const ibov = indices.find((q) => q.symbol === "^BVSP");
  if (sp500 && ibov) {
    if (sp500.changePercent > 1 && ibov.changePercent < -1) {
      insights.push(
        `📊 **Divergência de mercados**: EUA em alta, Brasil em queda. Possível pressão no câmbio.`
      );
    }
  }

  // Análise de commodities agrícolas
  const agricultural = quotes.filter((q) => q.category === "agricultural");
  const agriTrend = agricultural.reduce((acc, a) => acc + a.changePercent, 0) / (agricultural.length || 1);
  if (agriTrend > 3) {
    insights.push(
      `🌾 **Commodities agrícolas em alta**: +${agriTrend.toFixed(1)}%. Impacto em embalagens e insumos.`
    );
  }

  // Insight padrão se não houver movimentos significativos
  if (insights.length === 0) {
    insights.push(
      `📊 **Mercado estável**: Sem movimentos significativos. Bom momento para planejamento de longo prazo.`
    );
  }

  return insights;
}

// Insights são armazenados em memória para a sessão atual
let cachedInsights: { content: string; date: string; createdAt: Date }[] = [];

/**
 * Salva insights de mercado em cache
 */
export async function saveMarketInsights(insights: string[]): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  for (const insight of insights) {
    cachedInsights.push({
      content: insight,
      date: today,
      createdAt: new Date(),
    });
  }

  // Manter apenas últimos 50 insights
  if (cachedInsights.length > 50) {
    cachedInsights = cachedInsights.slice(-50);
  }
}

/**
 * Busca insights de mercado recentes
 */
export async function getRecentInsights(days: number = 7): Promise<any[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0];

  return cachedInsights.filter((i) => i.date >= startDateStr).slice(-20);
}

/**
 * Atualização completa de dados de mercado
 */
export async function updateMarketData(): Promise<{
  quotes: MarketQuote[];
  insights: string[];
}> {
  console.log("[MarketData] Starting market data update...");

  // Buscar cotações
  const quotes = await getAllMarketQuotes();
  console.log(`[MarketData] Fetched ${quotes.length} quotes`);

  // Salvar no banco
  await saveMarketIndicators(quotes);

  // Gerar insights
  const insights = await generateMarketInsights(quotes);
  await saveMarketInsights(insights);

  console.log(`[MarketData] Generated ${insights.length} insights`);

  return { quotes, insights };
}

/**
 * Retorna símbolos disponíveis para monitoramento
 */
export function getAvailableSymbols() {
  return MARKET_SYMBOLS;
}

/**
 * Retorna indicadores econômicos disponíveis
 */
export function getAvailableEconomicIndicators() {
  return ECONOMIC_INDICATORS;
}
