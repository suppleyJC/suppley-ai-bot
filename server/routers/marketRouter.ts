/**
 * Market Intelligence Router — endpoints PARALELOS (não alteram os existentes).
 *
 * Registro em server/routers.ts:
 *   import { marketRouter } from "./routers/marketRouter";
 *   ... em appRouter: market: marketRouter,
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  getPriceBenchmark, compareQuoteToMarket, getPriceTrend,
} from "../services/marketData/marketReferenceService";
import { tradeData } from "../services/tradeData";
import { gerarInsights } from "../services/marketIntelligenceService";
import { avaliarJanelaCompra } from "../services/purchaseTimingService";
import { consultarComexPorNcm } from "../services/comexStatService";

export const marketRouter = router({
  /**
   * Inteligência de decisão (painel): sinais oficiais (BCB câmbio · FRED
   * commodities · IBGE inflação), insights e a JANELA DE COMPRA (preditiva).
   */
  intelligence: protectedProcedure.query(async () => {
    const { sinais, insights } = await gerarInsights();
    const timing = avaliarJanelaCompra(sinais);
    return { sinais, insights, timing };
  }),

  /** Estatísticas oficiais do Comex Stat (MDIC/SECEX) por NCM. */
  comex: protectedProcedure
    .input(z.object({
      ncm: z.string().min(2),
      fluxo: z.enum(["import", "export"]).optional(),
    }))
    .query(({ input }) => consultarComexPorNcm({ ncm: input.ncm, fluxo: input.fluxo })),

  /** Benchmark de preço por NCM (lê tabelas tratadas; rápido). */
  benchmark: protectedProcedure
    .input(z.object({
      ncm: z.string().min(6),
      flow: z.enum(["import", "export"]).optional(),
      countryCode: z.string().optional(),
    }))
    .query(({ input }) => getPriceBenchmark(input.ncm, { flow: input.flow, countryCode: input.countryCode })),

  /** Compara uma cotação recebida com a média de mercado. */
  compareQuote: protectedProcedure
    .input(z.object({
      ncm: z.string().min(6),
      unitPriceUsd: z.number().positive(),
      unitWeightKg: z.number().positive(),
      countryCode: z.string().optional(),
    }))
    .query(({ input }) =>
      compareQuoteToMarket(input.ncm, input.unitPriceUsd, input.unitWeightKg, input.countryCode)),

  /** Série temporal de preço/kg (tendência e sazonalidade). */
  trend: protectedProcedure
    .input(z.object({ ncm: z.string().min(6), since: z.string().optional() }))
    .query(({ input }) => getPriceTrend(input.ncm, input.since)),

  /** Status das integrações (para tela de Configurações). */
  providers: protectedProcedure.query(() => ({
    paidActive: tradeData.paidLayerActive(),
    providers: tradeData.listProviders(),
  })),

  /** Busca de fornecedores — usa camada paga se configurada. */
  findSuppliers: protectedProcedure
    .input(z.object({
      hsCode: z.string().min(4),
      originCountry: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
    }))
    .query(({ input }) =>
      tradeData.findSuppliers(input.hsCode, { originCountry: input.originCountry, limit: input.limit })),

  /** Busca de embarques — pago (nível embarque) ou agregado oficial. */
  searchShipments: protectedProcedure
    .input(z.object({
      hsCode: z.string().optional(),
      productText: z.string().optional(),
      originCountry: z.string().optional(),
      destinationCountry: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
    }))
    .query(({ input }) => tradeData.searchShipments(input)),
});
