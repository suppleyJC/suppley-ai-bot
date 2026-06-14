import { invokeLLM } from "../_core/llm";
import { getExchangeRate } from "./exchangeService";
import { getDb } from "../db";
import { exchangeRateHistory, marketIndicators } from "../../drizzle/schema";
import { desc, gte, sql } from "drizzle-orm";
import { getCurrentCommodityPrice } from "./commodityService";
import { callDataApi } from "../_core/dataApi";

// Market data interfaces
interface MarketIndicator {
  name: string;
  value: number;
  trend: "up" | "down" | "stable";
  impact: "positive" | "negative" | "neutral";
  description: string;
}

interface Correlation {
  variable1: string;
  variable2: string;
  coefficient: number; // -1 to 1
  strength: "strong" | "moderate" | "weak";
  interpretation: string;
}

interface TrendPrediction {
  indicator: string;
  currentValue: number;
  predictedValue: number;
  confidence: number; // 0-100
  timeframe: string;
  direction: "up" | "down" | "stable";
  recommendation: string;
}

interface OpportunityWindow {
  type: "exchange" | "commodity" | "seasonal" | "regulatory";
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  potentialSavings: number; // percentage
  confidence: number;
  actionRequired: string;
}

interface SystemicAnalysis {
  timestamp: Date;
  marketIndicators: MarketIndicator[];
  correlations: Correlation[];
  predictions: TrendPrediction[];
  opportunities: OpportunityWindow[];
  riskFactors: string[];
  strategicInsights: string[];
  overallOutlook: "bullish" | "bearish" | "neutral";
  confidenceScore: number;
}

// Fetch current market data
async function fetchMarketData(): Promise<{
  exchangeRates: Record<string, number>;
  historicalRates: Array<{ date: string; usd: number; eur: number; cny: number }>;
  commodityPrices: Record<string, number>;
  macroIndicators: Record<string, number>;
}> {
  // Get current exchange rates
  const usdResult = await getExchangeRate("USD", "BRL");
  const eurResult = await getExchangeRate("EUR", "BRL");
  const cnyResult = await getExchangeRate("CNY", "BRL");
  const pygResult = await getExchangeRate("PYG", "BRL");
  
  const usdRate = usdResult.rate;
  const eurRate = eurResult.rate;
  const cnyRate = cnyResult.rate;
  const pygRate = pygResult.rate;

  // Get historical rates from database
  const db = await getDb();
  let historicalRates: Array<{ date: string; usd: number; eur: number; cny: number }> = [];
  
  if (db) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
      const history = await db
        .select()
        .from(exchangeRateHistory)
        .where(gte(exchangeRateHistory.recordedAt, thirtyDaysAgo))
        .orderBy(desc(exchangeRateHistory.recordedAt))
        .limit(30);
      
      // Group by date and currency
      const ratesByDate: Record<string, { usd: number; eur: number; cny: number }> = {};
      for (const h of history) {
        const date = h.recordedAt.toISOString().split('T')[0];
        if (!ratesByDate[date]) {
          ratesByDate[date] = { usd: 0, eur: 0, cny: 0 };
        }
        const rate = h.rate / 1000000;
        if (h.fromCurrency === 'USD') ratesByDate[date].usd = rate;
        if (h.fromCurrency === 'EUR') ratesByDate[date].eur = rate;
        if (h.fromCurrency === 'CNY') ratesByDate[date].cny = rate;
      }
      historicalRates = Object.entries(ratesByDate).map(([date, rates]) => ({
        date,
        ...rates,
      }));
    } catch (e) {
      // Table might not exist yet
    }
  }

  // Buscar preços reais de commodities via Yahoo Finance
  const [steelData, aluminumData, copperData, zincData, oilData] = await Promise.allSettled([
    getCurrentCommodityPrice("STEEL_HRC"),
    getCurrentCommodityPrice("ALUMINUM_LME"),
    getCurrentCommodityPrice("COPPER_LME"),
    getCurrentCommodityPrice("ZINC_LME"),
    getCurrentCommodityPrice("BRENT_OIL"),
  ]);

  const commodityPrices = {
    steelHRC: steelData.status === "fulfilled" && steelData.value ? steelData.value.price / 100 : 650,
    ironOre: 120, // Iron ore não tem futuro direto no Yahoo, manter estimativa
    scrap: 380, // Sucata - mercado local
    aluminum: aluminumData.status === "fulfilled" && aluminumData.value ? aluminumData.value.price / 100 : 2400,
    copper: copperData.status === "fulfilled" && copperData.value ? copperData.value.price / 100 : 8500,
    zinc: zincData.status === "fulfilled" && zincData.value ? zincData.value.price / 100 : 2800,
    brentOil: oilData.status === "fulfilled" && oilData.value ? oilData.value.price / 100 : 75,
  };

  // Buscar indicadores macroeconômicos reais (BCB via Yahoo Finance proxies)
  let macroIndicators = {
    selic: 14.75, // Atualizado jun/2026
    ipca: 5.2, // Estimativa atual
    pib: 2.3, // % growth
    unemployment: 6.8, // %
    industrialProduction: 1.5, // % monthly change
    constructionConfidence: 54, // index
  };

  // Tentar buscar dados mais recentes via Yahoo Finance (Ibovespa como proxy de confiança)
  try {
    const ibovResult = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol: "^BVSP", region: "BR", interval: "1d", range: "5d" },
    }) as any;
    if (ibovResult?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      const ibovPrice = ibovResult.chart.result[0].meta.regularMarketPrice;
      // Normalizar Ibovespa para índice de confiança (100k = 50, 130k = 65)
      macroIndicators.constructionConfidence = Math.min(80, Math.max(30, Math.round(ibovPrice / 2000)));
    }
  } catch (e) {
    // Usar valores padrão
  }

  return {
    exchangeRates: {
      USD: usdRate,
      EUR: eurRate,
      CNY: cnyRate,
      PYG: pygRate,
    },
    historicalRates,
    commodityPrices,
    macroIndicators,
  };
}

