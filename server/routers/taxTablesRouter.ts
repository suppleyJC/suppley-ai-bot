import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as taxTableUpdateService from "../services/taxTableUpdateService";

export const taxTablesRouter = router({
getStats: protectedProcedure.query(async () => {
  return taxTableUpdateService.getTaxTableStats();
}),

checkForUpdates: protectedProcedure.query(async () => {
  return taxTableUpdateService.checkForTaxUpdates();
}),

updateNcmFromSiscomex: protectedProcedure.mutation(async () => {
  return taxTableUpdateService.updateNcmFromSiscomex();
}),

updateNcmRates: protectedProcedure
  .input(z.object({
    ncmCode: z.string(),
    iiRate: z.number().optional(),
    ipiRate: z.number().optional(),
    pisRate: z.number().optional(),
    cofinsRate: z.number().optional(),
    mercosulIiRate: z.number().optional(),
    source: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const { ncmCode, source, ...rates } = input;
    return taxTableUpdateService.updateNcmRates(ncmCode, rates, source);
  }),

getNcmHistory: protectedProcedure
  .input(z.object({ ncmCode: z.string() }))
  .query(async ({ input }) => {
    return taxTableUpdateService.getNcmRateHistory(input.ncmCode);
  }),

getDefaultIIRate: publicProcedure
  .input(z.object({ ncmCode: z.string() }))
  .query(({ input }) => {
    return {
      ncmCode: input.ncmCode,
      iiRate: taxTableUpdateService.getDefaultIIRate(input.ncmCode),
      ipiRate: taxTableUpdateService.getDefaultIPIRate(input.ncmCode),
    };
  }),
});
