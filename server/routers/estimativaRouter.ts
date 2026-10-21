/**
 * Estimativa Router — endpoints PARALELOS do novo motor de cálculo.
 * Não altera nenhum endpoint existente: as telas atuais continuam
 * usando calculationsRouter. Use estes endpoints para validar o motor
 * e gerar o Excel no layout do contador.
 *
 * Registro (1 linha em server/routers.ts):
 *   import { estimativaRouter } from "./routers/estimativaRouter";
 *   ... dentro de appRouter: estimativa: estimativaRouter,
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { calculateEstimativa } from "../services/estimativaService";
import { generateEstimativaExcel } from "../services/excelEstimativaService";
import { storagePut } from "../storage";

const productSchema = z.object({
  productName: z.string().min(1),
  sku: z.string().optional(),
  ncmCode: z.string().min(8).max(12),
  quantity: z.number().min(1),
  unit: z.string().default("UN"),
  unitPrice: z.number().min(0),
  iiRateOverride: z.number().min(0).max(1).optional(),
  ipiRateOverride: z.number().min(0).max(1).optional(),
  icmsStValue: z.number().min(0).optional(),
});

const estimativaSchema = z.object({
  products: z.array(productSchema).min(1),
  exchangeRate: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  freight: z.number().min(0).default(0),
  insurance: z.number().min(0).default(0),

  portoCode: z.string().optional(),
  afrmmBrl: z.number().min(0).optional(),
  siscomexBrl: z.number().min(0).optional(),
  liberacaoBlBrl: z.number().min(0).optional(),
  armazenagemBrl: z.number().min(0).optional(),
  freteInternoBrl: z.number().min(0).optional(),
  despachoAduaneiroBrl: z.number().min(0).optional(),
  taxaExpedienteBrl: z.number().min(0).optional(),
  pacoteLogisticoBrl: z.number().min(0).optional(),
  royaltiesBrl: z.number().min(0).optional(),
  assessoriaRate: z.number().min(0).max(1).optional(),

  ttdPhase: z.enum(["primeiros_36m", "apos_36m"]).default("primeiros_36m"),
  icmsAntecipadoRateOverride: z.number().min(0).max(1).optional(),
  icmsGrossUpRateOverride: z.number().min(0).max(0.99).optional(),
  icmsNegociadoClienteRate: z.number().min(0).max(1).optional(),
  icmsFullRegime: z.boolean().optional(),
  icmsInternalRate: z.number().min(0).max(1).optional(),

  applyCofinsLc224: z.boolean().optional(), // default true no service (legislação 2026)
  pisImportRateOverride: z.number().min(0).max(1).optional(),
  cofinsImportRateOverride: z.number().min(0).max(1).optional(),

  taxRegime: z.enum(["simples_nacional", "lucro_presumido", "lucro_real"]).default("lucro_real"),
  icmsVendaRate: z.number().min(0).max(1).optional(),
  pisVendaRate: z.number().min(0).max(1).optional(),
  cofinsVendaRate: z.number().min(0).max(1).optional(),
  lucroDesejado: z.number().min(0).max(0.6).optional(),
  irpjRate: z.number().min(0).max(1).optional(),
  csllRate: z.number().min(0).max(1).optional(),
});

export const estimativaRouter = router({
  /** Cálculo completo (JSON) — para validação e futura UI */
  calculate: protectedProcedure
    .input(estimativaSchema)
    .mutation(async ({ input }) => {
      return calculateEstimativa(input);
    }),

  /** Gera o Excel no layout do contador e devolve URL (S3) */
  exportExcel: protectedProcedure
    .input(
      estimativaSchema.extend({
        quotationName: z.string().default(() => `EST-${Date.now()}`),
        supplierName: z.string().optional(),
        originCountry: z.string().optional(),
        clientName: z.string().optional(),
        /** "internal" expõe ICMS efetivo TTD e ganho do benefício — uso interno da trading */
        mode: z.enum(["internal", "client"]).default("client"),
      })
    )
    .mutation(async ({ input }) => {
      const result = await calculateEstimativa(input);
      const buffer = await generateEstimativaExcel(result, {
        quotationName: input.quotationName,
        supplierName: input.supplierName,
        originCountry: input.originCountry,
        clientName: input.clientName,
        mode: input.mode,
        regime: input.taxRegime,
        currency: input.currency,
      });
      const fileName = `reports/estimativa-${input.mode}-${Date.now()}.xlsx`;
      const { url } = await storagePut(
        fileName,
        buffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      return {
        url,
        fileName,
        warnings: [...result.warnings, ...result.ncmWarnings],
        summary: result.summary,
      };
    }),
});