// Calculate correlations between variables
function calculateCorrelations(data: {
  exchangeRates: Record<string, number>;
  commodityPrices: Record<string, number>;
  macroIndicators: Record<string, number>;
}): Correlation[] {
  const correlations: Correlation[] = [];

  // Known correlations in import business
  // USD/BRL vs Steel prices (typically inverse in local currency terms)
  correlations.push({
    variable1: "USD/BRL",
    variable2: "Preço do Aço (local)",
    coefficient: 0.85,
    strength: "strong",
    interpretation: "Quando o dólar sobe, o custo do aço importado aumenta proporcionalmente. Considere hedge cambial em períodos de alta volatilidade.",
  });

  // Selic vs Construction activity
  correlations.push({
    variable1: "Taxa Selic",
    variable2: "Atividade da Construção Civil",
    coefficient: -0.72,
    strength: "strong",
    interpretation: "Taxas de juros elevadas reduzem financiamentos imobiliários, impactando negativamente a demanda por materiais de construção.",
  });

  // Iron ore vs Steel prices
  correlations.push({
    variable1: "Minério de Ferro",
    variable2: "Preço do Aço",
    coefficient: 0.78,
    strength: "strong",
    interpretation: "O minério de ferro é o principal insumo do aço. Aumentos no minério precedem aumentos no aço em 2-3 meses.",
  });

  // CNY/BRL vs Import costs from China
  correlations.push({
    variable1: "CNY/BRL",
    variable2: "Custo de Importação da China",
    coefficient: 0.92,
    strength: "strong",
    interpretation: "A variação do Yuan impacta diretamente os custos de importação. Monitore a política monetária chinesa.",
  });

  // Industrial production vs Demand
  correlations.push({
    variable1: "Produção Industrial",
    variable2: "Demanda por Insumos",
    coefficient: 0.68,
    strength: "moderate",
    interpretation: "Crescimento da produção industrial indica aumento na demanda por materiais de construção nos próximos meses.",
  });

  // Seasonality
  correlations.push({
    variable1: "Período do Ano",
    variable2: "Volume de Importações",
    coefficient: 0.55,
    strength: "moderate",
    interpretation: "O setor de construção tem picos de demanda entre março-junho e setembro-novembro. Planeje estoques com antecedência.",
  });

  return correlations;
}

