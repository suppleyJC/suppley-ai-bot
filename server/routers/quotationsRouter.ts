import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import { generateQuotationReport } from "../services/pdfReportService";
import { generateExcelReport } from "../services/excelReportService";
import { storagePut } from "../storage";

export const quotationsRouter = router({
list: protectedProcedure
  .input(z.object({ limit: z.number().default(50), status: z.string().optional() }).optional())
  .query(async ({ ctx, input }) => {
    if (input?.status) {
      return db.getQuotationsByStatus(ctx.user.id, input.status);
    }
    return db.getQuotationsByUser(ctx.user.id, input?.limit ?? 50);
  }),

get: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const quotation = await db.getQuotationById(input.id, ctx.user.id);
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND" });
    
    // Get associated calculations
    const calculations = await db.getCalculationsByQuotation(input.id, ctx.user.id);
    
    return { ...quotation, calculations };
  }),

create: protectedProcedure
  .input(z.object({
    quotationNumber: z.string().optional(),
    supplierName: z.string().optional(),
    supplierCountry: z.string().optional(),
    supplierId: z.number().optional(),
    quotationFileUrl: z.string().optional(),
    quotationFileKey: z.string().optional(),
    quotationFileName: z.string().optional(),
    currency: z.string().length(3).default("USD"),
    exchangeRate: z.number().optional(),
    originCountry: z.string().optional(),
    destinationState: z.string().length(2).default("SC"),
    isMercosul: z.boolean().default(false),
    freightCents: z.number().default(0),
    insuranceCents: z.number().default(0),
    customsBrokerCents: z.number().default(0),
    storageCents: z.number().default(0),
    otherCostsCents: z.number().default(0),
    markupPercent: z.number().default(3000),
    notes: z.string().optional(),
    quotationDate: z.date().optional(),
    validUntil: z.date().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return db.createQuotation({ ...input, userId: ctx.user.id });
  }),

update: protectedProcedure
  .input(z.object({
    id: z.number(),
    quotationNumber: z.string().optional(),
    supplierName: z.string().optional(),
    supplierCountry: z.string().optional(),
    supplierId: z.number().optional(),
    status: z.enum(["draft", "analyzing", "viable", "not_viable", "negotiating", "approved", "ordered", "shipped", "customs", "nationalized", "completed", "cancelled"]).optional(),
    notes: z.string().optional(),
    aiAnalysis: z.string().optional(),
    viabilityScore: z.number().optional(),
    totalFobCents: z.number().optional(),
    totalCifCents: z.number().optional(),
    totalTaxesCents: z.number().optional(),
    totalCostCents: z.number().optional(),
    totalSuggestedPriceCents: z.number().optional(),
    orderDate: z.date().optional(),
    shipmentDate: z.date().optional(),
    estimatedArrival: z.date().optional(),
    customsClearanceDate: z.date().optional(),
    completionDate: z.date().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    
    // Get current quotation to check status change
    const currentQuotation = await db.getQuotationById(id, ctx.user.id);
    const previousStatus = currentQuotation?.status;
    
    // Update quotation
    const updated = await db.updateQuotation(id, ctx.user.id, data);
    
    // Send notification if status changed
    if (data.status && previousStatus && data.status !== previousStatus) {
      const { notifyQuotationStatusChange, shouldNotifyStatusChange } = await import("../services/quotationNotificationService");
      
      if (shouldNotifyStatusChange(previousStatus, data.status)) {
        // Fire and forget - don't block the response
        notifyQuotationStatusChange({
          quotationId: id,
          quotationNumber: currentQuotation?.quotationNumber || undefined,
          supplierName: currentQuotation?.supplierName || undefined,
          previousStatus,
          newStatus: data.status,
          changedBy: ctx.user.name || ctx.user.openId || undefined,
          totalValue: currentQuotation?.totalCostCents || undefined,
        }).catch((err: unknown) => console.error("[Notification] Failed:", err));
      }
    }
    
    return updated;
  }),

delete: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return db.deleteQuotation(input.id, ctx.user.id);
  }),

