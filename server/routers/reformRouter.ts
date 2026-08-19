/**
 * Reform & Intelligence Router - Novas rotas de API
 * 
 * Integra o motor tributário dual e o serviço de inteligência
 * ao sistema existente via tRPC.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as taxReformService from "../services/taxReformService";
import * as intelligenceService from "../services/importIntelligenceService";

export const reformRouter = router({
  /**
   * Simulate reform impact for a specific import
   */
  simulateImpact: protectedProcedure
    .input(z.object({
      cifValueCents: z.number(),
      ncmCode: z.string(),
      originCountry: z.string(),
      destinationState: z.string(),
      isMercosul: z.boolean().optional().default(false),
      referenceYear: z.number().optional(),
      currentIiRate: z.number().optional(),
      currentIpiRate: z.number().optional(),
      currentPisRate: z.number().optional(),
      currentCofinsRate: z.number().optional(),
      currentIcmsRate: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const result = await taxReformService.simulateReformImpact(input);
      return result;
    }),

  /**
   * Generate timeline of reform impact from 2025-2033
   */
  getTimeline: protectedProcedure
    .input(z.object({
      cifValueCents: z.number(),
      ncmCode: z.string(),
      iiRate: z.number().optional().default(1400),
      ipiRate: z.number().optional().default(0),
      pisRate: z.number().optional().default(216),
      cofinsRate: z.number().optional().default(1000),
      icmsRate: z.number().optional().default(100),
    }))
    .query(({ input }) => {
      return taxReformService.generateReformTimeline(
        input.cifValueCents,
        input.ncmCode,
        {
          iiRate: input.iiRate,
          ipiRate: input.ipiRate,
          pisRate: input.pisRate,
          cofinsRate: input.cofinsRate,
          icmsRate: input.icmsRate,
        }
      );
    }),

  /**
   * Get reform phase info for a specific year
   */
  getPhaseInfo: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(({ input }) => {
      const phase = taxReformService.getReformPhase(input.year);
      return {
        ...phase,
        formattedDescription: taxReformService.formatPhaseDescription(phase),
        changeSummary: taxReformService.getYearChangeSummary(input.year),
      };
    }),

  /**
   * Check if a product has special treatment under the reform
   */
  checkSpecialTreatment: protectedProcedure
    .input(z.object({ ncmCode: z.string() }))
    .query(({ input }) => {
      return taxReformService.getReformSpecialTreatment(input.ncmCode);
    }),

  /**
   * Get the full reform timeline with descriptions
   */
  getFullTimeline: protectedProcedure
    .query(() => {
      return taxReformService.TAX_REFORM_TIMELINE.map(phase => ({
        ...phase,
        formattedDescription: taxReformService.formatPhaseDescription(phase),
      }));
    }),
});

export const intelligenceRouter = router({
  /**
   * Generate a full intelligence report for a quotation
   */
  analyzeOpportunity: protectedProcedure
    .input(z.object({
      products: z.array(z.object({
        name: z.string(),
        ncm: z.string(),
        quantity: z.number(),
        unit: z.string(),
        unitPriceFobCents: z.number(),
        unitCostNationalizedCents: z.number(),
        targetPriceCents: z.number().optional(),
        suggestedPriceCents: z.number(),
      })),
      supplier: z.object({
        name: z.string(),
        country: z.string(),
        reliabilityScore: z.number().optional(),
        previousOrders: z.number().optional(),
      }),
      logistics: z.object({
        incoterm: z.string().default("FOB"),
        originCountry: z.string(),
        destinationState: z.string(),
        port: z.string().optional(),
        estimatedTransitDays: z.number().optional(),
        freightCents: z.number(),
        insuranceCents: z.number(),
      }),
      financial: z.object({
        totalFobCents: z.number(),
        totalCifCents: z.number(),
        totalTaxesCents: z.number(),
        totalCostCents: z.number(),
        exchangeRate: z.number(),
        currency: z.string(),
      }),
    }))
    .mutation(async ({ input }) => {
      const report = await intelligenceService.generateIntelligenceReport(input);
      return report;
    }),

  /**
   * Quick viability check (lighter than full report)
   */
  quickCheck: protectedProcedure
    .input(z.object({
      cifValueCents: z.number(),
      totalCostCents: z.number(),
      targetPriceCents: z.number().optional(),
      originCountry: z.string(),
      supplierPreviousOrders: z.number().optional(),
    }))
    .query(({ input }) => {
      const margin = input.targetPriceCents 
        ? ((input.targetPriceCents - input.totalCostCents) / input.targetPriceCents) * 100
        : null;
      
      const isNewSupplier = !input.supplierPreviousOrders || input.supplierPreviousOrders === 0;
      
      let quickVerdict: "GO" | "NEGOTIATE" | "NO_GO" | "WAIT";
      if (margin !== null) {
        if (margin >= 20 && !isNewSupplier) quickVerdict = "GO";
        else if (margin >= 10) quickVerdict = "NEGOTIATE";
        else if (margin < 0) quickVerdict = "NO_GO";
        else quickVerdict = "WAIT";
      } else {
        quickVerdict = "NEGOTIATE";
      }
      
      return {
        verdict: quickVerdict,
        margin: margin ? Math.round(margin * 100) / 100 : null,
        isNewSupplier,
        riskLevel: isNewSupplier ? "medium" : "low",
      };
    }),
});
