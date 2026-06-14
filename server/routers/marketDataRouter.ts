import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as marketDataService from "../services/marketDataService";

export const marketDataRouter = router({
// Buscar indicadores de mercado atuais
getIndicators: publicProcedure.query(async () => {
  return marketDataService.getAllMarketQuotes();
}),

// Buscar indicadores salvos no banco
getLatest: publicProcedure.query(async () => {
  return marketDataService.getLatestMarketIndicators();
}),

// Buscar histórico de um indicador
getHistory: publicProcedure
  .input(z.object({ symbol: z.string(), days: z.number().optional() }))
  .query(async ({ input }) => {
    return marketDataService.getMarketHistory(input.symbol, input.days);
  }),

// Gerar insights de mercado com IA
generateInsights: protectedProcedure.mutation(async () => {
  const data = await marketDataService.getAllMarketQuotes();
  const insights = await marketDataService.generateMarketInsights(data);
  await marketDataService.saveMarketInsights(insights);
  return { insights };
}),

// Buscar insights recentes
getInsights: publicProcedure
  .input(z.object({ days: z.number().optional() }).optional())
  .query(async ({ input }) => {
    return marketDataService.getRecentInsights(input?.days);
  }),

// Atualizar dados de mercado e salvar no banco
refresh: protectedProcedure.mutation(async () => {
  const data = await marketDataService.getAllMarketQuotes();
  await marketDataService.saveMarketIndicators(data);
  return { count: data.length, updatedAt: new Date() };
}),
});
