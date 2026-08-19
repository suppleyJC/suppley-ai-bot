import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as commodityService from "../services/commodityService";

export const commoditiesRouter = router({
  getAll: publicProcedure.query(async () => {
    return commodityService.getAllCommodityPrices();
  }),

  getByCategory: publicProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      return commodityService.getCommodityPricesByCategory(input.category);
    }),

  getPrice: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      return commodityService.getCurrentCommodityPrice(input.code);
    }),

  getRelevantForNcm: publicProcedure
    .input(z.object({ ncmCode: z.string() }))
    .query(async ({ input }) => {
      const codes = commodityService.getRelevantCommodities(input.ncmCode);
      const results = await Promise.all(
        codes.map(code => commodityService.getCurrentCommodityPrice(code))
      );
      return results.filter(Boolean);
    }),

  getHistory: publicProcedure
    .input(z.object({
      code: z.string(),
      days: z.number().optional().default(30),
    }))
    .query(async ({ input }) => {
      return commodityService.getCommodityHistory(input.code, input.days);
    }),

  getTrend: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const history = await commodityService.getCommodityHistory(input.code, 30);
      return commodityService.analyzeCommodityTrend(input.code, history);
    }),

  refresh: protectedProcedure.mutation(async () => {
    return commodityService.refreshAndSaveAllPrices();
  }),

  calculateImpact: publicProcedure
    .input(z.object({
      commodityCode: z.string(),
      currentPrice: z.number(),
      projectedChange: z.number(),
      importValueCents: z.number(),
      commodityWeightPercent: z.number(),
    }))
    .query(({ input }) => {
      return commodityService.calculateCommodityImpact(input);
    }),
});