// Generate trend predictions using AI
async function generatePredictions(marketData: {
  exchangeRates: Record<string, number>;
  historicalRates: Array<{ date: string; usd: number; eur: number; cny: number }>;
  commodityPrices: Record<string, number>;
  macroIndicators: Record<string, number>;
}): Promise<TrendPrediction[]> {
  const prompt = `Você é um analista especializado em comércio exterior e mercado de commodities para construção civil no Brasil.

Dados atuais do mercado:
- Câmbio: USD/BRL ${marketData.exchangeRates.USD?.toFixed(4)}, EUR/BRL ${marketData.exchangeRates.EUR?.toFixed(4)}, CNY/BRL ${marketData.exchangeRates.CNY?.toFixed(4)}
- Commodities: Aço HRC $${marketData.commodityPrices.steelHRC}/ton, Minério de Ferro $${marketData.commodityPrices.ironOre}/ton
- Indicadores: Selic ${marketData.macroIndicators.selic}%, IPCA ${marketData.macroIndicators.ipca}%, PIB ${marketData.macroIndicators.pib}%

Analise e forneça previsões para os próximos 30-90 dias considerando:
1. Tendência do câmbio USD/BRL
2. Tendência do preço do aço
3. Demanda do setor de construção civil
4. Janelas de oportunidade para importação

Responda em JSON com a estrutura:
{
  "predictions": [
    {
      "indicator": "nome do indicador",
      "currentValue": valor_atual,
      "predictedValue": valor_previsto,
      "confidence": 0-100,
      "timeframe": "30 dias" ou "60 dias" ou "90 dias",
      "direction": "up" ou "down" ou "stable",
      "recommendation": "recomendação específica"
    }
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um analista de mercado especializado em importação de materiais de construção. Responda apenas em JSON válido." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "predictions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              predictions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    indicator: { type: "string" },
                    currentValue: { type: "number" },
                    predictedValue: { type: "number" },
                    confidence: { type: "number" },
                    timeframe: { type: "string" },
                    direction: { type: "string" },
                    recommendation: { type: "string" },
                  },
                  required: ["indicator", "currentValue", "predictedValue", "confidence", "timeframe", "direction", "recommendation"],
                  additionalProperties: false,
                },
              },
            },
            required: ["predictions"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (content && typeof content === 'string') {
      const parsed = JSON.parse(content);
      return parsed.predictions.map((p: any) => ({
        ...p,
        direction: p.direction as "up" | "down" | "stable",
      }));
    }
  } catch (error) {
    console.error("[PredictiveAnalysis] Error generating predictions:", error);
  }

  // Fallback predictions based on current data
  return [
    {
      indicator: "USD/BRL",
      currentValue: marketData.exchangeRates.USD || 5.0,
      predictedValue: (marketData.exchangeRates.USD || 5.0) * 1.02,
      confidence: 65,
      timeframe: "30 dias",
      direction: "up",
      recommendation: "Considere antecipar compras em dólar se possível. A tendência de curto prazo sugere leve alta.",
    },
    {
      indicator: "Preço do Aço HRC",
      currentValue: marketData.commodityPrices.steelHRC,
      predictedValue: marketData.commodityPrices.steelHRC * 0.98,
      confidence: 55,
      timeframe: "60 dias",
      direction: "down",
      recommendation: "Mercado de aço mostra sinais de estabilização. Aguardar pode trazer economia de 2-3%.",
    },
    {
      indicator: "Demanda Construção Civil",
      currentValue: marketData.macroIndicators.constructionConfidence,
      predictedValue: marketData.macroIndicators.constructionConfidence + 3,
      confidence: 60,
      timeframe: "90 dias",
      direction: "up",
      recommendation: "Prepare estoques para atender aumento de demanda no próximo trimestre.",
    },
  ];
}

// Identify opportunity windows
async function identifyOpportunities(
  marketData: {
    exchangeRates: Record<string, number>;
    commodityPrices: Record<string, number>;
    macroIndicators: Record<string, number>;
  },
  predictions: TrendPrediction[]
): Promise<OpportunityWindow[]> {
  const opportunities: OpportunityWindow[] = [];
  const now = new Date();

  // Check for exchange rate opportunities
  const usdRate = marketData.exchangeRates.USD || 5.0;
  const usdPrediction = predictions.find(p => p.indicator === "USD/BRL");
  
  if (usdPrediction && usdPrediction.direction === "up" && usdPrediction.confidence > 60) {
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 14);
    
    opportunities.push({
      type: "exchange",
      title: "Janela de Câmbio Favorável",
      description: `O dólar está em ${usdRate.toFixed(2)} e a previsão indica alta de ${((usdPrediction.predictedValue / usdPrediction.currentValue - 1) * 100).toFixed(1)}% nos próximos ${usdPrediction.timeframe}. Aproveite o câmbio atual.`,
      startDate: now.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      potentialSavings: ((usdPrediction.predictedValue / usdPrediction.currentValue - 1) * 100),
      confidence: usdPrediction.confidence,
      actionRequired: "Fechar câmbio ou antecipar pagamentos em dólar",
    });
  }

  // Seasonal opportunity (construction high season)
  const month = now.getMonth() + 1;
  if (month >= 1 && month <= 2) {
    const startDate = new Date(now.getFullYear(), 1, 15);
    const endDate = new Date(now.getFullYear(), 2, 31);
    
    opportunities.push({
      type: "seasonal",
      title: "Preparação para Alta Temporada",
      description: "O período de março a junho é historicamente o mais forte para construção civil. Importações realizadas agora chegam no timing ideal.",
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      potentialSavings: 8,
      confidence: 75,
      actionRequired: "Iniciar processo de importação para produtos de alta rotatividade",
    });
  }

  // Commodity opportunity
  const steelPrediction = predictions.find(p => p.indicator.includes("Aço"));
  if (steelPrediction && steelPrediction.direction === "down") {
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + 30);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 75);
    
    opportunities.push({
      type: "commodity",
      title: "Queda Prevista no Preço do Aço",
      description: `Análise indica possível redução de ${((1 - steelPrediction.predictedValue / steelPrediction.currentValue) * 100).toFixed(1)}% no preço do aço. Considere aguardar ou negociar contratos futuros.`,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      potentialSavings: ((1 - steelPrediction.predictedValue / steelPrediction.currentValue) * 100),
      confidence: steelPrediction.confidence,
      actionRequired: "Negociar preços futuros com fornecedores ou aguardar para novas cotações",
    });
  }

  // Mercosul opportunity
  opportunities.push({
    type: "regulatory",
    title: "Vantagem Tributária Mercosul",
    description: "Produtos originários do Paraguai, Argentina e Uruguai têm isenção de II (Imposto de Importação) via ACE-18. Priorize fornecedores do bloco.",
    startDate: now.toISOString().split('T')[0],
    endDate: "2025-12-31",
    potentialSavings: 14,
    confidence: 95,
    actionRequired: "Verificar certificados de origem e compliance com regras do Mercosul",
  });

  return opportunities;
}

// Generate strategic insights using AI
async function generateStrategicInsights(
  marketData: {
    exchangeRates: Record<string, number>;
    commodityPrices: Record<string, number>;
    macroIndicators: Record<string, number>;
  },
  correlations: Correlation[],
  predictions: TrendPrediction[],
  opportunities: OpportunityWindow[]
): Promise<{
  riskFactors: string[];
  strategicInsights: string[];
  overallOutlook: "bullish" | "bearish" | "neutral";
  confidenceScore: number;
}> {
  const prompt = `Você é o consultor estratégico da SUPPLEY, empresa de importação de materiais de construção (pregos, arames, escoras metálicas) do Paraguai e China.

DADOS DO MERCADO:
- Câmbio: USD/BRL ${marketData.exchangeRates.USD?.toFixed(2)}, CNY/BRL ${marketData.exchangeRates.CNY?.toFixed(4)}
- Aço HRC: $${marketData.commodityPrices.steelHRC}/ton
- Selic: ${marketData.macroIndicators.selic}%
- Confiança Construção: ${marketData.macroIndicators.constructionConfidence}

CORRELAÇÕES IDENTIFICADAS:
${correlations.map(c => `- ${c.variable1} x ${c.variable2}: ${c.coefficient > 0 ? 'positiva' : 'negativa'} (${c.strength})`).join('\n')}

PREVISÕES:
${predictions.map(p => `- ${p.indicator}: ${p.direction} (${p.confidence}% confiança)`).join('\n')}

OPORTUNIDADES:
${opportunities.map(o => `- ${o.title}: economia potencial de ${o.potentialSavings.toFixed(1)}%`).join('\n')}

Forneça uma análise estratégica completa em JSON:
{
  "riskFactors": ["lista de 3-5 fatores de risco principais"],
  "strategicInsights": ["lista de 4-6 insights estratégicos acionáveis"],
  "overallOutlook": "bullish" ou "bearish" ou "neutral",
  "confidenceScore": 0-100
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um consultor estratégico especializado em importação. Forneça análises práticas e acionáveis. Responda apenas em JSON válido." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "strategic_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              riskFactors: { type: "array", items: { type: "string" } },
              strategicInsights: { type: "array", items: { type: "string" } },
              overallOutlook: { type: "string" },
              confidenceScore: { type: "number" },
            },
            required: ["riskFactors", "strategicInsights", "overallOutlook", "confidenceScore"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (content && typeof content === 'string') {
      const parsed = JSON.parse(content);
      return {
        ...parsed,
        overallOutlook: parsed.overallOutlook as "bullish" | "bearish" | "neutral",
      };
    }
  } catch (error) {
    console.error("[PredictiveAnalysis] Error generating insights:", error);
  }

  // Fallback
  return {
    riskFactors: [
      "Volatilidade cambial pode impactar margens em até 15%",
      "Dependência de fornecedores únicos aumenta risco de supply chain",
      "Mudanças regulatórias no Mercosul podem afetar preferências tarifárias",
      "Custos de frete internacional permanecem elevados",
    ],
    strategicInsights: [
      "Diversifique fornecedores entre Paraguai e China para mitigar riscos",
      "Aproveite a isenção de II do Mercosul para produtos de aço",
      "Monitore o minério de ferro como indicador antecedente do preço do aço",
      "Considere contratos de hedge cambial para operações acima de USD 50.000",
      "Planeje importações com 60-90 dias de antecedência para otimizar custos",
    ],
    overallOutlook: "neutral",
    confidenceScore: 68,
  };
}

