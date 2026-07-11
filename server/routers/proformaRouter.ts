/**
 * Proforma Router — API da porta de entrada estruturada da Excambia.
 *
 * Fluxo: extract (IA) → create → distribute (base) → list/get
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as proformaService from "../services/proformaService";
import * as priceHistoryService from "../services/proformaPriceHistoryService";
import { startExtractionJob, getExtractionJob } from "../services/extractionJobService";

const itemSchema = z.object({
  productName: z.string().min(1),
  description: z.string().optional(),
  ncmCode: z.string().optional(),
  // Cotações por peso têm quantidade fracionada (24,5 t) — coluna DOUBLE (0042).
  quantity: z.number().positive(),
  unit: z.string().default("UN"),
  // null = item cotado SEM preço (entra na base sinalizado, fora do histórico)
  unitPriceCents: z
    .number()
    .nonnegative()
    .nullable()
    .transform((v) => (v == null ? null : Math.round(v))),
});

export const proformaRouter = router({
  // 1) Extrai dados de um PDF/imagem de proforma (não persiste)
  extract: protectedProcedure
    .input(
      z.object({
        fileUrl: z.string().min(1),
        mimeType: z.string(),
        // Nome original — decide o parser (planilha/docx/texto) pela extensão.
        fileName: z.string().optional(),
        supplierName: z.string().optional(),
        expectedProducts: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await proformaService.extractProformaFromFile(input.fileUrl, input.mimeType, {
          supplierName: input.supplierName,
          expectedProducts: input.expectedProducts,
          fileName: input.fileName,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao extrair proforma: ${error instanceof Error ? error.message : "desconhecido"}`,
        });
      }
    }),

  // 1b) Extração ASSÍNCRONA (job + polling) — imune a timeout de proxy.
  // Arquivos grandes levam minutos para extrair; segurar uma requisição
  // aberta esse tempo todo derruba no nginx (504). O start devolve na hora
  // e o status é consultado em chamadas curtas.
  extractStart: protectedProcedure
    .input(
      z.object({
        fileUrl: z.string().min(1),
        mimeType: z.string(),
        fileName: z.string().optional(),
        supplierName: z.string().optional(),
        expectedProducts: z.array(z.string()).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const jobId = startExtractionJob(ctx.user.id, input.fileUrl, input.mimeType, {
        supplierName: input.supplierName,
        expectedProducts: input.expectedProducts,
        fileName: input.fileName,
      });
      return { jobId };
    }),

  extractStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ ctx, input }) => {
      const job = getExtractionJob(ctx.user.id, input.jobId);
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extração não encontrada (expirou ou o servidor reiniciou). Reenvie o arquivo.",
        });
      }
      return { status: job.status, result: job.result, error: job.error };
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
        supplierSector: z.string().optional(),
        currency: z.string().default("USD"),
        incoterm: z.string().optional(),
        paymentTerms: z.string().optional(),
        leadTimeDays: z.number().optional(),
        moq: z.number().optional(),
        totalFobCents: z.number().optional(),
        quotationDate: z.string().optional(), // ISO 8601: YYYY-MM-DD
        items: z.array(itemSchema).min(1, "Inclua ao menos um item"),
        fileUrl: z.string().optional(),
        // Chave permanente no storage (S3) — link re-assinável a qualquer momento
        fileKey: z.string().optional(),
        fileName: z.string().optional(),
        documentoId: z.number().optional(),
        operacaoId: z.number().optional(),
        rfqId: z.number().optional(),
        extractionConfidence: z.number().optional(),
        rawExtraction: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await proformaService.createProforma(ctx.user.id, input);
      } catch (error) {
        // A causa REAL precisa chegar à tela (schema drift, dado inválido…),
        // senão o save falha com um "erro interno" genérico e indiagnosticável.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao salvar proforma: ${error instanceof Error ? error.message : "desconhecido"}`,
        });
      }
    }),

  // 2b) Atualiza uma proforma existente (edição do rascunho) + reescreve itens
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        supplierName: z.string().optional(),
        supplierCountry: z.string().optional(),
        supplierEmail: z.string().optional(),
        supplierPhone: z.string().optional(),
        supplierSector: z.string().optional(),
        currency: z.string().default("USD"),
        incoterm: z.string().optional(),
        paymentTerms: z.string().optional(),
        leadTimeDays: z.number().optional(),
        moq: z.number().optional(),
        quotationDate: z.string().optional(),
        items: z.array(itemSchema).min(1, "Inclua ao menos um item"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      try {
        return await proformaService.updateProforma(ctx.user.id, id, rest);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao atualizar proforma: ${error instanceof Error ? error.message : "desconhecido"}`,
        });
      }
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

  // 3b) Exclui a proforma + os produtos que ela originou (cascata para a base)
  delete: protectedProcedure
    .input(z.object({ proformaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await proformaService.deleteProformaWithProducts(ctx.user.id, input.proformaId);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao excluir proforma: ${error instanceof Error ? error.message : "desconhecido"}`,
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

  // 6) Histórico cronológico de preço de um produto (todos os fornecedores)
  //    + custo nacionalizado estimado ("posto no Brasil há época")
  productPriceHistory: protectedProcedure
    .input(z.object({ productName: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return priceHistoryService.getProductPriceHistory(ctx.user.id, input.productName);
    }),

  // 7) Catálogo do fornecedor: produtos cotados + reajustes ao longo do tempo
  supplierCatalog: protectedProcedure
    .input(z.object({ industriaId: z.number() }))
    .query(async ({ ctx, input }) => {
      return priceHistoryService.getSupplierCatalog(ctx.user.id, input.industriaId);
    }),
});
