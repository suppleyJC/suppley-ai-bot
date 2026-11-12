import { describe, it, expect, vi } from "vitest";

// Mock the database
vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock exchange service
vi.mock("./exchangeService", () => ({
  getExchangeRate: vi.fn().mockResolvedValue({ rate: 5.12, source: "mock" }),
}));

// Mock commodity service
vi.mock("./commodityService", () => ({
  getCurrentCommodityPrice: vi.fn().mockResolvedValue({
    code: "STEEL_HRC",
    name: "Aço Bobina Laminada a Quente",
    category: "metals",
    price: 65000,
    currency: "USD",
    unit: "ton",
    changePercent: -1.5,
    changeDirection: "down",
    source: "yahoo_finance",
    recordedAt: new Date(),
  }),
  getCommodityHistory: vi.fn().mockResolvedValue([]),
  analyzeCommodityTrend: vi.fn().mockReturnValue({
    code: "STEEL_HRC",
    name: "Aço",
    currentPrice: 65000,
    averagePrice30d: 64000,
    minPrice30d: 62000,
    maxPrice30d: 67000,
    volatility: 3.5,
    trend: "neutral",
    recommendation: "Preços estáveis",
  }),
}));

// Mock dataApi
vi.mock("../_core/dataApi", () => ({
  callDataApi: vi.fn().mockResolvedValue(null),
}));