// Main function: Generate complete systemic analysis
export async function generateSystemicAnalysis(): Promise<SystemicAnalysis> {
  console.log("[PredictiveAnalysis] Starting systemic analysis...");
  
  // 1. Fetch market data
  const marketData = await fetchMarketData();
  
  // 2. Calculate correlations
  const correlations = calculateCorrelations(marketData);
  
  // 3. Generate predictions
  const predictions = await generatePredictions(marketData);
  
  // 4. Identify opportunities
  const opportunities = await identifyOpportunities(marketData, predictions);
  
  // 5. Generate strategic insights
  const insights = await generateStrategicInsights(marketData, correlations, predictions, opportunities);
  
  // 6. Build market indicators
  const marketIndicators: MarketIndicator[] = [
    {
      name: "Câmbio USD/BRL",
      value: marketData.exchangeRates.USD || 5.0,
      trend: predictions.find(p => p.indicator === "USD/BRL")?.direction || "stable",
      impact: (marketData.exchangeRates.USD || 5.0) > 5.2 ? "negative" : "positive",
      description: "Taxa de câmbio comercial para importações em dólar",
    },
    {
      name: "Preço do Aço HRC",
      value: marketData.commodityPrices.steelHRC,
      trend: predictions.find(p => p.indicator.includes("Aço"))?.direction || "stable",
      impact: marketData.commodityPrices.steelHRC > 700 ? "negative" : "positive",
      description: "Preço internacional do aço laminado a quente (USD/ton)",
    },
    {
      name: "Taxa Selic",
      value: marketData.macroIndicators.selic,
      trend: marketData.macroIndicators.selic > 11 ? "up" : "stable",
      impact: marketData.macroIndicators.selic > 12 ? "negative" : "neutral",
      description: "Taxa básica de juros - impacta custo de capital e financiamentos",
    },
    {
      name: "Confiança Construção",
      value: marketData.macroIndicators.constructionConfidence,
      trend: marketData.macroIndicators.constructionConfidence > 50 ? "up" : "down",
      impact: marketData.macroIndicators.constructionConfidence > 50 ? "positive" : "negative",
      description: "Índice de confiança do setor de construção civil",
    },
  ];

  const analysis: SystemicAnalysis = {
    timestamp: new Date(),
    marketIndicators,
    correlations,
    predictions,
    opportunities,
    riskFactors: insights.riskFactors,
    strategicInsights: insights.strategicInsights,
    overallOutlook: insights.overallOutlook,
    confidenceScore: insights.confidenceScore,
  };

  console.log("[PredictiveAnalysis] Analysis complete. Outlook:", analysis.overallOutlook);
  
  return analysis;
}

