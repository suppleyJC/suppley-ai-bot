import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import { performImportCalculation, saveImportCalculation, getCalculationSummary } from "../services/importCalculationService";
import { calculateWithMotorV2 } from "../services/motor-v2-adapter";
import { generateViabilityAnalysis } from "../services/aiAnalysisService";
import { extractQuotationFromPdfDirect, normalizeExtractedProducts } from "../services/quotationExtractorService";
import { generateExcelReport } from "../services/excelReportService";
import { storagePut, storageGet } from "../storage";

export const calculationsRouter = router({
list: protectedProcedure
  .input(z.object({ limit: z.number().default(50) }).optional())
  .query(async ({ ctx, input }) => {
    return db.getCalculationsByUser(ctx.user.id, input?.limit ?? 50);
  }),

get: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const calc = await db.getCalculationById(input.id, ctx.user.id);
    if (!calc) throw new TRPCError({ code: "NOT_FOUND" });
    return calc;
  }),

calculate: protectedProcedure
  .input(z.object({
    productName: z.string().min(1),
    ncmCode: z.string().min(8).max(10),
    quantity: z.number().min(1),
    unit: z.string().default("UN"),
    originCountry: z.string().min(1),
    destinationState: z.string().length(2).default("SC"),
    fobValue: z.number().min(0),
    fobCurrency: z.string().length(3).default("USD"),
    freight: z.number().min(0).default(0),
    insurance: z.number().min(0).default(0),
    customsBrokerBrl: z.number().min(0).optional(),
    storageBrl: z.number().min(0).optional(),
    otherCostsBrl: z.number().min(0).optional(),
    markupPercent: z.number().min(0).optional(),
    productId: z.number().optional(),
    supplierId: z.number().optional(),
    save: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    let result;
    let usingMotorV2 = false;

    try {
      // Tentar Motor V2 primeiro (certificado, mais preciso)
      result = await calculateWithMotorV2({
        userId: ctx.user.id,
        ...input,
      });
      usingMotorV2 = true;
      console.log("[Calculate] Motor V2 calculation successful");
    } catch (error) {
      // Fallback ao legado se Motor V2 falhar
      console.warn("[Calculate] Motor V2 failed, falling back to legacy engine:", error);
      result = await performImportCalculation({
        userId: ctx.user.id,
        ...input,
      });
    }

    let calculationId: number | undefined;
    if (input.save) {
      const savedId = await saveImportCalculation({ userId: ctx.user.id, ...input }, result);
      calculationId = savedId ?? undefined;
    }

    const summary = getCalculationSummary(result);

    return {
      ...result,
      calculationId,
      summary,
      _motorV2: usingMotorV2, // Indica qual motor foi usado (debug)
    };
  }),

analyze: protectedProcedure
  .input(z.object({
    calculationId: z.number().optional(),
    productName: z.string(),
    ncmCode: z.string(),
    originCountry: z.string(),
    quantity: z.number(),
    calculationResult: z.object({
      fobBrl: z.number(),
      cifBrl: z.number(),
      totalCostBrl: z.number(),
      unitCostBrl: z.number(),
      suggestedPriceBrl: z.number(),
      grossProfitBrl: z.number(),
      grossMarginPercent: z.number(),
      isMercosul: z.boolean(),
      taxes: z.object({
        rates: z.object({
          ii: z.number(),
          ipi: z.number(),
          pis: z.number(),
          cofins: z.number(),
          icms: z.number(),
        }),
        values: z.object({
          iiValueCents: z.number(),
          ipiValueCents: z.number(),
          pisValueCents: z.number(),
          cofinsValueCents: z.number(),
          icmsValueCents: z.number(),
          totalTaxesCents: z.number(),
        }),
      }),
    }),
  }))
  .mutation(async ({ ctx, input }) => {
    const analysis = await generateViabilityAnalysis(
      input.calculationResult as any,
      input.productName,
      input.ncmCode,
      input.originCountry,
      input.quantity
    );
    
    // Update calculation with analysis if ID provided
    if (input.calculationId) {
      await db.updateCalculation(input.calculationId, ctx.user.id, {
        aiAnalysis: JSON.stringify(analysis),
        viabilityScore: analysis.viabilityScore,
      });
    }
    
    return analysis;
  }),

delete: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return db.deleteCalculation(input.id, ctx.user.id);
  }),