stats: protectedProcedure.query(async ({ ctx }) => {
  return db.getQuotationStats(ctx.user.id);
}),

getCalculations: protectedProcedure
  .input(z.object({ quotationId: z.number() }))
  .query(async ({ ctx, input }) => {
    return db.getCalculationsByQuotation(input.quotationId, ctx.user.id);
  }),

generateReport: protectedProcedure
  .input(z.object({ quotationId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    // Get quotation data
    const quotation = await db.getQuotationById(input.quotationId, ctx.user.id);
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
    
    // Get calculations
    const calculations = await db.getCalculationsByQuotation(input.quotationId, ctx.user.id);
    if (calculations.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cotação não possui cálculos" });
    }
    
    // Get company settings for tax regime
    const settings = await db.getCompanySettings(ctx.user.id);
    const taxRegime = (settings?.taxRegime as 'simples_nacional' | 'lucro_presumido' | 'lucro_real') || 'lucro_presumido';
    
    // Build products array
    const products = calculations.map(calc => ({
      productName: calc.productName,
      sku: undefined,
      ncmCode: calc.ncmCode,
      quantity: calc.quantity,
      unit: calc.unit || "UN",
      fobValueBrl: (calc.fobValueCents || 0) * ((calc.exchangeRate || 5000000) / 1000000) / 100,
      cifValueBrl: (calc.cifBrlCents || 0) / 100,
      totalTaxes: ((calc.iiValueCents || 0) + (calc.ipiValueCents || 0) + (calc.pisValueCents || 0) + (calc.cofinsValueCents || 0) + (calc.icmsValueCents || 0)) / 100,
      totalCost: (calc.totalCostCents || 0) / 100,
      unitCost: (calc.unitCostCents || 0) / 100,
      suggestedPrice: (calc.suggestedPriceCents || 0) / 100,
      profit: ((calc.suggestedPriceCents || 0) - (calc.totalCostCents || 0)) / 100,
      profitMargin: calc.suggestedPriceCents ? (((calc.suggestedPriceCents - (calc.totalCostCents || 0)) / calc.suggestedPriceCents) * 100) : 0,
      taxes: {
        ii: (calc.iiValueCents || 0) / 100,
        ipi: (calc.ipiValueCents || 0) / 100,
        pis: (calc.pisValueCents || 0) / 100,
        cofins: (calc.cofinsValueCents || 0) / 100,
        icms: (calc.icmsValueCents || 0) / 100,
      },
    }));
    
    // Calculate totals
    const totals = {
      totalFobBrl: products.reduce((sum, p) => sum + p.fobValueBrl, 0),
      totalCifBrl: products.reduce((sum, p) => sum + p.cifValueBrl, 0),
      totalTaxes: products.reduce((sum, p) => sum + p.totalTaxes, 0),
      totalCost: products.reduce((sum, p) => sum + p.totalCost, 0),
      totalSuggestedPrice: products.reduce((sum, p) => sum + p.suggestedPrice, 0),
      totalProfit: products.reduce((sum, p) => sum + p.profit, 0),
      averageMargin: products.length > 0 ? products.reduce((sum, p) => sum + p.profitMargin, 0) / products.length : 0,
    };
    
    // Viability analysis
    const viableProducts = products.filter(p => p.profitMargin >= 10).length;
    const viabilityAnalysis = {
      isViable: viableProducts >= products.length * 0.7 && totals.averageMargin >= 15,
      viableProducts,
      totalProducts: products.length,
      averageMargin: totals.averageMargin,
      recommendation: viableProducts >= products.length * 0.7 && totals.averageMargin >= 15
        ? "Esta cotação apresenta margens saudáveis e é recomendada para aprovação."
        : viableProducts >= products.length * 0.5
          ? "Alguns produtos precisam de renegociação de preço para melhorar a viabilidade."
          : "Esta cotação requer revisão significativa dos preços de compra.",
    };
    
    // Generate PDF
    const pdfBuffer = await generateQuotationReport({
      quotationId: quotation.id?.toString(),
      quotationNumber: quotation.quotationNumber || `COT-${quotation.id}`,
      quotationName: quotation.supplierName || "Cotação",
      quotationStatus: quotation.status,
      supplierName: quotation.supplierName || undefined,
      supplierCountry: quotation.supplierCountry || undefined,
      currency: quotation.currency || "USD",
      exchangeRate: (quotation.exchangeRate || 5000000) / 1000000,
      originCountry: quotation.originCountry || "China",
      destinationState: quotation.destinationState || "SC",
      isMercosul: quotation.isMercosul || false,
      products,
      totals,
      freight: (quotation.freightCents || 0) / 100,
      insurance: (quotation.insuranceCents || 0) / 100,
      additionalCosts: {
        customsBroker: (quotation.customsBrokerCents || 0) / 100,
        storage: (quotation.storageCents || 0) / 100,
        others: (quotation.otherCostsCents || 0) / 100,
      },
      markup: (quotation.markupPercent || 3000) / 100,
      calculatedAt: quotation.createdAt || new Date(),
      taxRegime,
      viabilityAnalysis,
    });
    
    // Upload to S3
    const fileName = `reports/quotation-${quotation.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBuffer, "application/pdf");
    
    return { url, fileName };
  }),

generateExcelReport: protectedProcedure
  .input(z.object({ quotationId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    // Get quotation data
    const quotation = await db.getQuotationById(input.quotationId, ctx.user.id);
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
    
    // Get calculations
    const calculations = await db.getCalculationsByQuotation(input.quotationId, ctx.user.id);
    if (calculations.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cotação não possui cálculos" });
    }
    
    // Get company settings for tax regime
    const settings = await db.getCompanySettings(ctx.user.id);
    const taxRegime = (settings?.taxRegime as 'simples_nacional' | 'lucro_presumido' | 'lucro_real') || 'lucro_presumido';
    const markup = (quotation.markupPercent || 3000) / 100;

    // Parâmetros versionados (corrige Siscomex/AFRMM hardcoded). Fallback p/ valores legados.
    const params = await db.getActiveTaxParameters();
    const siscomexBaseBrl = (params["SISCOMEX_BASE"]?.valueCents ?? 18500) / 100;
    const afrmmRateDec = (params["AFRMM_RATE"]?.valueBp ?? 2500) / 10000;

    // Build calculation results for Excel with viability analysis
    const calculationResults = calculations.map(calc => {
      const exchangeRate = (calc.exchangeRate || 5000000) / 1000000;
      const fobUsd = (calc.fobValueCents || 0) / 100;
      const fobBrl = fobUsd * exchangeRate;
      const freightBrl = ((quotation.freightCents || 0) / 100 / calculations.length) * exchangeRate;
      const insuranceBrl = ((quotation.insuranceCents || 0) / 100 / calculations.length) * exchangeRate;
      const cifBrl = (calc.cifBrlCents || 0) / 100;
      
      const iiValue = (calc.iiValueCents || 0) / 100;
      const ipiValue = (calc.ipiValueCents || 0) / 100;
      const pisValue = (calc.pisValueCents || 0) / 100;
      const cofinsValue = (calc.cofinsValueCents || 0) / 100;
      const icmsValue = (calc.icmsValueCents || 0) / 100;
      const totalTaxes = iiValue + ipiValue + pisValue + cofinsValue + icmsValue;
      
      const thc = 1200 / calculations.length;
      const liberacao = 400 / calculations.length;
      const afrmm = freightBrl * afrmmRateDec;
      const siscomex = siscomexBaseBrl / calculations.length;
      const customsBroker = (quotation.customsBrokerCents || 0) / 100 / calculations.length;
      const storageCosts = (quotation.storageCents || 0) / 100 / calculations.length;
      const otherCosts = (quotation.otherCostsCents || 0) / 100 / calculations.length;
      const portCosts = thc + liberacao + afrmm + siscomex;
      const totalCustomsCosts = portCosts + customsBroker + storageCosts + otherCosts;
      
      const totalCost = (calc.totalCostCents || 0) / 100;
      const unitCost = (calc.unitCostCents || 0) / 100;
      
      // Viability analysis based on target price
      const targetPrice = 0; // Target price will be passed from quotation context
      const suggestedPrice = unitCost * (1 + markup / 100);
      
      let viability = undefined;
      if (targetPrice > 0) {
        const grossMargin = targetPrice - unitCost;
        const grossMarginPercent = (grossMargin / targetPrice) * 100;
        const netMargin = grossMargin * 0.7; // Estimativa após impostos sobre venda
        const netMarginPercent = (netMargin / targetPrice) * 100;
        
        // Calcular FOB máximo permitido
        const fobToCostRatio = fobBrl / totalCost;
        const maxCostForTarget = targetPrice * calc.quantity * 0.7; // 30% margem mínima
        const maxFobAllowed = maxCostForTarget * fobToCostRatio;
        const currentFob = fobBrl;
        const requiredReduction = Math.max(0, currentFob - maxFobAllowed);
        const requiredReductionPercent = currentFob > 0 ? (requiredReduction / currentFob) * 100 : 0;
        
        const isViable = grossMarginPercent >= 20;
        const status = isViable ? 'VIÁVEL' : (grossMarginPercent >= 10 ? 'NEGOCIAR' : 'INVIÁVEL');
        
        viability = {
          targetPrice,
          suggestedPrice,
          isViable,
          grossMargin,
          grossMarginPercent,
          netMargin,
          netMarginPercent,
          maxFobAllowed,
          currentFob,
          requiredReduction,
          requiredReductionPercent,
          status: status as 'VIÁVEL' | 'NEGOCIAR' | 'INVIÁVEL',
          statusColor: status === 'VIÁVEL' ? 'green' : (status === 'NEGOCIAR' ? 'orange' : 'red'),
        };
      }
      
      return {
        product: {
          name: calc.productName,
          ncm: calc.ncmCode,
          sku: undefined,
          quantity: calc.quantity,
          unit: calc.unit || 'UN',
          unitPrice: fobUsd / calc.quantity,
          totalUsd: fobUsd,
          totalBrl: fobBrl,
          targetPrice,
        },
        exchangeRate,
        fobUsd,
        freightUsd: (quotation.freightCents || 0) / 100 / calculations.length,
        insuranceUsd: (quotation.insuranceCents || 0) / 100 / calculations.length,
        cifUsd: fobUsd + (quotation.freightCents || 0) / 100 / calculations.length + (quotation.insuranceCents || 0) / 100 / calculations.length,
        fobBrl,
        freightBrl,
        insuranceBrl,
        cifBrl,
        taxes: {
          ii: { rate: iiValue / cifBrl || 0.14, value: iiValue },
          ipi: { rate: ipiValue / (cifBrl + iiValue) || 0.10, value: ipiValue },
          pis: { rate: 0.021, value: pisValue },
          cofins: { rate: 0.0965, value: cofinsValue },
          icms: { rate: 0.17, value: icmsValue },
        },
        totalTaxes,
        afrmm,
        thc,
        siscomex,
        liberacao,
        portCosts,
        storageCosts,
        customsBroker,
        otherCosts,
        totalCustomsCosts,
        totalCost,
        unitCost,
        saleTaxes: undefined,
        viability,
      };
    });
    
    // Generate Excel
    const excelBuffer = await generateExcelReport({
      quotationName: quotation.quotationNumber || `COT-${quotation.id}`,
      supplierName: quotation.supplierName || "Fornecedor",
      originCountry: quotation.originCountry || "China",
      destinationPort: "Porto de " + (quotation.destinationState || "SP"),
      destinationState: quotation.destinationState || "SP",
      taxRegime,
      currency: quotation.currency || "USD",
      markup,
      createdAt: quotation.createdAt || new Date(),
      calculations: calculationResults,
    });
    
    // Upload to S3
    const fileName = `reports/quotation-${quotation.id}-${Date.now()}.xlsx`;
    const { url } = await storagePut(fileName, excelBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    
    return { url, fileName };
  }),
});
