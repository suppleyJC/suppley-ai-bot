/**
 * parametrosRouter — Parâmetros de Cálculo (tributos, taxas, custos portuários,
 * ex-tarifário e benefícios fiscais). Leitura pública; escrita exige login.
 *
 * Escrita de tax_parameters cria uma NOVA versão (nova effectiveDate),
 * preservando o histórico — base para auditoria e backtest.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const parametrosRouter = router({
  /* ---- tax_parameters ---- */
  taxParams: router({
    list: publicProcedure.query(() => db.listAllTaxParameters()),
    active: publicProcedure.query(() => db.getActiveTaxParameters()),
    history: publicProcedure
      .input(z.object({ paramKey: z.string() }))
      .query(({ input }) => db.listTaxParameterHistory(input.paramKey)),
    saveVersion: protectedProcedure
      .input(
        z.object({
          paramKey: z.string().min(1).max(60),
          label: z.string().min(1).max(180),
          category: z.enum(["tributo_federal", "taxa_fixa", "despesa"]),
          unit: z.enum(["bp", "cents"]),
          valueBp: z.number().int().nullable().optional(),
          valueCents: z.number().int().nullable().optional(),
          effectiveDate: z.coerce.date(),
          endDate: z.coerce.date().nullable().optional(),
          legalBasis: z.string().max(255).nullable().optional(),
          notes: z.string().nullable().optional(),
          isActive: z.boolean().default(true),
        }),
      )
      .mutation(async ({ input }) => {
        await db.insertTaxParameterVersion(input);
        return { ok: true };
      }),
  }),

  /* ---- port_costs ---- */
  ports: router({
    list: publicProcedure.query(() => db.listPortCosts()),
    save: protectedProcedure
      .input(
        z.object({
          portCode: z.string().min(1).max(10),
          portName: z.string().min(1).max(180),
          stateCode: z.string().length(2),
          modal: z.enum(["maritimo", "aereo", "rodoviario"]).default("maritimo"),
          thcCents: z.number().int().nonnegative(),
          storageBp: z.number().int().nonnegative(),
          storageMinCents: z.number().int().nonnegative().default(0),
          liberationCents: z.number().int().nonnegative(),
          otherCents: z.number().int().nonnegative().default(0),
          effectiveDate: z.coerce.date(),
          legalBasis: z.string().max(255).nullable().optional(),
          notes: z.string().nullable().optional(),
          isActive: z.boolean().default(true),
        }),
      )
      .mutation(async ({ input }) => {
        await db.upsertPortCost(input);
        return { ok: true };
      }),
  }),

  /* ---- ncm_exceptions (Ex-Tarifário) ---- */
  exTarifario: router({
    list: publicProcedure.query(() => db.listNcmExceptions()),
    save: protectedProcedure
      .input(
        z.object({
          ncmCode: z.string().min(1).max(10),
          exCode: z.string().max(20).nullable().optional(),
          description: z.string().nullable().optional(),
          reducedIiRate: z.number().int().nullable().optional(),
          reducedIpiRate: z.number().int().nullable().optional(),
          legalBasis: z.string().max(255).nullable().optional(),
          startDate: z.coerce.date().nullable().optional(),
          endDate: z.coerce.date().nullable().optional(),
          isActive: z.boolean().default(true),
        }),
      )
      .mutation(async ({ input }) => {
        await db.upsertNcmException(input);
        return { ok: true };
      }),
  }),

  /* ---- fiscal_benefits ---- */
  benefits: router({
    list: publicProcedure.query(() => db.listFiscalBenefits()),
    save: protectedProcedure
      .input(
        z.object({
          id: z.number().int().optional(),
          name: z.string().min(1).max(255),
          code: z.string().max(50).nullable().optional(),
          stateCode: z.string().length(2).nullable().optional(),
          ncmPattern: z.string().max(20).nullable().optional(),
          benefitType: z.enum([
            "ii_reduction",
            "ii_exemption",
            "ipi_reduction",
            "ipi_exemption",
            "icms_reduction",
            "icms_credit",
            "icms_deferral",
            "pis_cofins_suspension",
            "drawback",
            "recof",
          ]),
          reductionPercent: z.number().int().nullable().optional(),
          creditPercent: z.number().int().nullable().optional(),
          requirements: z.string().nullable().optional(),
          documentation: z.string().nullable().optional(),
          legalBasis: z.string().max(255).nullable().optional(),
          isActive: z.boolean().default(true),
        }),
      )
      .mutation(async ({ input }) => {
        const id = await db.upsertFiscalBenefit(input);
        return { ok: true, id };
      }),
  }),
});