stats: protectedProcedure.query(async ({ ctx }) => {
  return db.getCalculationStats(ctx.user.id);
}),

uploadQuotation: protectedProcedure
  .input(z.object({
    fileName: z.string(),
    fileData: z.string(), // Base64 encoded file
    contentType: z.string().default("application/pdf"),
  }))
  .mutation(async ({ ctx, input }) => {
    const { fileName, fileData, contentType } = input;
    
    // Decode base64 to buffer
    const buffer = Buffer.from(fileData, "base64");
    
    // Generate unique file key. O nome entra TRUNCADO (60 chars, extensão
    // preservada): nomes de cotação são longos e a URL pré-assinada derivada
    // da chave estourava a coluna fileUrl do banco.
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const dot = sanitized.lastIndexOf(".");
    const ext = dot > 0 ? sanitized.slice(dot).slice(0, 10) : "";
    const base = (dot > 0 ? sanitized.slice(0, dot) : sanitized).slice(0, Math.max(10, 60 - ext.length));
    const fileKey = `quotations/${ctx.user.id}/${timestamp}-${randomSuffix}-${base}${ext}`;
    
    // Upload to S3
    const { key, url } = await storagePut(fileKey, buffer, contentType);
    
    return {
      fileUrl: url,
      fileKey: key,
      fileName: fileName,
    };
  }),

updateQuotationFile: protectedProcedure
  .input(z.object({
    calculationId: z.number(),
    fileUrl: z.string(),
    fileKey: z.string(),
    fileName: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    await db.updateCalculation(input.calculationId, ctx.user.id, {
      quotationFileUrl: input.fileUrl,
      quotationFileKey: input.fileKey,
      quotationFileName: input.fileName,
    });
    return { success: true };
  }),

getQuotationUrl: protectedProcedure
  .input(z.object({ calculationId: z.number() }))
  .query(async ({ ctx, input }) => {
    const calc = await db.getCalculationById(input.calculationId, ctx.user.id);
    if (!calc || !calc.quotationFileKey) {
      return null;
    }
    const { url } = await storageGet(calc.quotationFileKey);
    return {
      url,
      fileName: calc.quotationFileName,
    };
  }),

extractFromPdf: publicProcedure
  .input(z.object({
    fileBase64: z.string().min(1),
  }))
  .mutation(async ({ ctx, input }) => {
    console.log("[extractFromPdf] Received base64 data, length:", input.fileBase64.length);
    try {
      console.log("[extractFromPdf] Calling extractQuotationFromPdf...");
      const dataUrl = `data:application/pdf;base64,${input.fileBase64}`;
      const extracted = await extractQuotationFromPdfDirect(dataUrl);
      console.log("[extractFromPdf] Extraction successful, products:", extracted.products.length);
      const normalizedProducts = normalizeExtractedProducts(extracted.products);
      
      return {
        success: true,
        supplierName: extracted.supplierName,
        supplierCountry: extracted.supplierCountry,
        quotationDate: extracted.quotationDate,
        quotationNumber: extracted.quotationNumber,
        currency: extracted.currency,
        products: normalizedProducts,
        totalValue: extracted.totalValue,
        freight: extracted.freight,
        insurance: extracted.insurance,
        incoterm: extracted.incoterm,
        notes: extracted.notes,
      };
    } catch (error) {
      console.error("[extractFromPdf] Error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Erro ao extrair dados do PDF",
      });
    }
  }),

