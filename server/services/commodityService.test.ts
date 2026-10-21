import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dataApi module
vi.mock("../_core/dataApi", () => ({
  makeDataApiRequest: vi.fn().mockResolvedValue({
    chart: {
      result: [{
        meta: {
          regularMarketPrice: 75.50,
          previousClose: 74.80,
          currency: "USD",
          symbol: "CL=F"
        },
        timestamp: [1717632000, 1717718400, 1717804800],
        indicators: {
          quote: [{
            close: [74.80, 75.20, 75.50],
            open: [74.50, 74.80, 75.10],
            high: [75.00, 75.40, 75.80],
            low: [74.30, 74.60, 75.00],
            volume: [100000, 120000, 110000]
          }]
        }
      }]
    }
  })
}));

// Mock db
vi.mock("../db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
  }),
}));

describe("Commodity Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Exports", () => {
    it("should export getAllCommodityPrices function", async () => {
      const service = await import("./commodityService");
      expect(service.getAllCommodityPrices).toBeDefined();
      expect(typeof service.getAllCommodityPrices).toBe("function");
    });

    it("should export getCurrentCommodityPrice function", async () => {
      const service = await import("./commodityService");
      expect(service.getCurrentCommodityPrice).toBeDefined();
      expect(typeof service.getCurrentCommodityPrice).toBe("function");
    });

    it("should export analyzeCommodityTrend function", async () => {
      const service = await import("./commodityService");
      expect(service.analyzeCommodityTrend).toBeDefined();
      expect(typeof service.analyzeCommodityTrend).toBe("function");
    });

    it("should export getRelevantCommodities function", async () => {
      const service = await import("./commodityService");
      expect(service.getRelevantCommodities).toBeDefined();
      expect(typeof service.getRelevantCommodities).toBe("function");
    });
  });

  describe("analyzeCommodityTrend", () => {
    it("should return trend analysis with direction for upward prices", async () => {
      const service = await import("./commodityService");
      const history = [
        { date: new Date("2026-06-06"), price: 88 },
        { date: new Date("2026-06-05"), price: 86 },
        { date: new Date("2026-06-04"), price: 84 },
        { date: new Date("2026-06-03"), price: 82 },
        { date: new Date("2026-06-02"), price: 80 },
        { date: new Date("2026-06-01"), price: 78 },
        { date: new Date("2026-05-31"), price: 76 },
        { date: new Date("2026-05-30"), price: 74 },
        { date: new Date("2026-05-29"), price: 72 },
        { date: new Date("2026-05-28"), price: 70 },
      ];
      const trend = service.analyzeCommodityTrend("oil", history);
      
      expect(trend).toBeDefined();
      expect(trend).toHaveProperty("trend");
      expect(["bullish", "bearish", "neutral"]).toContain(trend.trend);
      expect(trend).toHaveProperty("volatility");
      expect(trend).toHaveProperty("currentPrice");
      expect(trend.currentPrice).toBe(88);
    });

    it("should detect upward trend (bullish)", async () => {
      const service = await import("./commodityService");
      const history = Array.from({ length: 10 }, (_, i) => ({
        date: new Date(Date.now() - i * 86400000),
        price: 100 - i * 3, // Most recent is highest
      }));
      const trend = service.analyzeCommodityTrend("oil", history);
      expect(trend.trend).toBe("bullish");
    });

    it("should detect downward trend (bearish)", async () => {
      const service = await import("./commodityService");
      const history = Array.from({ length: 10 }, (_, i) => ({
        date: new Date(Date.now() - i * 86400000),
        price: 70 + i * 3, // Most recent is lowest
      }));
      const trend = service.analyzeCommodityTrend("oil", history);
      expect(trend.trend).toBe("bearish");
    });

    it("should handle insufficient data gracefully", async () => {
      const service = await import("./commodityService");
      const history = [{ date: new Date(), price: 75 }];
      const trend = service.analyzeCommodityTrend("oil", history);
      expect(trend).toBeDefined();
      expect(trend.trend).toBe("neutral");
    });
  });

  describe("getRelevantCommodities", () => {
    it("should return relevant commodities for steel NCM codes", async () => {
      const service = await import("./commodityService");
      const commodities = service.getRelevantCommodities("7208.51.00");
      
      expect(commodities).toBeDefined();
      expect(Array.isArray(commodities)).toBe(true);
      expect(commodities.length).toBeGreaterThan(0);
    });

    it("should return relevant commodities for electronics NCM codes", async () => {
      const service = await import("./commodityService");
      const commodities = service.getRelevantCommodities("8471.30.19");
      
      expect(commodities).toBeDefined();
      expect(Array.isArray(commodities)).toBe(true);
    });

    it("should return empty array for unknown NCM codes", async () => {
      const service = await import("./commodityService");
      const commodities = service.getRelevantCommodities("9999.99.99");
      
      expect(commodities).toBeDefined();
      expect(Array.isArray(commodities)).toBe(true);
    });
  });
});
