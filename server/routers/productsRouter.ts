import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";

export const productsRouter = router({
list: protectedProcedure.query(async ({ ctx }) => {
  return db.getProductsByUser(ctx.user.id);
}),

get: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const product = await db.getProductById(input.id, ctx.user.id);
    if (!product) throw new TRPCError({ code: "NOT_FOUND" });
    return product;
  }),

create: protectedProcedure
  .input(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    ncmCode: z.string().min(8).max(10),
    unit: z.string().default("UN"),
    weightKg: z.number().optional(),
    volumeM3: z.number().optional(),
    supplierId: z.number().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return db.createProduct({ ...input, userId: ctx.user.id });
  }),

update: protectedProcedure
  .input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    ncmCode: z.string().min(8).max(10).optional(),
    unit: z.string().optional(),
    weightKg: z.number().optional(),
    volumeM3: z.number().optional(),
    supplierId: z.number().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    return db.updateProduct(id, ctx.user.id, data);
  }),

delete: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return db.deleteProduct(input.id, ctx.user.id);
  }),
});