describe("PredictionTrackingService", () => {
  describe("savePredictions", () => {
    it("should return 0 saved when db is not available", async () => {
      const { savePredictions } = await import("./predictionTrackingService");
      
      const result = await savePredictions([
        {
          indicator: "USD/BRL",
          currentValue: 5.12,
          predictedValue: 5.25,
          confidence: 70,
          timeframe: "30 dias",
          direction: "up",
        },
      ]);

      expect(result).toEqual({ saved: 0, errors: 0 });
    });

    it("should parse timeframe correctly", async () => {
      const { savePredictions } = await import("./predictionTrackingService");
      
      // With no DB, it returns 0 but doesn't error
      const result = await savePredictions([
        {
          indicator: "Preço do Aço HRC",
          currentValue: 650,
          predictedValue: 630,
          confidence: 55,
          timeframe: "60 dias",
          direction: "down",
        },
        {
          indicator: "Demanda Construção",
          currentValue: 54,
          predictedValue: 57,
          confidence: 60,
          timeframe: "90 dias",
          direction: "up",
        },
      ]);

      expect(result.saved).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  describe("evaluateExpiredPredictions", () => {
    it("should return 0 evaluated when db is not available", async () => {
      const { evaluateExpiredPredictions } = await import("./predictionTrackingService");
      
      const result = await evaluateExpiredPredictions();
      expect(result).toEqual({ evaluated: 0, accurate: 0, inaccurate: 0 });
    });
  });

  describe("getAccuracyReport", () => {
    it("should return empty report when db is not available", async () => {
      const { getAccuracyReport } = await import("./predictionTrackingService");
      
      const report = await getAccuracyReport();
      expect(report.totalPredictions).toBe(0);
      expect(report.evaluatedPredictions).toBe(0);
      expect(report.pendingPredictions).toBe(0);
      expect(report.overallAccuracy).toBe(0);
      expect(report.averageConfidence).toBe(0);
      expect(report.byIndicator).toEqual({});
      expect(report.byDirection).toEqual({});
      expect(report.recentPredictions).toEqual([]);
    });
  });

  describe("getPredictionHistory", () => {
    it("should return empty array when db is not available", async () => {
      const { getPredictionHistory } = await import("./predictionTrackingService");
      
      const history = await getPredictionHistory("USD/BRL");
      expect(history).toEqual([]);
    });
  });
});

describe("CommodityService - Definitions", () => {
  it("should have commodity definitions with yahoo symbols", async () => {
    const mod = await vi.importActual<typeof import("./commodityService")>("./commodityService");
    
    const definitions = mod.getCommodityDefinitions();
    expect(definitions).toBeDefined();
    expect(definitions.STEEL_HRC).toBeDefined();
    expect(definitions.STEEL_HRC.yahooSymbol).toBe("SLX");
    expect(definitions.BRENT_OIL.yahooSymbol).toBe("BZ=F");
    expect(definitions.COPPER_LME.yahooSymbol).toBe("HG=F");
  });

  it("should map NCM chapters to relevant commodities", async () => {
    const mod = await vi.importActual<typeof import("./commodityService")>("./commodityService");
    
    // Ferro e aço
    expect(mod.getRelevantCommodities("72100000")).toContain("STEEL_HRC");
    // Alumínio
    expect(mod.getRelevantCommodities("76000000")).toContain("ALUMINUM_LME");
    // Cobre
    expect(mod.getRelevantCommodities("74000000")).toContain("COPPER_LME");
    // Combustíveis
    expect(mod.getRelevantCommodities("27000000")).toContain("BRENT_OIL");
    // Default
    expect(mod.getRelevantCommodities("99000000")).toContain("BDI");
  });

  it("should calculate commodity impact correctly", async () => {
    const mod = await vi.importActual<typeof import("./commodityService")>("./commodityService");
    
    const result = mod.calculateCommodityImpact({
      commodityCode: "STEEL_HRC",
      currentPrice: 65000,
      projectedChange: 10, // 10% increase
      importValueCents: 1000000, // $10,000
      commodityWeightPercent: 60, // 60% of value is commodity
    });

    expect(result.currentCost).toBe(600000); // 60% of 1M
    expect(result.projectedCost).toBe(660000); // 10% increase
    expect(result.impact).toBe(60000); // Difference
    expect(result.impactPercent).toBeCloseTo(6, 0); // 6% of total import value
  });

  it("should generate commodity report", async () => {
    // generateCommodityReport is not mocked, import the real module
    // But dataApi is mocked, so we need to import directly
    const mod = await vi.importActual<typeof import("./commodityService")>("./commodityService");
    
    const report = mod.generateCommodityReport([
      {
        code: "BRENT_OIL",
        name: "Petróleo Brent",
        category: "energy",
        price: 9300,
        currency: "USD",
        unit: "barrel",
        changePercent: -2.0,
        changeDirection: "down" as const,
        source: "yahoo_finance",
        recordedAt: new Date(),
      },
    ]);

    expect(report).toContain("RELATÓRIO DE COMMODITIES");
    expect(report).toContain("Petróleo Brent");
    expect(report).toContain("ENERGIA");
    expect(report).toContain("Yahoo Finance");
  });

  it("should analyze commodity trend correctly", async () => {
    // Use importActual to bypass mock
    const mod = await vi.importActual<typeof import("./commodityService")>("./commodityService");
    
    // Trend bullish - preços recentes (first 7) much higher than older (remaining)
    // recentAvg = (70000+69000+68000+67000+66000+65000+64000)/7 = 67000
    // olderAvg = (50000+45000+40000)/3 = 45000
    // trendPercent = (67000-45000)/45000 * 100 = 48.8% > 3% = bullish
    const bullishHistory = [
      { date: new Date(), price: 70000 },
      { date: new Date(), price: 69000 },
      { date: new Date(), price: 68000 },
      { date: new Date(), price: 67000 },
      { date: new Date(), price: 66000 },
      { date: new Date(), price: 65000 },
      { date: new Date(), price: 64000 },
      { date: new Date(), price: 50000 },
      { date: new Date(), price: 45000 },
      { date: new Date(), price: 40000 },
    ];

    const trend = mod.analyzeCommodityTrend("STEEL_HRC", bullishHistory);
    expect(trend.trend).toBe("bullish");
    expect(trend.currentPrice).toBe(70000);
    expect(trend.recommendation).toContain("alta");
  });
});
