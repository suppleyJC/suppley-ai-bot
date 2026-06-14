import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

import * as statePricingService from "../services/statePricingService";

export const statePricingRouter = router({
calculateForState: protectedProcedure
  .input(z.object({
    basePrice: z.number(),
    originState: z.string(),
    destinationState: z.string(),
    isImported: z.boolean(),
    icmsProprio: z.number().optional(),
    hasST: z.boolean().optional(),
    mvaPercent: z.number().optional(),
    additionalLogisticsCostPercent: z.number().optional(),
  }))
  .query(({ input }) => {
    return statePricingService.calculateStatePricing(input);
  }),

calculateForAllStates: protectedProcedure
  .input(z.object({
    basePrice: z.number(),
    originState: z.string(),
    isImported: z.boolean(),
    icmsProprio: z.number().optional(),
    hasST: z.boolean().optional(),
    mvaPercent: z.number().optional(),
  }))
  .query(({ input }) => {
    return statePricingService.calculateMultiStatePricing(input);
  }),

calculateDifal: publicProcedure
  .input(z.object({
    baseValue: z.number(),
    originState: z.string(),
    destinationState: z.string(),
    isImported: z.boolean(),
  }))
  .query(({ input }) => {
    return statePricingService.calculateDifal(input);
  }),

listAllStates: publicProcedure.query(() => {
  return statePricingService.listAllStatesWithPricing();
}),
});