calculateMultiple: protectedProcedure
  .input(z.object({
    products: z.array(z.object({
      productName: z.string().min(1),
      sku: z.string().optional(),
      ncmCode: z.string().min(8).max(10),
      quantity: z.number().min(1),
      unit: z.string().default("UN"),
      unitPrice: z.number().min(0),
      totalPrice: z.number().min(0),
      targetPrice: z.number().min(0).optional(), // Preço alvo de venda no Brasil (por unidade)
    })),
    originCountry: z.string().min(1),
    destinationState: z.string().length(2).default("SC"),
    currency: z.string().length(3).default("USD"),
    freight: z.number().min(0).default(0),
    insurance: z.number().min(0).default(0),
    customsBrokerBrl: z.number().min(0).optional(),
    storageBrl: z.number().min(0).optional(),
    otherCostsBrl: z.number().min(0).optional(),
    markupPercent: z.number().min(0).optional(),
    taxRegime: z.enum(["simples_nacional", "lucro_presumido", "lucro_real"]).default("lucro_presumido"),
    simplesFaixa: z.number().min(1).max(6).optional(),
    quotationFileUrl: z.string().optional(),
    quotationFileKey: z.string().optional(),
    quotationFileName: z.string().optional(),
    save: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    const results = [];
    const totalFob = input.products.reduce((sum, p) => sum + p.totalPrice, 0);
    
    // Distribute freight and insurance proportionally
    for (const product of input.products) {
      const proportion = totalFob > 0 ? product.totalPrice / totalFob : 1 / input.products.length;
      const productFreight = input.freight * proportion;
      const productInsurance = input.insurance * proportion;
      const productCustomsBroker = (input.customsBrokerBrl || 0) * proportion;
      const productStorage = (input.storageBrl || 0) * proportion;
      const productOtherCosts = (input.otherCostsBrl || 0) * proportion;
      
      const result = await performImportCalculation({
        userId: ctx.user.id,
        productName: product.productName,
        ncmCode: product.ncmCode,
        quantity: product.quantity,
        unit: product.unit,
        originCountry: input.originCountry,
        destinationState: input.destinationState,
        fobValue: product.totalPrice,
        fobCurrency: input.currency,
        freight: productFreight,
        insurance: productInsurance,
        customsBrokerBrl: productCustomsBroker,
        storageBrl: productStorage,
        otherCostsBrl: productOtherCosts,
        markupPercent: input.markupPercent,
      });
      
      let calculationId: number | undefined;
      if (input.save) {
        const savedId = await saveImportCalculation({
          userId: ctx.user.id,
          productName: product.productName,
          ncmCode: product.ncmCode,
          quantity: product.quantity,
          unit: product.unit,
          originCountry: input.originCountry,
          destinationState: input.destinationState,
          fobValue: product.totalPrice,
          fobCurrency: input.currency,
          freight: productFreight,
          insurance: productInsurance,
          customsBrokerBrl: productCustomsBroker,
          storageBrl: productStorage,
          otherCostsBrl: productOtherCosts,
          markupPercent: input.markupPercent,
        }, result);
        calculationId = savedId ?? undefined;
        
        // Link quotation file if provided
        if (calculationId && input.quotationFileUrl) {
          await db.updateCalculation(calculationId, ctx.user.id, {
            quotationFileUrl: input.quotationFileUrl,
            quotationFileKey: input.quotationFileKey,
            quotationFileName: input.quotationFileName,
          });
        }
      }
      
      // Análise de Preço Target
      let targetAnalysis = undefined;
      if (product.targetPrice && product.targetPrice > 0) {
        const unitCost = result.unitCostBrl;
        const targetPrice = product.targetPrice;
        const isViable = targetPrice >= unitCost * 1.1; // Mínimo 10% de margem
        
        // Calcular preço máximo de compra para atingir o target
        // Preço Target = Custo Unitário * (1 + Markup)
        // Custo Unitário = FOB + Frete + Seguro + Impostos + Custos Adicionais
        // Para simplificar, usamos a proporção atual entre FOB e Custo Total
        const fobToCostRatio = result.fobBrl / result.totalCostBrl;
        const maxCostForTarget = targetPrice / (1 + (input.markupPercent || 3000) / 10000);
        const maxFobForTarget = maxCostForTarget * fobToCostRatio;
        const maxPurchasePrice = maxFobForTarget / result.exchangeRate / product.quantity;
        
        const priceDifference = targetPrice - result.suggestedUnitPriceBrl;
        const requiredDiscount = product.unitPrice > 0 
          ? ((product.unitPrice - maxPurchasePrice) / product.unitPrice) * 100 
          : 0;
        
        targetAnalysis = {
          targetPrice,
          isViable,
          maxPurchasePrice: Math.max(0, maxPurchasePrice),
          priceDifference,
          requiredDiscount: Math.max(0, requiredDiscount),
        };
      }
      
      results.push({
        product: {
          name: product.productName,
          sku: product.sku,
          ncmCode: product.ncmCode,
          quantity: product.quantity,
          unit: product.unit,
          unitPrice: product.unitPrice,
          totalPrice: product.totalPrice,
          targetPrice: product.targetPrice,
        },
        calculation: {
          ...result,
          calculationId,
          summary: getCalculationSummary(result),
          targetAnalysis,
        },
      });
    }
    
    // Calculate totals
    const totals = {
      totalFobBrl: results.reduce((sum, r) => sum + r.calculation.fobBrl, 0),
      totalCifBrl: results.reduce((sum, r) => sum + r.calculation.cifBrl, 0),
      totalTaxesBrl: results.reduce((sum, r) => sum + r.calculation.taxes.values.totalTaxesCents / 100, 0),
      totalCostBrl: results.reduce((sum, r) => sum + r.calculation.totalCostBrl, 0),
      totalSuggestedPriceBrl: results.reduce((sum, r) => sum + r.calculation.suggestedPriceBrl, 0),
      totalGrossProfitBrl: results.reduce((sum, r) => sum + r.calculation.grossProfitBrl, 0),
      productCount: results.length,
    };
    
    // Create quotation record when saving
    let quotationId: number | undefined;
    if (input.save) {
      try {
        const exchangeRate = results[0]?.calculation.exchangeRate || 5.0;
        const isMercosul = results[0]?.calculation.isMercosul || false;
        const quotation = await db.createQuotation({
          userId: ctx.user.id,
          quotationNumber: input.quotationFileName || `COT-${Date.now()}`,
          supplierName: undefined,
          supplierCountry: input.originCountry,
          originCountry: input.originCountry,
          destinationState: input.destinationState,
          currency: input.currency,
          exchangeRate: Math.round(exchangeRate * 1000000),
          isMercosul,
          freightCents: Math.round(input.freight * 100),
          insuranceCents: Math.round(input.insurance * 100),
          customsBrokerCents: Math.round((input.customsBrokerBrl || 0) * 100),
          storageCents: Math.round((input.storageBrl || 0) * 100),
          otherCostsCents: Math.round((input.otherCostsBrl || 0) * 100),
          markupPercent: input.markupPercent || 3000,
          quotationFileUrl: input.quotationFileUrl,
          quotationFileKey: input.quotationFileKey,
          quotationFileName: input.quotationFileName,
          totalFobCents: Math.round(totals.totalFobBrl * 100),
          totalCifCents: Math.round(totals.totalCifBrl * 100),
          totalTaxesCents: Math.round(totals.totalTaxesBrl * 100),
          totalCostCents: Math.round(totals.totalCostBrl * 100),
          totalSuggestedPriceCents: Math.round(totals.totalSuggestedPriceBrl * 100),
          status: "analyzing",
        });
        quotationId = quotation?.id;
        
        // Link calculations to quotation
        if (quotationId) {
          for (const r of results) {
            if (r.calculation.calculationId) {
              await db.updateCalculation(r.calculation.calculationId, ctx.user.id, {
                quotationId,
              });
            }
          }
        }
      } catch (err) {
        console.error("[calculateMultiple] Error creating quotation:", err);
      }
    }
    
    return {
      results,
      totals,
      currency: input.currency,
      originCountry: input.originCountry,
      destinationState: input.destinationState,
      quotationId,
    };
  }),
  
generateReport: protectedProcedure
  .input(z.object({
    quotationNumber: z.string().optional(),
    supplierName: z.string().optional(),
    supplierCountry: z.string().optional(),
    currency: z.string().default("USD"),
    exchangeRate: z.number(),
    originCountry: z.string(),
    destinationState: z.string(),
    isMercosul: z.boolean(),
    freight: z.number().default(0),
    insurance: z.number().default(0),
    additionalCosts: z.object({
      customsBroker: z.number().default(0),
      storage: z.number().default(0),
      others: z.number().default(0),
    }),
    markup: z.number().default(30),
    products: z.array(z.object({
      productName: z.string(),
      sku: z.string().optional(),
      ncmCode: z.string(),
      quantity: z.number(),
      unit: z.string(),
      fobValueBrl: z.number(),
      cifValueBrl: z.number(),
      totalTaxes: z.number(),
      totalCost: z.number(),
      unitCost: z.number(),
      suggestedPrice: z.number(),
      profit: z.number(),
      profitMargin: z.number(),
      taxes: z.object({
        ii: z.number(),
        ipi: z.number(),
        pis: z.number(),
        cofins: z.number(),
        icms: z.number(),
      }),
    })),
    totals: z.object({
      totalFobBrl: z.number(),
      totalCifBrl: z.number(),
      totalTaxes: z.number(),
      totalCost: z.number(),
      totalSuggestedPrice: z.number(),
      totalProfit: z.number(),
      averageMargin: z.number(),
    }),
  }))
  .mutation(async ({ input, ctx }) => {
    // Get company settings for tax regime
    const settings = await db.getCompanySettings(ctx.user.id);
    const taxRegime = (settings?.taxRegime as 'simples_nacional' | 'lucro_presumido' | 'lucro_real') || 'lucro_presumido';
    
    // Build calculation results for Excel
    const calculationResults = input.products.map(product => {
      const freightShare = input.freight / input.products.length;
      const insuranceShare = input.insurance / input.products.length;
      const cifBrl = product.cifValueBrl;
      
      return {
        product: {
          name: product.productName,
          ncm: product.ncmCode,
          sku: product.sku,
          quantity: product.quantity,
          unit: product.unit,
          unitPrice: product.fobValueBrl / product.quantity / input.exchangeRate,
          totalUsd: product.fobValueBrl / input.exchangeRate,
          totalBrl: product.fobValueBrl,
        },
        exchangeRate: input.exchangeRate,
        fobUsd: product.fobValueBrl / input.exchangeRate,
        freightUsd: freightShare,
        insuranceUsd: insuranceShare,
        cifUsd: (product.cifValueBrl) / input.exchangeRate,
        fobBrl: product.fobValueBrl,
        freightBrl: freightShare * input.exchangeRate,
        insuranceBrl: insuranceShare * input.exchangeRate,
        cifBrl: product.cifValueBrl,
        taxes: {
          ii: { rate: input.isMercosul ? 0 : 0.18, value: product.taxes.ii },
          ipi: { rate: 0.13, value: product.taxes.ipi },
          pis: { rate: 0.021, value: product.taxes.pis },
          cofins: { rate: 0.0965, value: product.taxes.cofins },
          icms: { rate: 0.04, value: product.taxes.icms },
        },
        totalTaxes: product.totalTaxes,
        afrmm: 0,
        thc: 0,
        siscomex: 214.50 / input.products.length,
        liberacao: input.additionalCosts.others / input.products.length,
        portCosts: 0,
        storageCosts: input.additionalCosts.storage / input.products.length,
        customsBroker: input.additionalCosts.customsBroker / input.products.length,
        otherCosts: 0,
        totalCustomsCosts: (input.additionalCosts.customsBroker + input.additionalCosts.storage + input.additionalCosts.others) / input.products.length,
        totalCost: product.totalCost,
        unitCost: product.unitCost,
        viability: {
          targetPrice: product.suggestedPrice,
          suggestedPrice: product.suggestedPrice,
          isViable: product.profitMargin >= 15,
          grossMargin: product.profit,
          grossMarginPercent: product.profitMargin,
          netMargin: product.profit * 0.85,
          netMarginPercent: product.profitMargin * 0.85,
          maxFobAllowed: product.fobValueBrl,
          currentFob: product.fobValueBrl,
          requiredReduction: 0,
          requiredReductionPercent: 0,
          status: product.profitMargin >= 20 ? 'VIÁVEL' as const : product.profitMargin >= 10 ? 'NEGOCIAR' as const : 'INVIÁVEL' as const,
          statusColor: product.profitMargin >= 20 ? 'green' : product.profitMargin >= 10 ? 'orange' : 'red',
        },
      };
    });
    
    // Generate Excel
    const excelBuffer = await generateExcelReport({
      quotationName: input.quotationNumber || `COT-${Date.now()}`,
      supplierName: input.supplierName || "Fornecedor",
      originCountry: input.originCountry,
      destinationPort: "Porto de " + input.destinationState,
      destinationState: input.destinationState,
      taxRegime,
      currency: input.currency,
      markup: input.markup,
      createdAt: new Date(),
      calculations: calculationResults,
    });
    
    // Upload to S3
    const fileName = `reports/quotation-${Date.now()}.xlsx`;
    const { url } = await storagePut(fileName, excelBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    
    return { url, fileName };
  }),
});