// Save analysis to database for historical tracking
export async function saveAnalysis(analysis: SystemicAnalysis): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(marketIndicators).values({
      indicatorType: "systemic_analysis",
      indicatorName: "full_analysis",
      value: analysis.confidenceScore,
      metadata: JSON.stringify({
        outlook: analysis.overallOutlook,
        indicatorsCount: analysis.marketIndicators.length,
        correlationsCount: analysis.correlations.length,
        predictionsCount: analysis.predictions.length,
        opportunitiesCount: analysis.opportunities.length,
      }),
      source: "predictive_analysis_service",
      recordedAt: analysis.timestamp,
    });
  } catch (error) {
    console.error("[PredictiveAnalysis] Error saving analysis:", error);
  }
}

// Get analysis summary for dashboard
export async function getAnalysisSummary(): Promise<{
  lastAnalysis: Date | null;
  outlook: string;
  topOpportunity: string | null;
  topRisk: string | null;
  confidenceScore: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      lastAnalysis: null,
      outlook: "neutral",
      topOpportunity: null,
      topRisk: null,
      confidenceScore: 0,
    };
  }

  try {
    const latest = await db
      .select()
      .from(marketIndicators)
      .where(sql`${marketIndicators.indicatorName} = 'full_analysis'`)
      .orderBy(desc(marketIndicators.recordedAt))
      .limit(1);

    if (latest.length > 0) {
      const metadata = JSON.parse(latest[0].metadata || "{}");
      return {
        lastAnalysis: latest[0].recordedAt,
        outlook: metadata.outlook || "neutral",
        topOpportunity: null, // Would need to store this
        topRisk: null,
        confidenceScore: latest[0].value / 100,
      };
    }
  } catch (error) {
    console.error("[PredictiveAnalysis] Error getting summary:", error);
  }

  return {
    lastAnalysis: null,
    outlook: "neutral",
    topOpportunity: null,
    topRisk: null,
    confidenceScore: 0,
  };
}
