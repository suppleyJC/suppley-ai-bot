/**
 * RFQ Router - API endpoints para o módulo de Request for Quotation
 * 
 * Endpoints para criar, gerenciar e processar RFQs.
 * Integra com Excambia para análise inteligente e geração de cotações.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, desc, and } from "drizzle-orm";
import { mysqlTable, int, varchar, text, timestamp, boolean, bigint, mysqlEnum } from "drizzle-orm/mysql-core";

import {
  generateRfqNumber,
  generateQuoteNumber,
  suggestNcm,
  generateSupplierMessage,
  optimizePortAndState,
  estimateTimeline,
  calculatePlatformFee,
  validateRfqInput,
  type RfqInput,
  type RfqItemInput,
} from "../services/rfqService";

// ============================================================
// INLINE TABLE DEFINITIONS (espelham as tabelas criadas via SQL)
// ============================================================

const rfqs = mysqlTable("rfqs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  rfqNumber: varchar("rfqNumber", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  importPurpose: mysqlEnum("importPurpose", ["resale", "own_use", "industrialization", "temporary"]).default("resale").notNull(),
  requesterType: mysqlEnum("requesterType", ["self", "client"]).default("self").notNull(),
  clientName: varchar("clientName", { length: 255 }),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientPhone: varchar("clientPhone", { length: 50 }),
  clientCompany: varchar("clientCompany", { length: 255 }),
  clientCnpj: varchar("clientCnpj", { length: 18 }),
  clientState: varchar("clientState", { length: 2 }),
  preferredCountries: text("preferredCountries"),
  excludedCountries: text("excludedCountries"),
  preferredIncoterm: mysqlEnum("preferredIncoterm", ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]).default("FOB"),
  destinationState: varchar("destinationState", { length: 2 }).default("SC").notNull(),
  destinationPort: varchar("destinationPort", { length: 100 }),
  urgency: mysqlEnum("urgency", ["standard", "fast", "urgent"]).default("standard").notNull(),
  budgetMaxCents: bigint("budgetMaxCents", { mode: "number" }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  status: mysqlEnum("status", ["draft", "submitted", "sourcing", "quotes_sent", "quotes_received", "analyzing", "ready", "presented", "accepted", "rejected", "expired", "converted"]).default("draft").notNull(),
  excambiaScore: int("excambiaScore"),
  excambiaVerdict: mysqlEnum("excambiaVerdict", ["GO", "NEGOTIATE", "NO_GO", "WAIT"]),
  excambiaAnalysis: text("excambiaAnalysis"),
  notes: text("notes"),
  desiredDeliveryDate: timestamp("desiredDeliveryDate"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

const rfqItems = mysqlTable("rfq_items", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  productNameEn: varchar("productNameEn", { length: 255 }),
  productNameZh: varchar("productNameZh", { length: 255 }),
  description: text("description"),
  ncmCode: varchar("ncmCode", { length: 10 }),
  ncmSuggested: varchar("ncmSuggested", { length: 10 }),
  ncmConfirmed: boolean("ncmConfirmed").default(false).notNull(),
  qualityStandard: varchar("qualityStandard", { length: 100 }),
  quantity: int("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  targetUnitPriceCents: bigint("targetUnitPriceCents", { mode: "number" }),
  weightKgPerUnit: int("weightKgPerUnit"),
  certifications: text("certifications"),
  sampleRequired: boolean("sampleRequired").default(false).notNull(),
  sampleQuantity: int("sampleQuantity"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

const supplierQuotes = mysqlTable("supplier_quotes", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  supplierName: varchar("supplierName", { length: 255 }).notNull(),
  supplierCountry: varchar("supplierCountry", { length: 100 }).notNull(),
  supplierContact: varchar("supplierContact", { length: 255 }),
  supplierEmail: varchar("supplierEmail", { length: 320 }),
  supplierPhone: varchar("supplierPhone", { length: 50 }),
  supplierPlatform: varchar("supplierPlatform", { length: 50 }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  incoterm: varchar("incoterm", { length: 3 }).default("FOB").notNull(),
  totalFobCents: bigint("totalFobCents", { mode: "number" }),
  paymentTerms: varchar("paymentTerms", { length: 255 }),
  leadTimeDays: int("leadTimeDays"),
  moq: int("moq"),
  excambiaScore: int("excambiaScore"),
  status: mysqlEnum("status", ["pending", "received", "analyzing", "shortlisted", "selected", "rejected", "expired"]).default("pending").notNull(),
  communicationChannel: mysqlEnum("communicationChannel", ["email", "wechat", "whatsapp", "alibaba_chat", "phone", "other"]).default("email"),
  communicationLanguage: varchar("communicationLanguage", { length: 5 }).default("en"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

const supplierQuoteItems = mysqlTable("supplier_quote_items", {
  id: int("id").autoincrement().primaryKey(),
  supplierQuoteId: int("supplierQuoteId").notNull(),
  rfqItemId: int("rfqItemId"),
  productName: varchar("productName", { length: 255 }).notNull(),
  unitPriceCents: bigint("unitPriceCents", { mode: "number" }),
  totalPriceCents: bigint("totalPriceCents", { mode: "number" }),
  quantity: int("quantity"),
  unit: varchar("unit", { length: 20 }).default("UN"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================================
// SCHEMAS DE VALIDAÇÃO
// ============================================================

const rfqItemSchema = z.object({
  productName: z.string().min(2, "Nome do produto é obrigatório"),
  productNameEn: z.string().optional(),
  productNameZh: z.string().optional(),
  description: z.string().optional(),
  ncmCode: z.string().optional(),
  qualityStandard: z.string().optional(),
  quantity: z.number().int().positive("Quantidade deve ser positiva"),
  unit: z.string().default("UN"),
  targetUnitPriceCents: z.number().optional(),
  weightKgPerUnit: z.number().optional(),
  certifications: z.array(z.string()).optional(),
  sampleRequired: z.boolean().default(false),
  sampleQuantity: z.number().optional(),
});

const createRfqSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  importPurpose: z.enum(["resale", "own_use", "industrialization", "temporary"]).default("resale"),
  requesterType: z.enum(["self", "client"]).default("self"),
  clientInfo: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    cnpj: z.string().optional(),
    state: z.string().length(2).optional(),
  }).optional(),
  items: z.array(rfqItemSchema).min(1, "Pelo menos um item é necessário"),
  preferences: z.object({
    preferredCountries: z.array(z.string()).optional(),
    excludedCountries: z.array(z.string()).optional(),
    preferredIncoterm: z.enum(["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"]).default("FOB"),
    destinationState: z.string().length(2).default("SC"),
    destinationPort: z.string().optional(),
    urgency: z.enum(["standard", "fast", "urgent"]).default("standard"),
    budgetMaxCents: z.number().optional(),
    currency: z.string().default("USD"),
  }),
  notes: z.string().optional(),
  desiredDeliveryDate: z.string().optional(),
});

const addSupplierQuoteSchema = z.object({
  rfqId: z.number().int().positive(),
  supplierName: z.string().min(2),
  supplierCountry: z.string().min(2),
  supplierContact: z.string().optional(),
  supplierEmail: z.string().email().optional(),
  supplierPhone: z.string().optional(),
  supplierPlatform: z.string().optional(),
  currency: z.string().default("USD"),
  incoterm: z.string().default("FOB"),
  paymentTerms: z.string().optional(),
  leadTimeDays: z.number().optional(),
  moq: z.number().optional(),
  items: z.array(z.object({
    rfqItemId: z.number().int().positive(),
    unitPriceCents: z.number().int().positive(),
    quantity: z.number().int().positive(),
    unit: z.string().default("UN"),
    supplierProductName: z.string().optional(),
    notes: z.string().optional(),
  })).min(1),
  communicationChannel: z.enum(["email", "wechat", "whatsapp", "alibaba_chat", "phone", "other"]).default("email"),
  communicationLanguage: z.string().default("en"),
  notes: z.string().optional(),
});

// ============================================================
// ROUTER DEFINITION
// ============================================================

export const rfqRouter = router({
  
  // ---- CRIAR RFQ ----
  create: protectedProcedure
    .input(createRfqSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      
      const rfqNumber = generateRfqNumber();
      const userId = ctx.user.id;
      
      const result = await db.insert(rfqs).values({
        userId,
        rfqNumber,
        title: input.title,
        importPurpose: input.importPurpose,
        requesterType: input.requesterType,
        clientName: input.clientInfo?.name,
        clientEmail: input.clientInfo?.email,
        clientPhone: input.clientInfo?.phone,
        clientCompany: input.clientInfo?.company,
        clientCnpj: input.clientInfo?.cnpj,
        clientState: input.clientInfo?.state,
        preferredCountries: input.preferences.preferredCountries
          ? JSON.stringify(input.preferences.preferredCountries)
          : undefined,
        excludedCountries: input.preferences.excludedCountries
          ? JSON.stringify(input.preferences.excludedCountries)
          : undefined,
        preferredIncoterm: input.preferences.preferredIncoterm,
        destinationState: input.preferences.destinationState,
        destinationPort: input.preferences.destinationPort,
        urgency: input.preferences.urgency,
        budgetMaxCents: input.preferences.budgetMaxCents,
        currency: input.preferences.currency,
        status: "submitted",
        notes: input.notes,
        desiredDeliveryDate: input.desiredDeliveryDate
          ? new Date(input.desiredDeliveryDate)
          : undefined,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      
      const rfqId = Number((result[0] as any).insertId);
      
      // Criar itens com sugestão automática de NCM
      const createdItems = [];
      for (const item of input.items) {
        const ncmSuggestion = item.ncmCode ? null : suggestNcm(item.productName, item.description);
        
        await db.insert(rfqItems).values({
          rfqId,
          productName: item.productName,
          productNameEn: item.productNameEn,
          description: item.description,
          ncmCode: item.ncmCode || ncmSuggestion?.ncmCode || undefined,
          ncmSuggested: ncmSuggestion?.ncmCode || undefined,
          ncmConfirmed: !!item.ncmCode,
          qualityStandard: item.qualityStandard,
          quantity: item.quantity,
          unit: item.unit || "UN",
          targetUnitPriceCents: item.targetUnitPriceCents,
          weightKgPerUnit: item.weightKgPerUnit,
          certifications: item.certifications
            ? JSON.stringify(item.certifications)
            : undefined,
          sampleRequired: item.sampleRequired || false,
          sampleQuantity: item.sampleQuantity,
        });
        
        createdItems.push({ ncmSuggestion });
      }
      
      return { rfqId, rfqNumber, items: createdItems, status: "submitted" };
    }),
  
  // ---- LISTAR RFQs ----
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      
      const conditions = [eq(rfqs.userId, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(rfqs.status, input.status as any));
      }
      
      return db.select()
        .from(rfqs)
        .where(and(...conditions))
        .orderBy(desc(rfqs.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),
  
  // ---- OBTER RFQ COM DETALHES ----
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      
      const rfqList = await db.select()
        .from(rfqs)
        .where(and(eq(rfqs.id, input.id), eq(rfqs.userId, ctx.user.id)))
        .limit(1);
      
      if (!rfqList.length) throw new Error("RFQ não encontrada");
      
      const items = await db.select()
        .from(rfqItems)
        .where(eq(rfqItems.rfqId, input.id));
      
      const quotes = await db.select()
        .from(supplierQuotes)
        .where(eq(supplierQuotes.rfqId, input.id))
        .orderBy(desc(supplierQuotes.excambiaScore));
      
      return {
        ...rfqList[0],
        items,
        supplierQuotes: quotes,
      };
    }),
  
  // ---- SUGERIR NCM ----
  suggestNcm: protectedProcedure
    .input(z.object({
      productName: z.string(),
      description: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return suggestNcm(input.productName, input.description);
    }),
  
  // ---- ADICIONAR COTAÇÃO DE FORNECEDOR ----
  addSupplierQuote: protectedProcedure
    .input(addSupplierQuoteSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      
      // Verificar que a RFQ pertence ao usuário
      const rfqList = await db.select()
        .from(rfqs)
        .where(and(eq(rfqs.id, input.rfqId), eq(rfqs.userId, ctx.user.id)))
        .limit(1);
      if (!rfqList.length) throw new Error("RFQ não encontrada");
      
      const result = await db.insert(supplierQuotes).values({
        rfqId: input.rfqId,
        supplierName: input.supplierName,
        supplierCountry: input.supplierCountry,
        supplierContact: input.supplierContact,
        supplierEmail: input.supplierEmail,
        supplierPhone: input.supplierPhone,
        supplierPlatform: input.supplierPlatform,
        currency: input.currency,
        incoterm: input.incoterm,
        paymentTerms: input.paymentTerms,
        leadTimeDays: input.leadTimeDays,
        moq: input.moq,
        communicationChannel: input.communicationChannel,
        communicationLanguage: input.communicationLanguage,
        notes: input.notes,
        status: "received",
      });
      
      const quoteId = Number((result[0] as any).insertId);
      
      // Calcular total FOB e inserir itens
      let totalFobCents = 0;
      for (const item of input.items) {
        const total = item.unitPriceCents * item.quantity;
        totalFobCents += total;
        
        await db.insert(supplierQuoteItems).values({
          supplierQuoteId: quoteId,
          rfqItemId: item.rfqItemId,
          productName: item.supplierProductName || `Item ${item.rfqItemId}`,
          unitPriceCents: item.unitPriceCents,
          totalPriceCents: total,
          quantity: item.quantity,
          unit: item.unit || "UN",
          notes: item.notes,
        });
      }
      
      // Atualizar total FOB
      await db.update(supplierQuotes)
        .set({ totalFobCents })
        .where(eq(supplierQuotes.id, quoteId));
      
      return { quoteId, totalFobCents };
    }),
  
  // ---- DASHBOARD STATS ----
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { totalRfqs: 0, activeRfqs: 0, convertedRfqs: 0, conversionRate: 0, averageScore: 0 };
      
      const allRfqs = await db.select()
        .from(rfqs)
        .where(eq(rfqs.userId, ctx.user.id));
      
      const total = allRfqs.length;
      const active = allRfqs.filter((r) => !["expired", "rejected", "converted"].includes(r.status)).length;
      const converted = allRfqs.filter((r) => r.status === "converted").length;
      const scoredRfqs = allRfqs.filter((r) => r.excambiaScore !== null && r.excambiaScore !== undefined);
      const avgScore = scoredRfqs.length > 0
        ? scoredRfqs.reduce((sum, r) => sum + (r.excambiaScore || 0), 0) / scoredRfqs.length
        : 0;
      
      return {
        totalRfqs: total,
        activeRfqs: active,
        convertedRfqs: converted,
        conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
        averageScore: Math.round(avgScore),
      };
    }),
});

// ============================================================
// EXPORT das funções para uso direto (sem tRPC)
// ============================================================

export {
  generateRfqNumber,
  generateQuoteNumber,
  suggestNcm,
  generateSupplierMessage,
  optimizePortAndState,
  estimateTimeline,
  calculatePlatformFee,
  validateRfqInput,
};

export const rfqRouterSchemas = {
  createRfqSchema,
  addSupplierQuoteSchema,
  rfqItemSchema,
};
