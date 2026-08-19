import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getExchangeRate, SUPPORTED_CURRENCIES } from "../services/exchangeService";

export const exchangeRouter = router({
getRate: publicProcedure
  .input(z.object({
    from: z.string().length(3),
    to: z.string().length(3),
  }))
  .query(async ({ input }) => {
    const result = await getExchangeRate(input.from, input.to);
    return {
      rate: result.rate,
      source: result.source,
      timestamp: result.timestamp.toISOString(),
    };
  }),

getSupportedCurrencies: publicProcedure.query(() => SUPPORTED_CURRENCIES),
});
