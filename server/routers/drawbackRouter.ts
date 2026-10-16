import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as drawbackService from "../services/drawbackService";

export const drawbackRouter = router({
checkEligibility: protectedProcedure
  .input(z.object({
    hasExportCommitment: z.boolean(),
    exportValueCents: z.number(),
    importValueCents: z.number(),
    productType: z.string(),
    ncmCode: z.string(),
  }))
  .query(({ input }) => {
    return drawbackService.checkDrawbackEligibility(input);
  }),

calculateSavings: protectedProcedure
  .input(z.object({
    drawbackType: z.enum(["suspension", "exemption", "restitution"]),
    iiValueCents: z.number(),
    ipiValueCents: z.number(),
    pisValueCents: z.number(),
    cofinsValueCents: z.number(),
    cifValueCents: z.number(),
  }))
  .query(({ input }) => {
    return drawbackService.calculateDrawbackSavings(input);
  }),

create: protectedProcedure
  .input(z.object({
    drawbackType: z.enum(["suspension", "exemption", "restitution"]),
    exportProductName: z.string().optional(),
    exportNcm: z.string().optional(),
    exportQuantity: z.number().optional(),
    exportValueCents: z.number().optional(),
    importProductName: z.string().optional(),
    importNcm: z.string().optional(),
    importQuantity: z.number().optional(),
    importValueCents: z.number().optional(),
    quotationId: z.number().optional(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return drawbackService.createDrawbackRecord({
      userId: ctx.user.id,
      ...input,
    });
  }),

list: protectedProcedure.query(async ({ ctx }) => {
  return drawbackService.listDrawbackRecords(ctx.user.id);
}),

updateStatus: protectedProcedure
  .input(z.object({
    id: z.number(),
    status: z.enum(["draft", "requested", "approved", "active", "fulfilled", "expired", "cancelled"]),
    actNumber: z.string().optional(),
    actDate: z.date().optional(),
    validUntil: z.date().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return drawbackService.updateDrawbackStatus(
      input.id,
      ctx.user.id,
      input.status,
      input.actNumber,
      input.actDate,
      input.validUntil
    );
  }),
});
