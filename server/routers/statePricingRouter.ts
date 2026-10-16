import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

import * as statePricingService from "../services/statePricingService";
import { compareImportRoutes } from "../services/interstateStrategyService";

export const statePricingRouter = router({
// Comparador de rotas de importação: direta vs. via estado-hub com benefício.
compararRotasImportacao: protectedProcedure
  .input(z.object({
    hubState: z.string().length(2),
    destinationState: z.string().length(2),
    baseIcmsCents: z.number().int().nonnegative(),
    valorSaidaCents: z.number().int().nonnegative().optional(),
    modelo: z.enum(["trading_revenda", "transferencia_filial"]).default("trading_revenda"),
    destinatarioCreditaIcms: z.boolean().default(true),
    etapaFinal: z.enum(["consumidor_final", "revenda_contribuinte"]).default("revenda_contribuinte"),
    hubAntecipadoBpOverride: z.number().int().optional(),
  }))
  .query(({ input }) => compareImportRoutes(input)),

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
