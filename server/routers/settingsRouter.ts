import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

export const settingsRouter = router({
get: protectedProcedure.query(async ({ ctx }) => {
  return db.getCompanySettings(ctx.user.id);
}),

// Parâmetros da empresa afetam o cálculo de todos — edição é restrita ao admin.
update: adminProcedure
  .input(z.object({
    companyName: z.string().optional(),
    cnpj: z.string().optional(),
    stateCode: z.string().length(2).optional(),
    taxRegime: z.enum(["simples_nacional", "lucro_presumido", "lucro_real"]).optional(),
    simplesAliquota: z.number().min(0).max(10000).optional(), // Alíquota em basis points
    simplesFaixa: z.number().min(1).max(6).optional(),
    defaultMarkupPercent: z.number().min(0).optional(),
    defaultCustomsBrokerCents: z.number().min(0).optional(),
    defaultStorageCents: z.number().min(0).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return db.upsertCompanySettings(ctx.user.id, input);
  }),
});
