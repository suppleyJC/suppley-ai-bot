/**
 * Proforma Router — API da porta de entrada estruturada da Excambia.
 *
 * Fluxo: extract (IA) → create → distribute (base) → list/get
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as proformaService from "../services/proformaService";

const itemSchema = z.object({
  productName: z.string().min(1),
  ncmCode: z.string().optional(),
  quantity: z.number().int().positive(),
  unit: z.string().default("UN"),
  unitPriceCents: z.number().int().nonnegative(),
});

export const proformaRouter = router({
  // 1) Extrai dados de um PDF/imagem de proforma (não persiste)
  extract: protectedProcedure
    .input(
      z.object({
        fileUrl: z.string().min(1),
        mimeType: z.string(),
        supplierName: z.string().optional(),
        expectedProducts: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await proformaService.extractProformaFromFile(input.fileUrl, input.mimeType, {
          supplierName: input.supplierName,
          expectedProducts: input.expectedProducts,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao extrair proforma: ${error instanceof Error ? error.message : "desconhecido"}`,
        });
      }
    }),

  // 2) Cria a proforma (manual ou a partir da extração revisada)
  create: protectedProcedure
    .input(
      z.object({
        tipo: z.enum(["proforma", "invoice"]).optional(),
        supplierName: z.string().optional(),
        supplierCountry: z.string().optional(),
        supplierEmail: z.string().optional(),
        supplierPhone: z.string().optional(),
        currency: z.string().default("USD"),
        incoterm: z.string().optional(),
        paymentTerms: z.string().optional(),
        leadTimeDays: z.number().optional(),
        moq: z.number().optional(),
        totalFobCents: z.number().optional(),
        quotationDate: z.string().optional(), // ISO 8601: YYYY-MM-DD
        items: z.array(itemSchema).min(1, "Inclua ao menos um item"),
        fileUrl: z.string().optional(),
        fileName: z.string().optional(),
        documentoId: z.number().optional(),
        operacaoId: z.number().optional(),
        rfqId: z.number().optional(),
        extractionConfidence: z.number().optional(),
        rawExtraction: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return proformaService.createProforma(ctx.user.id, input);
    }),

  // 3) Distribui a proforma para a base (fornecedor + produtos)
  distribute: protectedProcedure
    .input(z.object({ proformaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await proformaService.distributeProformaToBase(ctx.user.id, input.proformaId);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao distribuir proforma: ${error instanceof Error ? error.message : "desconhecido"}`,
        });
      }
    }),

  // 4) Lista proformas
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), industriaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return proformaService.listProformas(ctx.user.id, input);
    }),

  // 5) Detalhe (proforma + itens)
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const detail = await proformaService.getProformaDetail(ctx.user.id, input.id);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND" });
      return detail;
    }),
});
