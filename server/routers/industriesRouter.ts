import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";

export const industriesRouter = router({
list: protectedProcedure.query(async ({ ctx }) => {
  return db.getIndustriesByUser(ctx.user.id);
}),

get: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const industry = await db.getIndustryById(input.id, ctx.user.id);
    if (!industry) throw new TRPCError({ code: "NOT_FOUND" });
    return industry;
  }),

create: protectedProcedure
  .input(z.object({
    name: z.string().min(1),
    tradeName: z.string().optional(),
    registrationNumber: z.string().optional(),
    website: z.string().optional(),
    sector: z.enum(["metals","construction","machinery","electronics","chemicals","textiles","food","automotive","plastics","wood","packaging","energy","other"]).default("other"),
    subsector: z.string().optional(),
    country: z.string().min(1),
    state: z.string().optional(),
    city: z.string().optional(),
    address: z.string().optional(),
    postalCode: z.string().optional(),
    region: z.enum(["asia_china","asia_india","asia_southeast","asia_other","europe_west","europe_east","north_america","south_america","middle_east","africa","oceania"]).default("asia_china"),
    contactName: z.string().optional(),
    contactRole: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    contactWhatsapp: z.string().optional(),
    contactWechat: z.string().optional(),
    isMercosul: z.boolean().default(false),
    preferredIncoterm: z.enum(["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"]).default("FOB"),
    preferredCurrency: z.string().default("USD"),
    paymentTerms: z.string().optional(),
    minOrderValue: z.number().optional(),
    leadTimeDays: z.number().optional(),
    productionCapacity: z.string().optional(),
    certifications: z.string().optional(),
    yearEstablished: z.number().optional(),
    employeeCount: z.number().optional(),
    preferredLanguage: z.enum(["pt","en","es","zh","ar","fr","de","it","ja","ko"]).default("en"),
    preferredChannel: z.enum(["email","whatsapp","wechat","phone","alibaba","other"]).default("email"),
    status: z.enum(["active","prospect","inactive","blacklisted"]).default("prospect"),
    notes: z.string().optional(),
    tags: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return db.createIndustry({ ...input, userId: ctx.user.id });
  }),

update: protectedProcedure
  .input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    tradeName: z.string().optional(),
    registrationNumber: z.string().optional(),
    website: z.string().optional(),
    sector: z.enum(["metals","construction","machinery","electronics","chemicals","textiles","food","automotive","plastics","wood","packaging","energy","other"]).optional(),
    subsector: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    address: z.string().optional(),
    postalCode: z.string().optional(),
    region: z.enum(["asia_china","asia_india","asia_southeast","asia_other","europe_west","europe_east","north_america","south_america","middle_east","africa","oceania"]).optional(),
    contactName: z.string().optional(),
    contactRole: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    contactWhatsapp: z.string().optional(),
    contactWechat: z.string().optional(),
    isMercosul: z.boolean().optional(),
    preferredIncoterm: z.enum(["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"]).optional(),
    preferredCurrency: z.string().optional(),
    paymentTerms: z.string().optional(),
    minOrderValue: z.number().optional(),
    leadTimeDays: z.number().optional(),
    productionCapacity: z.string().optional(),
    certifications: z.string().optional(),
    yearEstablished: z.number().optional(),
    employeeCount: z.number().optional(),
    preferredLanguage: z.enum(["pt","en","es","zh","ar","fr","de","it","ja","ko"]).optional(),
    preferredChannel: z.enum(["email","whatsapp","wechat","phone","alibaba","other"]).optional(),
    status: z.enum(["active","prospect","inactive","blacklisted"]).optional(),
    notes: z.string().optional(),
    tags: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    return db.updateIndustry(id, ctx.user.id, data);
  }),

delete: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return db.deleteIndustry(input.id, ctx.user.id);
  }),

search: protectedProcedure
  .input(z.object({ query: z.string() }))
  .query(async ({ ctx, input }) => {
    return db.searchIndustries(ctx.user.id, input.query);
  }),

