import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import { normalizeProductName } from "../services/priceComparisonService";

/** Campos de classificação compartilhados entre create/update. */
const classificationFields = {
  categoria: z.string().optional(),
  subcategoria: z.string().optional(),
  classe: z.string().optional(),
  criticidade: z.enum(["alta", "media", "baixa"]).optional(),
  tags: z.array(z.string()).optional(),
  aplicacao: z.string().optional(),
};

export const productsRouter = router({
list: protectedProcedure.query(async ({ ctx }) => {
  const products = await db.getProductsByUser(ctx.user.id);

  // Enriquece cada produto com a ÚLTIMA cotação registrada no histórico de
  // proformas (casando por nome normalizado — mesma lógica do histórico de
  // preço). Assim o card mostra o preço dado pelo fornecedor ao distribuir o
  // PDF, sem digitação manual. Best-effort: se não houver histórico, vem null.
  let items: Awaited<ReturnType<typeof db.getProformaItemsWithContext>> = [];
  try {
    items = await db.getProformaItemsWithContext(ctx.user.id);
  } catch {
    items = [];
  }
  const latestByName = new Map<string, (typeof items)[number]>();
  for (const it of items) {
    const key = normalizeProductName(it.productName);
    const cur = latestByName.get(key);
    if (!cur || it.quotationDate.getTime() > cur.quotationDate.getTime()) {
      latestByName.set(key, it);
    }
  }

  return products.map((p) => {
    const last = latestByName.get(normalizeProductName(p.name));
    return {
      ...p,
      latestPrice: last
        ? {
            unitPriceCents: last.unitPriceCents,
            currency: last.currency,
            quotationDate: last.quotationDate,
            supplierName: last.supplierName,
          }
        : null,
    };
  });
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
    ...classificationFields,
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
    ...classificationFields,
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
