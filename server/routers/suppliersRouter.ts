import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import * as autoSupplierService from "../services/autoSupplierService";

export const suppliersRouter = router({
list: protectedProcedure.query(async ({ ctx }) => {
  return db.getSuppliersByUser(ctx.user.id);
}),

get: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const supplier = await db.getSupplierById(input.id, ctx.user.id);
    if (!supplier) throw new TRPCError({ code: "NOT_FOUND" });
    return supplier;
  }),

create: protectedProcedure
  .input(z.object({
    name: z.string().min(1),
    country: z.string().min(1),
    city: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    notes: z.string().optional(),
    isMercosul: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    return db.createSupplier({ ...input, userId: ctx.user.id });
  }),

update: protectedProcedure
  .input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    city: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    notes: z.string().optional(),
    isMercosul: z.boolean().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    return db.updateSupplier(id, ctx.user.id, data);
  }),

delete: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return db.deleteSupplier(input.id, ctx.user.id);
  }),

// Cadastro automático de fornecedor a partir de cotação
autoCreate: protectedProcedure
  .input(z.object({
    quotationText: z.string(),
    supplierName: z.string().optional(),
    supplierCountry: z.string().optional(),
    productNames: z.array(z.string()).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const result = await autoSupplierService.processQuotationForSupplier(
      ctx.user.id,
      input.quotationText,
      input.supplierName,
      input.supplierCountry,
      input.productNames
    );
    return result;
  }),

// Buscar fornecedor existente por nome
findByName: protectedProcedure
  .input(z.object({ name: z.string() }))
  .query(async ({ ctx, input }) => {
    return autoSupplierService.findExistingSupplier(ctx.user.id, input.name);
  }),
});