bySector: protectedProcedure
  .input(z.object({ sector: z.string() }))
  .query(async ({ ctx, input }) => {
    return db.getIndustriesBySector(ctx.user.id, input.sector);
  }),

stats: protectedProcedure.query(async ({ ctx }) => {
  return db.getIndustryStats(ctx.user.id);
}),

// Contatos
contacts: router({
  list: protectedProcedure
    .input(z.object({ industryId: z.number() }))
    .query(async ({ input }) => {
      return db.getContactsByIndustry(input.industryId);
    }),

  create: protectedProcedure
    .input(z.object({
      industryId: z.number(),
      name: z.string().min(1),
      role: z.string().optional(),
      department: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      wechat: z.string().optional(),
      skype: z.string().optional(),
      preferredChannel: z.enum(["email","whatsapp","wechat","phone","skype","other"]).default("email"),
      language: z.enum(["pt","en","es","zh","ar","fr","de","it","ja","ko"]).default("en"),
      isPrimary: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createIndustryContact(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      role: z.string().optional(),
      department: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      wechat: z.string().optional(),
      skype: z.string().optional(),
      preferredChannel: z.enum(["email","whatsapp","wechat","phone","skype","other"]).optional(),
      language: z.enum(["pt","en","es","zh","ar","fr","de","it","ja","ko"]).optional(),
      isPrimary: z.boolean().optional(),
      isActive: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateIndustryContact(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return db.deleteIndustryContact(input.id);
    }),
}),

// Produtos do catálogo
products: router({
  list: protectedProcedure
    .input(z.object({ industryId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getProductsByIndustry(input.industryId, ctx.user.id);
    }),

  create: protectedProcedure
    .input(z.object({
      industryId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
      sku: z.string().optional(),
      ncmCode: z.string().optional(),
      hsCode: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      specifications: z.string().optional(),
      unit: z.string().default("UN"),
      weightPerUnit: z.string().optional(),
      priceExw: z.number().optional(),
      priceFob: z.number().optional(),
      priceCif: z.number().optional(),
      currency: z.string().default("USD"),
      moq: z.number().optional(),
      leadTimeDays: z.number().optional(),
      packagingInfo: z.string().optional(),
      qualityGrade: z.string().optional(),
      certifications: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.createIndustryProduct({ ...input, userId: ctx.user.id });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      sku: z.string().optional(),
      ncmCode: z.string().optional(),
      hsCode: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      specifications: z.string().optional(),
      unit: z.string().optional(),
      weightPerUnit: z.string().optional(),
      priceExw: z.number().optional(),
      priceFob: z.number().optional(),
      priceCif: z.number().optional(),
      currency: z.string().optional(),
      moq: z.number().optional(),
      leadTimeDays: z.number().optional(),
      packagingInfo: z.string().optional(),
      qualityGrade: z.string().optional(),
      certifications: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return db.updateIndustryProduct(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return db.deleteIndustryProduct(input.id, ctx.user.id);
    }),

  ranking: protectedProcedure
    .input(z.object({ ncmCode: z.string().optional(), category: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return db.getProductRanking(ctx.user.id, input.ncmCode, input.category);
    }),
}),

// Ratings
ratings: router({
  list: protectedProcedure
    .input(z.object({ industryId: z.number() }))
    .query(async ({ input }) => {
      return db.getRatingsByIndustry(input.industryId);
    }),

  create: protectedProcedure
    .input(z.object({
      industryId: z.number(),
      quotationId: z.number().optional(),
      productId: z.number().optional(),
      priceScore: z.number().min(1).max(5),
      qualityScore: z.number().min(1).max(5),
      deliveryScore: z.number().min(1).max(5),
      communicationScore: z.number().min(1).max(5),
      comment: z.string().optional(),
      orderDate: z.date().optional(),
      orderValue: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.createSupplierRating({ ...input, userId: ctx.user.id });
    }),
}),
});
