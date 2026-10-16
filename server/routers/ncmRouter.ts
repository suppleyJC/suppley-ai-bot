import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import * as ncmService from "../services/ncmService";
import { getDb } from "../db";
import { ncmTaxRates } from "../../drizzle/schema";
import { sql } from "drizzle-orm";

export const ncmRouter = router({
get: publicProcedure
  .input(z.object({ code: z.string() }))
  .query(async ({ input }) => {
    return db.getNcmTaxRate(input.code);
  }),

list: publicProcedure.query(async () => {
  return db.getAllNcmTaxRates();
}),

// Search NCMs by code or description
search: publicProcedure
  .input(z.object({
    query: z.string(),
    limit: z.number().optional().default(20),
  }))
  .query(async ({ input }) => {
    return ncmService.searchNCMs(input.query, input.limit);
  }),

// Get NCM by code (detailed)
getByCode: publicProcedure
  .input(z.object({ ncmCode: z.string() }))
  .query(async ({ input }) => {
    return ncmService.getNCMByCode(input.ncmCode);
  }),

// AI-powered NCM suggestion with tax optimization
// Using publicProcedure to allow suggestions during calculation flow
suggestWithAI: publicProcedure
  .input(z.object({
    productName: z.string(),
    productDescription: z.string().optional(),
  }))
  .query(async ({ input }) => {
    return ncmService.suggestNCMWithAI(input.productName, input.productDescription);
  }),

// Compare tax rates between NCMs
compareRates: publicProcedure
  .input(z.object({ ncmCodes: z.array(z.string()) }))
  .query(async ({ input }) => {
    return ncmService.compareNCMRates(input.ncmCodes);
  }),

// Get NCM database statistics
getStats: publicProcedure.query(async () => {
  return ncmService.getNCMStats();
}),

// Import NCMs from Siscomex file
importFromSiscomex: protectedProcedure
  .input(z.object({ filePath: z.string().optional() }))
  .mutation(async ({ input }) => {
    return ncmService.importNCMsFromSiscomex(input.filePath);
  }),

// Batch AI NCM suggestion (multiple products at once)
suggestBatch: publicProcedure
  .input(z.object({
    products: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
    })).max(20),
  }))
  .mutation(async ({ input }) => {
    const resultMap = await ncmService.suggestNCMBatch(input.products);
    // Convert Map to array for serialization
    return input.products.map(p => ({
      productName: p.name,
      result: resultMap.get(p.name) || null,
    }));
  }),

// Clear NCM caches (admin)
clearCache: protectedProcedure.mutation(async () => {
  ncmService.clearNCMCaches();
  return { success: true, message: "Caches limpos com sucesso" };
}),

// Import NCMs from uploaded file
importFromFile: protectedProcedure
  .input(z.object({
    fileContent: z.string(),
    fileType: z.enum(["json", "csv"]),
  }))
  .mutation(async ({ input }) => {
    return ncmService.importNCMsFromFile(input.fileContent, input.fileType);
  }),

// Diagnose NCM data in database
diagnose: publicProcedure.query(async () => {
  try {
    // Check connection
    const dbInstance = await getDb();
    if (!dbInstance) {
      return {
        ok: false,
        message: "Não conseguiu conectar ao banco",
        total: 0,
        ncm73084000: null,
      };
    }

    // Get total count
    const totalResult = await dbInstance
      .select({ count: sql<number>`count(*)` })
      .from(ncmTaxRates);
    const total = Number(totalResult[0]?.count || 0);

    // Check specific NCM
    const ncm = await db.getNcmTaxRate("73084000");

    return {
      ok: true,
      message: `Banco conectado: ${total} NCMs carregados`,
      total,
      ncm73084000: ncm ? {
        ncmCode: ncm.ncmCode,
        description: ncm.description?.substring(0, 80),
        iiRate: ncm.iiRate,
        ipiRate: ncm.ipiRate,
        notes: ncm.notes,
      } : null,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Erro: ${String(error)}`,
      total: 0,
      ncm73084000: null,
    };
  }
}),
});
