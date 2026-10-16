/**
 * RFQ Schema - Request for Quotation
 * 
 * Schema do banco de dados para o módulo de solicitação de cotação.
 * Este é o ponto de entrada da plataforma: o importador descreve o que
 * quer importar e a Excambia orquestra todo o resto.
 * 
 * Fluxo: RFQ → Disparo para fornecedores → Respostas → Análise → Cotação consolidada
 * 
 * ADICIONAR ao arquivo drizzle/schema.ts existente
 */

import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint } from "drizzle-orm/mysql-core";

// ============================================================
// RFQ - Solicitação de Cotação (do importador)
// ============================================================

/**
 * RFQ principal - A solicitação do importador
 * Pode conter múltiplos itens/produtos
 */
export const rfqs = mysqlTable("rfqs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Identificação
  rfqNumber: varchar("rfqNumber", { length: 50 }).notNull(), // Auto-generated: RFQ-2026-0001
  title: varchar("title", { length: 255 }).notNull(), // Ex: "Pregos 17x27 para revenda"
  
  // Tipo de importação
  importPurpose: mysqlEnum("importPurpose", [
    "resale",           // Revenda
    "own_use",          // Uso próprio
    "industrialization", // Industrialização
    "temporary"         // Admissão temporária
  ]).default("resale").notNull(),
  
  // Dados do solicitante (pode ser o próprio usuário ou um cliente dele)
  requesterType: mysqlEnum("requesterType", [
    "self",     // O próprio usuário/empresa
    "client"    // Um cliente do usuário
  ]).default("self").notNull(),
  clientName: varchar("clientName", { length: 255 }),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientPhone: varchar("clientPhone", { length: 50 }),
  clientCompany: varchar("clientCompany", { length: 255 }),
  clientCnpj: varchar("clientCnpj", { length: 18 }),
  clientState: varchar("clientState", { length: 2 }), // UF do cliente (impacta tributação)
  
  // Preferências de origem
  preferredCountries: text("preferredCountries"), // JSON array: ["China", "India", "Turkey"]
  excludedCountries: text("excludedCountries"), // JSON array
  preferredIncoterm: mysqlEnum("preferredIncoterm", [
    "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"
  ]).default("FOB"),
  
  // Logística
  destinationState: varchar("destinationState", { length: 2 }).default("SC").notNull(),
  destinationPort: varchar("destinationPort", { length: 100 }), // Porto preferido
  urgency: mysqlEnum("urgency", [
    "standard",   // Normal: 60-90 dias
    "fast",       // Rápido: 30-45 dias
    "urgent"      // Urgente: ASAP
  ]).default("standard").notNull(),
  
  // Orçamento
  budgetMaxCents: bigint("budgetMaxCents", { mode: "number" }), // Orçamento máximo em centavos BRL
  targetPriceCents: bigint("targetPriceCents", { mode: "number" }), // Preço alvo por unidade em centavos BRL
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  
  // Status do fluxo
  status: mysqlEnum("status", [
    "draft",              // Rascunho
    "submitted",          // Enviada pelo importador
    "sourcing",           // Excambia buscando fornecedores
    "quotes_sent",        // Cotações enviadas para fornecedores
    "quotes_received",    // Respostas recebidas
    "analyzing",          // Excambia analisando respostas
    "ready",              // Cotação consolidada pronta
    "presented",          // Apresentada ao cliente
    "accepted",           // Aceita pelo cliente
    "rejected",           // Rejeitada pelo cliente
    "expired",            // Expirada
    "converted"           // Convertida em operação de importação
  ]).default("draft").notNull(),
  
  // Análise da Excambia
  excambiaAnalysis: text("excambiaAnalysis"), // JSON: análise completa
  excambiaVerdict: mysqlEnum("excambiaVerdict", ["GO", "NEGOTIATE", "NO_GO", "WAIT"]),
  excambiaScore: int("excambiaScore"), // 0-100
  excambiaRecommendation: text("excambiaRecommendation"),
  
  // Cotação consolidada final
  consolidatedQuoteId: int("consolidatedQuoteId"), // Referência à melhor cotação
  
  // Notas
  notes: text("notes"),
  internalNotes: text("internalNotes"), // Notas internas (não visíveis ao cliente)
  
  // Datas
  desiredDeliveryDate: timestamp("desiredDeliveryDate"),
  expiresAt: timestamp("expiresAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Rfq = typeof rfqs.$inferSelect;
export type InsertRfq = typeof rfqs.$inferInsert;

// ============================================================
// RFQ ITEMS - Itens/produtos da solicitação
// ============================================================

/**
 * Cada item é um produto que o importador quer cotar
 */
export const rfqItems = mysqlTable("rfq_items", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  
  // Produto
  productName: varchar("productName", { length: 255 }).notNull(),
  productNameEn: varchar("productNameEn", { length: 255 }), // Nome em inglês (para enviar ao fornecedor)
  productNameZh: varchar("productNameZh", { length: 255 }), // Nome em chinês (se aplicável)
  description: text("description"),
  
  // Classificação
  ncmCode: varchar("ncmCode", { length: 10 }),
  ncmSuggested: varchar("ncmSuggested", { length: 10 }), // NCM sugerido pela Excambia
  ncmConfirmed: boolean("ncmConfirmed").default(false).notNull(),
  hsCode: varchar("hsCode", { length: 10 }), // HS Code internacional (6 dígitos)
  
  // Especificações
  specifications: text("specifications"), // JSON: { material, dimensions, grade, standard, etc }
  qualityStandard: varchar("qualityStandard", { length: 100 }), // Ex: ABNT NBR 14432, ISO 9001
  
  // Quantidade
  quantity: int("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  minOrderQuantity: int("minOrderQuantity"), // MOQ do mercado
  
  // Preço referência
  targetUnitPriceCents: bigint("targetUnitPriceCents", { mode: "number" }), // Preço alvo por unidade (USD cents)
  marketReferencePriceCents: bigint("marketReferencePriceCents", { mode: "number" }), // Preço de referência do mercado
  lastImportPriceCents: bigint("lastImportPriceCents", { mode: "number" }), // Último preço importado
  
  // Peso e volume (para cálculo de frete)
  weightKgPerUnit: int("weightKgPerUnit"), // Peso em gramas por unidade
  volumeM3PerUnit: int("volumeM3PerUnit"), // Volume em cm³ por unidade
  
  // Embalagem
  packagingRequirements: text("packagingRequirements"),
  
  // Certificações necessárias
  certifications: text("certifications"), // JSON array: ["INMETRO", "ISO 9001", "CE"]
  
  // Amostra
  sampleRequired: boolean("sampleRequired").default(false).notNull(),
  sampleQuantity: int("sampleQuantity"),
  
  // Imagens de referência
  referenceImageUrls: text("referenceImageUrls"), // JSON array de URLs
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RfqItem = typeof rfqItems.$inferSelect;
export type InsertRfqItem = typeof rfqItems.$inferInsert;

// ============================================================
// SUPPLIER QUOTES - Cotações recebidas dos fornecedores
// ============================================================

/**
 * Cada cotação é a resposta de um fornecedor para uma RFQ
 */
export const supplierQuotes = mysqlTable("supplier_quotes", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  supplierId: int("supplierId"), // Referência ao suppliers table existente
  
  // Fornecedor (caso não esteja cadastrado)
  supplierName: varchar("supplierName", { length: 255 }).notNull(),
  supplierCountry: varchar("supplierCountry", { length: 100 }).notNull(),
  supplierContact: varchar("supplierContact", { length: 255 }),
  supplierEmail: varchar("supplierEmail", { length: 320 }),
  supplierPhone: varchar("supplierPhone", { length: 50 }),
  supplierPlatform: varchar("supplierPlatform", { length: 50 }), // alibaba, made-in-china, direct, etc
  
  // Cotação
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  incoterm: varchar("incoterm", { length: 3 }).default("FOB").notNull(),
  
  // Valores totais
  totalFobCents: bigint("totalFobCents", { mode: "number" }),
  totalCifCents: bigint("totalCifCents", { mode: "number" }),
  freightEstimateCents: bigint("freightEstimateCents", { mode: "number" }),
  
  // Condições
  paymentTerms: varchar("paymentTerms", { length: 255 }), // Ex: "30% TT advance, 70% against BL"
  leadTimeDays: int("leadTimeDays"), // Prazo de produção em dias
  moq: int("moq"), // Minimum Order Quantity
  validUntil: timestamp("validUntil"),
  
  // Documentos
  quotationFileUrl: varchar("quotationFileUrl", { length: 512 }),
  quotationFileKey: varchar("quotationFileKey", { length: 255 }),
  quotationFileName: varchar("quotationFileName", { length: 255 }),
  
  // Análise da Excambia
  excambiaScore: int("excambiaScore"), // 0-100
  excambiaAnalysis: text("excambiaAnalysis"), // JSON
  priceCompetitiveness: mysqlEnum("priceCompetitiveness", [
    "best",           // Melhor preço
    "competitive",    // Competitivo
    "above_average",  // Acima da média
    "expensive"       // Caro
  ]),
  
  // Status
  status: mysqlEnum("status", [
    "pending",      // Aguardando resposta
    "received",     // Resposta recebida
    "analyzing",    // Em análise
    "shortlisted",  // Pré-selecionado
    "selected",     // Selecionado (melhor)
    "rejected",     // Rejeitado
    "expired"       // Expirado
  ]).default("pending").notNull(),
  
  // Ranking
  overallRank: int("overallRank"), // Posição no ranking geral
  
  // Notas
  notes: text("notes"),
  
  // Canal de comunicação
  communicationChannel: mysqlEnum("communicationChannel", [
    "email", "wechat", "whatsapp", "alibaba_chat", "phone", "other"
  ]).default("email"),
  
  // Idioma da comunicação
  communicationLanguage: varchar("communicationLanguage", { length: 5 }).default("en"), // en, zh, pt
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierQuote = typeof supplierQuotes.$inferSelect;
export type InsertSupplierQuote = typeof supplierQuotes.$inferInsert;

// ============================================================
// SUPPLIER QUOTE ITEMS - Itens da cotação do fornecedor
// ============================================================

/**
 * Preços por item dentro de uma cotação de fornecedor
 */
export const supplierQuoteItems = mysqlTable("supplier_quote_items", {
  id: int("id").autoincrement().primaryKey(),
  supplierQuoteId: int("supplierQuoteId").notNull(),
  rfqItemId: int("rfqItemId").notNull(), // Referência ao item da RFQ
  
  // Preço
  unitPriceCents: bigint("unitPriceCents", { mode: "number" }).notNull(),
  totalPriceCents: bigint("totalPriceCents", { mode: "number" }).notNull(),
  quantity: int("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  
  // Variações de preço por volume
  priceBreaks: text("priceBreaks"), // JSON: [{ minQty: 1000, priceCents: 50 }, { minQty: 5000, priceCents: 45 }]
  
  // Especificações do fornecedor
  supplierProductName: varchar("supplierProductName", { length: 255 }),
  supplierSku: varchar("supplierSku", { length: 100 }),
  supplierSpecs: text("supplierSpecs"), // JSON
  
  // Disponibilidade
  inStock: boolean("inStock"),
  stockQuantity: int("stockQuantity"),
  productionDays: int("productionDays"),
  
  // Custo nacionalizado (calculado pela Excambia)
  nationalizedUnitCostCents: bigint("nationalizedUnitCostCents", { mode: "number" }),
  nationalizedTotalCostCents: bigint("nationalizedTotalCostCents", { mode: "number" }),
  
  // Comparação com target
  vsTargetPercent: int("vsTargetPercent"), // Diferença vs preço alvo em basis points (+500 = 5% acima)
  vsMarketPercent: int("vsMarketPercent"), // Diferença vs mercado
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierQuoteItem = typeof supplierQuoteItems.$inferSelect;
export type InsertSupplierQuoteItem = typeof supplierQuoteItems.$inferInsert;

// ============================================================
// CONSOLIDATED QUOTES - Cotação consolidada para o cliente
// ============================================================

/**
 * A cotação final que é apresentada ao importador/cliente
 * Inclui o melhor cenário calculado pela Excambia
 */
export const consolidatedQuotes = mysqlTable("consolidated_quotes", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  userId: int("userId").notNull(),
  selectedSupplierQuoteId: int("selectedSupplierQuoteId"), // Cotação do fornecedor selecionada
  
  // Identificação
  quoteNumber: varchar("quoteNumber", { length: 50 }).notNull(), // CQ-2026-0001
  
  // Cenário logístico
  selectedPort: varchar("selectedPort", { length: 100 }).notNull(),
  selectedState: varchar("selectedState", { length: 2 }).notNull(),
  incoterm: varchar("incoterm", { length: 3 }).default("FOB").notNull(),
  
  // Valores em centavos BRL
  totalFobCents: bigint("totalFobCents", { mode: "number" }).notNull(),
  totalFreightCents: bigint("totalFreightCents", { mode: "number" }).notNull(),
  totalInsuranceCents: bigint("totalInsuranceCents", { mode: "number" }).notNull(),
  totalCifCents: bigint("totalCifCents", { mode: "number" }).notNull(),
  
  // Tributos
  totalIiCents: bigint("totalIiCents", { mode: "number" }).notNull(),
  totalIpiCents: bigint("totalIpiCents", { mode: "number" }).notNull(),
  totalPisCents: bigint("totalPisCents", { mode: "number" }).notNull(),
  totalCofinsCents: bigint("totalCofinsCents", { mode: "number" }).notNull(),
  totalIcmsCents: bigint("totalIcmsCents", { mode: "number" }).notNull(),
  totalTaxesCents: bigint("totalTaxesCents", { mode: "number" }).notNull(),
  
  // Custos operacionais
  customsBrokerCents: bigint("customsBrokerCents", { mode: "number" }).default(0).notNull(),
  storageCents: bigint("storageCents", { mode: "number" }).default(0).notNull(),
  otherCostsCents: bigint("otherCostsCents", { mode: "number" }).default(0).notNull(),
  
  // Totais
  totalCostCents: bigint("totalCostCents", { mode: "number" }).notNull(),
  exchangeRate: bigint("exchangeRate", { mode: "number" }).notNull(), // Rate * 1000000
  
  // Markup e preço sugerido
  markupPercent: int("markupPercent").default(3000).notNull(),
  totalSuggestedPriceCents: bigint("totalSuggestedPriceCents", { mode: "number" }),
  
  // Fee da plataforma
  platformFeeCents: bigint("platformFeeCents", { mode: "number" }).default(0).notNull(),
  platformFeePercent: int("platformFeePercent").default(150).notNull(), // 1.5% = 150 basis points
  
  // Impacto da reforma tributária
  reformImpactJson: text("reformImpactJson"), // JSON com projeção 2025-2033
  
  // Análise Excambia
  excambiaVerdict: mysqlEnum("excambiaVerdict", ["GO", "NEGOTIATE", "NO_GO", "WAIT"]),
  excambiaScore: int("excambiaScore"),
  excambiaFullReport: text("excambiaFullReport"), // JSON completo do IntelligenceReport
  
  // Validade
  validUntil: timestamp("validUntil"),
  
  // Status
  status: mysqlEnum("status", [
    "draft",
    "ready",
    "sent",
    "viewed",
    "accepted",
    "rejected",
    "expired",
    "converted"
  ]).default("draft").notNull(),
  
  // Tracking
  sentAt: timestamp("sentAt"),
  viewedAt: timestamp("viewedAt"),
  respondedAt: timestamp("respondedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConsolidatedQuote = typeof consolidatedQuotes.$inferSelect;
export type InsertConsolidatedQuote = typeof consolidatedQuotes.$inferInsert;

// ============================================================
// SUPPLIER OUTREACH - Registro de comunicações com fornecedores
// ============================================================

/**
 * Log de todas as comunicações enviadas para fornecedores
 */
export const supplierOutreach = mysqlTable("supplier_outreach", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  supplierId: int("supplierId"),
  
  // Destinatário
  recipientName: varchar("recipientName", { length: 255 }).notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  recipientPhone: varchar("recipientPhone", { length: 50 }),
  
  // Canal
  channel: mysqlEnum("channel", [
    "email", "wechat", "whatsapp", "alibaba", "phone", "other"
  ]).notNull(),
  
  // Idioma
  language: varchar("language", { length: 5 }).default("en").notNull(),
  
  // Conteúdo
  subject: varchar("subject", { length: 255 }),
  messageContent: text("messageContent").notNull(),
  
  // Status
  status: mysqlEnum("status", [
    "draft",
    "queued",     // Na fila para envio
    "sent",       // Enviado
    "delivered",  // Entregue
    "read",       // Lido
    "replied",    // Respondido
    "bounced",    // Falhou
    "no_response" // Sem resposta (após prazo)
  ]).default("draft").notNull(),
  
  // Tracking
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  repliedAt: timestamp("repliedAt"),
  
  // Resposta vinculada
  supplierQuoteId: int("supplierQuoteId"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupplierOutreach = typeof supplierOutreach.$inferSelect;
export type InsertSupplierOutreach = typeof supplierOutreach.$inferInsert;
