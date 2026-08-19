import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as priceComparisonService from "../services/priceComparisonService";
import * as autoSupplierService from "../services/autoSupplierService";

export const priceComparisonRouter = router({
// Buscar melhor preço para um produto
getBestPrice: protectedProcedure
  .input(z.object({ productName: z.string() }))
  .query(async ({ ctx, input }) => {
    return priceComparisonService.getBestPriceForProduct(ctx.user.id, input.productName);
  }),

// Comparar preços entre fornecedores
compareProduct: protectedProcedure
  .input(z.object({ productName: z.string() }))
  .query(async ({ ctx, input }) => {
    return priceComparisonService.compareProductPrices(ctx.user.id, input.productName);
  }),

// Histórico de preços de um produto
getHistory: protectedProcedure
  .input(z.object({ productName: z.string(), limit: z.number().optional() }))
  .query(async ({ ctx, input }) => {
    return priceComparisonService.getPriceHistory(ctx.user.id, input.productName, input.limit);
  }),

// Todos os melhores preços do usuário
getAllBestPrices: protectedProcedure
  .query(async ({ ctx }) => {
    return priceComparisonService.getAllBestPrices(ctx.user.id);
  }),

// Registrar preço manualmente
registerPrice: protectedProcedure
  .input(z.object({
    supplierId: z.number(),
    quotationId: z.number().optional(),
    productName: z.string(),
    ncmCode: z.string().optional(),
    sku: z.string().optional(),
    unitPriceCents: z.number(),
    currency: z.string(),
    unit: z.string(),
    unitPriceBrlCents: z.number(),
    exchangeRate: z.number(),
    quantity: z.number().optional(),
    incoterm: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const priceId = await priceComparisonService.registerSupplierPrice({
      userId: ctx.user.id,
      ...input,
    });
    return { priceId };
  }),

// Processar cotação completa (fornecedor + preços)
processQuotation: protectedProcedure
  .input(z.object({
    quotationId: z.number(),
    quotationText: z.string(),
    supplierName: z.string().optional(),
    supplierCountry: z.string().optional(),
    products: z.array(z.object({
      name: z.string(),
      ncmCode: z.string().optional(),
      sku: z.string().optional(),
      unitPriceCents: z.number(),
      currency: z.string(),
      unit: z.string(),
      quantity: z.number(),
    })),
    exchangeRate: z.number(),
  }))
  .mutation(async ({ ctx, input }) => {
    return autoSupplierService.processFullQuotation(
      ctx.user.id,
      input.quotationId,
      input.quotationText,
      input.supplierName,
      input.supplierCountry,
      input.products,
      input.exchangeRate
    );
  }),
});
