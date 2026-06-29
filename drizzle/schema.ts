import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint, json, decimal, index, unique } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: mysqlEnum("loginMethod", ["email", "oauth", "apple", "google", "manus"]).default("email").notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isEmailVerified: boolean("isEmailVerified").default(false).notNull(),
  resetPasswordToken: varchar("resetPasswordToken", { length: 255 }),
  resetPasswordExpires: timestamp("resetPasswordExpires"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Suppliers table - Foreign suppliers/manufacturers
 */
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  notes: text("notes"),
  isMercosul: boolean("isMercosul").default(false).notNull(),

  // ===== FASE 5: Fornecedores / Fabricantes (ampliação aditiva) =====
  tipo: mysqlEnum("tipo", [
    "fabrica", "trading", "distribuidor", "exportador", "representante",
    "fornecedor_nacional", "fabricante_nacional", "importador_local", "distribuidor_brasileiro",
  ]).default("fabrica"),
  origem: mysqlEnum("origem", ["nacional", "internacional"]).default("internacional"),
  categorias: json("categorias"),              // string[] de categorias atendidas
  moedas: json("moedas"),                      // string[] de moedas usadas
  incotermsPraticados: json("incotermsPraticados"),
  leadTimeMedioDias: int("leadTimeMedioDias"),
  ratingScore: int("ratingScore"),             // 0-100 (Agente de Rating)
  ratingClasse: mysqlEnum("ratingClasse", ["A", "B", "C", "D"]),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

/**
 * Products table - Products being imported
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  supplierId: int("supplierId"),
  // 1024: acomoda nomes de produto com specs completas vindos da distribuição
  // de proformas (não é indexado, sem risco de limite de índice).
  name: varchar("name", { length: 1024 }).notNull(),
  description: text("description"),
  ncmCode: varchar("ncmCode", { length: 10 }).notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  weightKg: int("weightKg"), // Weight in grams (to avoid decimals)
  volumeM3: int("volumeM3"), // Volume in cm³ (to avoid decimals)

  // ===== FASE 5: Ativos & Insumos (ampliação aditiva) =====
  categoria: varchar("categoria", { length: 120 }),
  // subcategoria: segundo nível hierárquico abaixo de `categoria`.
  subcategoria: varchar("subcategoria", { length: 120 }),
  // classe: família operacional do item (Fixadores, Escoramento, EPI…),
  // usada para agrupar e filtrar o catálogo de forma escalável.
  classe: varchar("classe", { length: 80 }),
  // criticidade de suprimento (impacto na operação se faltar).
  criticidade: mysqlEnum("criticidade", ["alta", "media", "baixa"]),
  // tags livres (string[]): etiquetas múltiplas para busca/filtro flexível.
  tags: json("tags"),
  aplicacao: varchar("aplicacao", { length: 255 }),
  material: varchar("material", { length: 120 }),
  dimensoes: varchar("dimensoes", { length: 120 }),
  // NCM já existe como ncmCode; este campo guarda o estado de validação:
  ncmStatus: mysqlEnum("ncmStatus", ["sugerido", "validado"]).default("sugerido"),
  origem: mysqlEnum("origem", [
    "nacional", "internacional", "ambos", "importado_antes", "cotado_nao_importado",
  ]).default("cotado_nao_importado"),
  paisOrigem: varchar("paisOrigem", { length: 100 }),
  moqPadrao: int("moqPadrao"),
  leadTimeMedioDias: int("leadTimeMedioDias"),
  // comparativo nacional × importado (snapshot calculado):
  custoNacionalRefCents: bigint("custoNacionalRefCents", { mode: "number" }),
  custoImportadoRefCents: bigint("custoImportadoRefCents", { mode: "number" }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * NCM Tax Rates table - Tax rates by NCM code
 */
export const ncmTaxRates = mysqlTable("ncm_tax_rates", {
  id: int("id").autoincrement().primaryKey(),
  ncmCode: varchar("ncmCode", { length: 10 }).notNull().unique(),
  description: text("description"),
  iiRate: int("iiRate").default(0).notNull(), // II rate in basis points (1% = 100)
  ipiRate: int("ipiRate").default(0).notNull(), // IPI rate in basis points
  pisRate: int("pisRate").default(216).notNull(), // PIS rate (2.16% = 216)
  cofinsRate: int("cofinsRate").default(1000).notNull(), // COFINS rate (10% = 1000)
  mercosulIiRate: int("mercosulIiRate").default(0).notNull(), // Mercosul preferential II rate
  notes: text("notes"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NcmTaxRate = typeof ncmTaxRates.$inferSelect;
export type InsertNcmTaxRate = typeof ncmTaxRates.$inferInsert;

/**
 * ICMS Rates by State
 */
export const icmsRates = mysqlTable("icms_rates", {
  id: int("id").autoincrement().primaryKey(),
  stateCode: varchar("stateCode", { length: 2 }).notNull().unique(),
  stateName: varchar("stateName", { length: 100 }).notNull(),
  internalRate: int("internalRate").default(1700).notNull(), // Internal ICMS rate in basis points (17% = 1700)
  importRate: int("importRate").default(400).notNull(), // ICMS interestadual para produtos importados (4% = 400) - Res. Senado 13/2012
  icmsAntecipadoRate: int("icmsAntecipadoRate").default(100).notNull(), // ICMS Antecipado na importação (1% = 100 para SC)
  interstateRate: int("interstateRate").default(1200).notNull(), // Interstate rate (12% = 1200)
  hasIncentive: boolean("hasIncentive").default(false).notNull(),
  incentiveDescription: text("incentiveDescription"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IcmsRate = typeof icmsRates.$inferSelect;
export type InsertIcmsRate = typeof icmsRates.$inferInsert;

/**
 * Exchange Rates cache
 */
export const exchangeRates = mysqlTable("exchange_rates", {
  id: int("id").autoincrement().primaryKey(),
  fromCurrency: varchar("fromCurrency", { length: 3 }).notNull(),
  toCurrency: varchar("toCurrency", { length: 3 }).notNull(),
  rate: bigint("rate", { mode: "number" }).notNull(), // Rate * 1000000 for precision
  source: varchar("source", { length: 50 }).notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type InsertExchangeRate = typeof exchangeRates.$inferInsert;

/**
 * Import Calculations - Main calculation records
 */
export const importCalculations = mysqlTable("import_calculations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId"),
  supplierId: int("supplierId"),
  quotationId: int("quotationId"), // Reference to quotations table
  
  // Basic info
  productName: varchar("productName", { length: 255 }).notNull(),
  ncmCode: varchar("ncmCode", { length: 10 }).notNull(),
  quantity: int("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  
  // Origin info
  originCountry: varchar("originCountry", { length: 100 }).notNull(),
  isMercosul: boolean("isMercosul").default(false).notNull(),
  destinationState: varchar("destinationState", { length: 2 }).default("SC").notNull(),
  
  // Values in cents (to avoid decimals)
  fobValueCents: bigint("fobValueCents", { mode: "number" }).notNull(), // FOB in original currency
  fobCurrency: varchar("fobCurrency", { length: 3 }).default("USD").notNull(),
  freightCents: bigint("freightCents", { mode: "number" }).default(0).notNull(),
  insuranceCents: bigint("insuranceCents", { mode: "number" }).default(0).notNull(),
  
  // Exchange rate used (rate * 1000000)
  exchangeRate: bigint("exchangeRate", { mode: "number" }).notNull(),
  
  // Calculated values in BRL cents
  cifBrlCents: bigint("cifBrlCents", { mode: "number" }).notNull(),
  iiValueCents: bigint("iiValueCents", { mode: "number" }).notNull(),
  ipiValueCents: bigint("ipiValueCents", { mode: "number" }).notNull(),
  pisValueCents: bigint("pisValueCents", { mode: "number" }).notNull(),
  cofinsValueCents: bigint("cofinsValueCents", { mode: "number" }).notNull(),
  icmsValueCents: bigint("icmsValueCents", { mode: "number" }).notNull(),
  
  // Additional costs in BRL cents
  customsBrokerCents: bigint("customsBrokerCents", { mode: "number" }).default(0).notNull(),
  storageCents: bigint("storageCents", { mode: "number" }).default(0).notNull(),
  otherCostsCents: bigint("otherCostsCents", { mode: "number" }).default(0).notNull(),

  // TTD SC - ICMS diferido/antecipado
  icmsAntecipadoCents: bigint("icmsAntecipadoCents", { mode: "number" }).default(0).notNull(),
  icmsDiferidoCents: bigint("icmsDiferidoCents", { mode: "number" }).default(0).notNull(),

  // Financial costs
  iofCents: bigint("iofCents", { mode: "number" }).default(0).notNull(),
  spreadCents: bigint("spreadCents", { mode: "number" }).default(0).notNull(),

  // Customs value adjustments (valor aduaneiro)
  royaltiesCents: bigint("royaltiesCents", { mode: "number" }).default(0).notNull(), // Royalties / Licenças
  assistsCents: bigint("assistsCents", { mode: "number" }).default(0).notNull(), // Assists / Insumos fornecidos
  commissionsCents: bigint("commissionsCents", { mode: "number" }).default(0).notNull(), // Comissões de compra

  // Final values
  totalCostCents: bigint("totalCostCents", { mode: "number" }).notNull(),
  unitCostCents: bigint("unitCostCents", { mode: "number" }).notNull(),
  
  // Markup and pricing
  markupPercent: int("markupPercent").default(3000).notNull(), // 30% = 3000
  suggestedPriceCents: bigint("suggestedPriceCents", { mode: "number" }).notNull(),
  
  // Quotation file attachment
  quotationFileUrl: varchar("quotationFileUrl", { length: 512 }),
  quotationFileKey: varchar("quotationFileKey", { length: 255 }),
  quotationFileName: varchar("quotationFileName", { length: 255 }),
  
  // AI Analysis
  aiAnalysis: text("aiAnalysis"),
  viabilityScore: int("viabilityScore"), // 0-100
  
  // Status
  status: mysqlEnum("status", ["draft", "completed", "archived"]).default("draft").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImportCalculation = typeof importCalculations.$inferSelect;
export type InsertImportCalculation = typeof importCalculations.$inferInsert;

/**
 * Company Settings - User's company configuration
 */
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  companyName: varchar("companyName", { length: 255 }),
  cnpj: varchar("cnpj", { length: 18 }),
  stateCode: varchar("stateCode", { length: 2 }).default("SC").notNull(),
  
  // Regime Tributário do Importador
  taxRegime: mysqlEnum("taxRegime", ["simples_nacional", "lucro_presumido", "lucro_real"]).default("lucro_presumido").notNull(),
  
  // Alíquotas do Simples Nacional (para quando taxRegime = simples_nacional)
  simplesAliquota: int("simplesAliquota").default(1000).notNull(), // Alíquota efetiva em basis points (10% = 1000)
  simplesFaixa: int("simplesFaixa").default(1).notNull(), // Faixa do Simples (1-6)
  
  defaultMarkupPercent: int("defaultMarkupPercent").default(3000).notNull(),
  defaultCustomsBrokerCents: bigint("defaultCustomsBrokerCents", { mode: "number" }).default(150000).notNull(), // R$ 1.500,00
  defaultStorageCents: bigint("defaultStorageCents", { mode: "number" }).default(50000).notNull(), // R$ 500,00
  
  // OpenAI API Key for dedicated Excambia integration
  openaiApiKey: varchar("openaiApiKey", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = typeof companySettings.$inferInsert;


/**
 * AI Agent Alerts - Proactive alerts generated by the AI agent
 */
export const agentAlerts = mysqlTable("agent_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Alert type and priority
  alertType: mysqlEnum("alertType", [
    "exchange_rate",
    "exchange_rate_favorable",
    "exchange_rate_unfavorable", 
    "market_opportunity",
    "cost_optimization",
    "supplier_recommendation",
    "tax_update",
    "trend_alert",
    "recommendation"
  ]).notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  
  // Content
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  actionRecommended: text("actionRecommended"),
  
  // Related entities
  relatedProductId: int("relatedProductId"),
  relatedSupplierId: int("relatedSupplierId"),
  relatedCalculationId: int("relatedCalculationId"),
  
  // Metadata
  metadata: text("metadata"), // JSON string with additional data
  
  // Status
  isRead: boolean("isRead").default(false).notNull(),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type AgentAlert = typeof agentAlerts.$inferSelect;
export type InsertAgentAlert = typeof agentAlerts.$inferInsert;

/**
 * AI Agent Actions - Log of actions taken by the AI agent
 */
export const agentActions = mysqlTable("agent_actions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Action details
  actionType: mysqlEnum("actionType", [
    "analysis_generated",
    "alert_created",
    "recommendation_made",
    "data_fetched",
    "trend_detected",
    "optimization_suggested",
    "exchange_check",
    "market_analysis",
    "recommendation_generation",
    "chat_response"
  ]).notNull(),
  
  description: text("description").notNull(),
  result: text("result"),
  
  // Performance metrics
  confidenceScore: int("confidenceScore"), // 0-100
  executionTimeMs: int("executionTimeMs"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentAction = typeof agentActions.$inferSelect;
export type InsertAgentAction = typeof agentActions.$inferInsert;

/**
 * Exchange Rate History - For trend analysis
 */
export const exchangeRateHistory = mysqlTable("exchange_rate_history", {
  id: int("id").autoincrement().primaryKey(),
  fromCurrency: varchar("fromCurrency", { length: 3 }).notNull(),
  toCurrency: varchar("toCurrency", { length: 3 }).notNull(),
  rate: bigint("rate", { mode: "number" }).notNull(), // Rate * 1000000 for precision
  source: varchar("source", { length: 50 }).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type ExchangeRateHistory = typeof exchangeRateHistory.$inferSelect;
export type InsertExchangeRateHistory = typeof exchangeRateHistory.$inferInsert;

/**
 * User Agent Preferences - Configuration for AI agent behavior
 */
export const agentPreferences = mysqlTable("agent_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Exchange rate alerts
  enableExchangeAlerts: boolean("enableExchangeAlerts").default(true).notNull(),
  usdTargetRate: bigint("usdTargetRate", { mode: "number" }), // Target USD/BRL rate * 1000000
  eurTargetRate: bigint("eurTargetRate", { mode: "number" }), // Target EUR/BRL rate * 1000000
  
  // Notification preferences
  enableEmailNotifications: boolean("enableEmailNotifications").default(false).notNull(),
  enablePushNotifications: boolean("enablePushNotifications").default(true).notNull(),
  
  // Analysis preferences
  autoAnalyzeNewCalculations: boolean("autoAnalyzeNewCalculations").default(true).notNull(),
  preferredAnalysisDepth: mysqlEnum("preferredAnalysisDepth", ["basic", "standard", "detailed"]).default("standard").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentPreferences = typeof agentPreferences.$inferSelect;
export type InsertAgentPreferences = typeof agentPreferences.$inferInsert;

/**
 * AI Chat Messages - Conversation history with AI assistant
 */
export const aiChatMessages = mysqlTable("ai_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  
  // Context
  relatedCalculationId: int("relatedCalculationId"),
  
  // Metadata
  tokensUsed: int("tokensUsed"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type InsertAiChatMessage = typeof aiChatMessages.$inferInsert;

/**
 * Market Indicators - For predictive analysis and trend tracking
 */
export const marketIndicators = mysqlTable("market_indicators", {
  id: int("id").autoincrement().primaryKey(),
  
  indicatorType: varchar("indicatorType", { length: 50 }).notNull(), // e.g., "exchange", "commodity", "macro", "systemic_analysis"
  indicatorName: varchar("indicatorName", { length: 100 }).notNull(), // e.g., "USD/BRL", "steel_hrc", "selic"
  value: int("value").notNull(), // Value * 100 for precision (e.g., 5.25 = 525)
  
  metadata: text("metadata"), // JSON with additional context
  source: varchar("source", { length: 100 }).notNull(),
  
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type MarketIndicator = typeof marketIndicators.$inferSelect;
export type InsertMarketIndicator = typeof marketIndicators.$inferInsert;

/**
 * Predictive Analysis Results - Stored predictions for accuracy tracking
 */
export const predictiveAnalysisResults = mysqlTable("predictive_analysis_results", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  
  // Analysis type
  analysisType: varchar("analysisType", { length: 50 }).notNull(), // "systemic", "exchange", "commodity", "demand"
  
  // Prediction details
  indicator: varchar("indicator", { length: 100 }).notNull(),
  currentValue: int("currentValue").notNull(), // * 100
  predictedValue: int("predictedValue").notNull(), // * 100
  actualValue: int("actualValue"), // * 100 - filled when prediction period ends
  
  confidence: int("confidence").notNull(), // 0-100
  timeframeDays: int("timeframeDays").notNull(),
  direction: mysqlEnum("direction", ["up", "down", "stable"]).notNull(),
  
  // Outcome tracking
  predictionDate: timestamp("predictionDate").defaultNow().notNull(),
  targetDate: timestamp("targetDate").notNull(),
  wasAccurate: boolean("wasAccurate"), // null until evaluated
  accuracyScore: int("accuracyScore"), // 0-100, how close the prediction was
  
  // Full analysis JSON
  fullAnalysis: text("fullAnalysis"), // Complete SystemicAnalysis JSON
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PredictiveAnalysisResult = typeof predictiveAnalysisResults.$inferSelect;
export type InsertPredictiveAnalysisResult = typeof predictiveAnalysisResults.$inferInsert;


/**
 * Calculation Items - Individual products within a calculation (supports multiple SKUs per quotation)
 */
export const calculationItems = mysqlTable("calculation_items", {
  id: int("id").autoincrement().primaryKey(),
  calculationId: int("calculationId").notNull(),
  
  // Product info
  productName: varchar("productName", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  ncmCode: varchar("ncmCode", { length: 10 }).notNull(),
  ncmConfirmed: boolean("ncmConfirmed").default(false).notNull(), // Whether NCM was confirmed by user
  
  // Quantities
  quantity: int("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  
  // Values in cents (original currency)
  unitPriceCents: bigint("unitPriceCents", { mode: "number" }).notNull(),
  totalPriceCents: bigint("totalPriceCents", { mode: "number" }).notNull(),
  
  // Calculated values in BRL cents
  unitPriceBrlCents: bigint("unitPriceBrlCents", { mode: "number" }),
  totalPriceBrlCents: bigint("totalPriceBrlCents", { mode: "number" }),
  
  // Tax values for this item in BRL cents
  iiValueCents: bigint("iiValueCents", { mode: "number" }),
  ipiValueCents: bigint("ipiValueCents", { mode: "number" }),
  pisValueCents: bigint("pisValueCents", { mode: "number" }),
  cofinsValueCents: bigint("cofinsValueCents", { mode: "number" }),
  icmsValueCents: bigint("icmsValueCents", { mode: "number" }),
  
  // Final costs for this item
  totalCostCents: bigint("totalCostCents", { mode: "number" }),
  unitCostCents: bigint("unitCostCents", { mode: "number" }),
  suggestedPriceCents: bigint("suggestedPriceCents", { mode: "number" }),
  
  // Metadata extracted from PDF
  extractedFromPdf: boolean("extractedFromPdf").default(false).notNull(),
  pdfLineReference: varchar("pdfLineReference", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CalculationItem = typeof calculationItems.$inferSelect;
export type InsertCalculationItem = typeof calculationItems.$inferInsert;


/**
 * Quotations - Groups multiple calculations/products from the same supplier quotation
 * Represents a "Cálculo de Oportunidade" (Opportunity Calculation)
 */
export const quotations = mysqlTable("quotations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  supplierId: int("supplierId"),
  
  // Quotation identification
  quotationNumber: varchar("quotationNumber", { length: 100 }),
  supplierName: varchar("supplierName", { length: 255 }),
  supplierCountry: varchar("supplierCountry", { length: 100 }),
  
  // Quotation file
  quotationFileUrl: varchar("quotationFileUrl", { length: 512 }),
  quotationFileKey: varchar("quotationFileKey", { length: 255 }),
  quotationFileName: varchar("quotationFileName", { length: 255 }),
  
  // Currency and exchange
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  exchangeRate: bigint("exchangeRate", { mode: "number" }), // Rate * 1000000
  
  // Origin and destination
  originCountry: varchar("originCountry", { length: 100 }),
  destinationState: varchar("destinationState", { length: 2 }).default("SC"),
  isMercosul: boolean("isMercosul").default(false).notNull(),
  
  // Shared costs
  freightCents: bigint("freightCents", { mode: "number" }).default(0).notNull(),
  insuranceCents: bigint("insuranceCents", { mode: "number" }).default(0).notNull(),
  customsBrokerCents: bigint("customsBrokerCents", { mode: "number" }).default(0).notNull(),
  storageCents: bigint("storageCents", { mode: "number" }).default(0).notNull(),
  otherCostsCents: bigint("otherCostsCents", { mode: "number" }).default(0).notNull(),

  // TTD SC - ICMS diferido/antecipado (Tratamento Tributário Diferenciado)
  icmsAntecipadoCents: bigint("icmsAntecipadoCents", { mode: "number" }).default(0).notNull(), // ICMS antecipado SCT (1% ou 2,6%)
  icmsDiferidoCents: bigint("icmsDiferidoCents", { mode: "number" }).default(0).notNull(), // ICMS diferido (suspensão até saída do estado)

  // Financial costs
  iofCents: bigint("iofCents", { mode: "number" }).default(0).notNull(), // IOF (Imposto sobre Operações Financeiras)
  spreadCents: bigint("spreadCents", { mode: "number" }).default(0).notNull(), // Spread cambial

  // Customs value adjustments (valor aduaneiro)
  royaltiesCents: bigint("royaltiesCents", { mode: "number" }).default(0).notNull(), // Royalties / Licenças
  assistsCents: bigint("assistsCents", { mode: "number" }).default(0).notNull(), // Assists / Insumos fornecidos
  commissionsCents: bigint("commissionsCents", { mode: "number" }).default(0).notNull(), // Comissões de compra

  // Totals (calculated from items)
  totalFobCents: bigint("totalFobCents", { mode: "number" }).default(0).notNull(),
  totalCifCents: bigint("totalCifCents", { mode: "number" }).default(0).notNull(),
  totalTaxesCents: bigint("totalTaxesCents", { mode: "number" }).default(0).notNull(),
  totalCostCents: bigint("totalCostCents", { mode: "number" }).default(0).notNull(),
  totalSuggestedPriceCents: bigint("totalSuggestedPriceCents", { mode: "number" }).default(0).notNull(),
  
  // Markup
  markupPercent: int("markupPercent").default(3000).notNull(), // 30% = 3000
  
  // Status and workflow (CRM-like)
  status: mysqlEnum("status", [
    "draft",           // Rascunho - cotação em análise
    "analyzing",       // Analisando - levantamento de preços
    "viable",          // Viável - importação aprovada
    "not_viable",      // Inviável - descartada
    "negotiating",     // Negociando - em negociação com fornecedor
    "approved",        // Aprovada - pedido confirmado
    "ordered",         // Pedido Feito - aguardando embarque
    "shipped",         // Embarcado - em trânsito
    "customs",         // Desembaraço - em processo aduaneiro
    "nationalized",    // Nacionalizado - produto liberado
    "completed",       // Concluído - processo finalizado
    "cancelled"        // Cancelado
  ]).default("draft").notNull(),
  
  // Notes and observations
  notes: text("notes"),
  
  // AI Analysis
  aiAnalysis: text("aiAnalysis"),
  viabilityScore: int("viabilityScore"), // 0-100
  
  // Dates for tracking
  quotationDate: timestamp("quotationDate"),
  validUntil: timestamp("validUntil"),
  orderDate: timestamp("orderDate"),
  shipmentDate: timestamp("shipmentDate"),
  estimatedArrival: timestamp("estimatedArrival"),
  customsClearanceDate: timestamp("customsClearanceDate"),
  completionDate: timestamp("completionDate"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = typeof quotations.$inferInsert;


/**
 * Excambia Chat Messages - Persistência de conversas com a IA
 */
export const sofiaChatMessages = mysqlTable("sofia_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // Conversa à qual a mensagem pertence (Fase 3). Nullable para retrocompat:
  // mensagens antigas (pré-Fase 3) ficam sem conversa e são agrupadas no histórico legado.
  conversaId: int("conversaId"),

  // Message content
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),

  // Session tracking (para agrupar conversas)
  sessionId: varchar("sessionId", { length: 64 }),

  // Metadata
  model: varchar("model", { length: 100 }),
  tokensUsed: int("tokensUsed"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SofiaChatMessage = typeof sofiaChatMessages.$inferSelect;
export type InsertSofiaChatMessage = typeof sofiaChatMessages.$inferInsert;

/**
 * Conversas (Fase 3) — cada thread de chat com a Excambia é uma conversa
 * nomeável, retomável e (opcionalmente) vinculada a uma Operação. É o que
 * permite a sidebar de histórico e a sincronização chat ↔ Painel.
 */
export const conversas = mysqlTable(
  "conversas",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),

    titulo: varchar("titulo", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["ativa", "arquivada"]).default("ativa").notNull(),

    // Conversa fixada no topo da sidebar.
    fixada: boolean("fixada").default(false).notNull(),

    // Vínculo opcional com uma operação (sincronização bidirecional chat ↔ Painel).
    operacaoId: int("operacaoId"),

    // Estágio do funil em que a conversa está operando (espelha a operação quando vinculada).
    estagio: mysqlEnum("estagio",
      ["demand", "source", "analyze", "execute", "finance", "closed", "lost"]),

    // Para ordenar a sidebar pela atividade mais recente.
    ultimaMensagemEm: timestamp("ultimaMensagemEm"),

    criadaEm: timestamp("criadaEm").defaultNow().notNull(),
    atualizadaEm: timestamp("atualizadaEm").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    byUser: index("idx_conversas_user").on(t.userId),
    byOperacao: index("idx_conversas_operacao").on(t.operacaoId),
  })
);
export type Conversa = typeof conversas.$inferSelect;
export type InsertConversa = typeof conversas.$inferInsert;

/**
 * Mensagens dentro de uma conversa - histórico persistente com metadados agênticos
 */
export const conversaMensagens = mysqlTable("conversa_mensagens", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),

  role: mysqlEnum("role", ["user", "assistant", "system", "tool"]).notNull(),
  content: text("content").notNull(),

  // Se a mensagem do assistente usou ferramentas (coesão com a camada agêntica)
  toolsUsed: json("toolsUsed"),       // string[] | null
  toolResults: json("toolResults"),   // [{name, ok, data}] | null

  criadaEm: timestamp("criadaEm").defaultNow().notNull(),
}, (t) => ({
  byConversa: index("idx_conversa_msgs").on(t.conversaId),
}));
export type ConversaMensagem = typeof conversaMensagens.$inferSelect;
export type InsertConversaMensagem = typeof conversaMensagens.$inferInsert;

/**
 * Excambia Learning Context - Aprendizado persistente da IA
 */
export const sofiaLearningContext = mysqlTable("excambia_learning_context", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Context type
  contextType: mysqlEnum("contextType", [
    "preference",      // Preferências do usuário
    "business_rule",   // Regras de negócio aprendidas
    "supplier_info",   // Informações sobre fornecedores
    "product_insight", // Insights sobre produtos
    "market_trend",    // Tendências de mercado observadas
    "calculation_pattern", // Padrões de cálculo
    "feedback"         // Feedback do usuário
  ]).notNull(),
  
  // Content
  key: varchar("key", { length: 255 }).notNull(),
  value: text("value").notNull(),
  
  // Importance/relevance score (0-100)
  importance: int("importance").default(50).notNull(),
  
  // Source of learning
  source: varchar("source", { length: 100 }),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
});

export type SofiaLearningContext = typeof sofiaLearningContext.$inferSelect;
export type InsertSofiaLearningContext = typeof sofiaLearningContext.$inferInsert;


/**
 * Tax Rate History - Histórico de alterações de alíquotas
 */
export const taxRateHistory = mysqlTable("tax_rate_history", {
  id: int("id").autoincrement().primaryKey(),
  
  ncmCode: varchar("ncmCode", { length: 10 }).notNull(),
  field: varchar("field", { length: 20 }).notNull(), // II, IPI, PIS, COFINS, ICMS, II_MERCOSUL
  oldValue: int("oldValue").notNull(), // Em basis points
  newValue: int("newValue").notNull(), // Em basis points
  
  source: varchar("source", { length: 100 }).notNull(), // manual, TEC, TIPI, SEFAZ
  effectiveDate: timestamp("effectiveDate").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaxRateHistory = typeof taxRateHistory.$inferSelect;
export type InsertTaxRateHistory = typeof taxRateHistory.$inferInsert;

/**
 * Tax Update Logs - Logs de atualização de tabelas tributárias
 */
export const taxUpdateLogs = mysqlTable("tax_update_logs", {
  id: int("id").autoincrement().primaryKey(),
  
  source: varchar("source", { length: 100 }).notNull(), // NCM_SISCOMEX, TEC, TIPI, SEFAZ_XX
  success: boolean("success").notNull(),
  insertedCount: int("insertedCount").default(0).notNull(),
  updatedCount: int("updatedCount").default(0).notNull(),
  errors: text("errors"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaxUpdateLog = typeof taxUpdateLogs.$inferSelect;
export type InsertTaxUpdateLog = typeof taxUpdateLogs.$inferInsert;

/**
 * Fiscal Benefits - Benefícios fiscais por estado e NCM
 */
export const fiscalBenefits = mysqlTable("fiscal_benefits", {
  id: int("id").autoincrement().primaryKey(),
  
  // Identificação
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }), // Ex: TTD_409, DRAWBACK, RECOF
  
  // Escopo
  stateCode: varchar("stateCode", { length: 2 }), // null = federal
  ncmPattern: varchar("ncmPattern", { length: 20 }), // Ex: 84*, 8471*, null = todos
  
  // Tipo de benefício
  benefitType: mysqlEnum("benefitType", [
    "ii_reduction",      // Redução de II
    "ii_exemption",      // Isenção de II
    "ipi_reduction",     // Redução de IPI
    "ipi_exemption",     // Isenção de IPI
    "icms_reduction",    // Redução de ICMS
    "icms_credit",       // Crédito presumido de ICMS
    "icms_deferral",     // Diferimento de ICMS
    "pis_cofins_suspension", // Suspensão de PIS/COFINS
    "drawback",          // Drawback
    "recof"              // RECOF
  ]).notNull(),
  
  // Valores
  reductionPercent: int("reductionPercent"), // Em basis points (75% = 7500)
  creditPercent: int("creditPercent"), // Em basis points
  
  // Requisitos
  requirements: text("requirements"),
  documentation: text("documentation"),
  
  // Vigência
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  isActive: boolean("isActive").default(true).notNull(),
  
  // Fonte legal
  legalBasis: varchar("legalBasis", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FiscalBenefit = typeof fiscalBenefits.$inferSelect;
export type InsertFiscalBenefit = typeof fiscalBenefits.$inferInsert;

/**
 * Drawback Records - Registros de operações de Drawback
 */
export const drawbackRecords = mysqlTable("drawback_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Tipo de Drawback
  drawbackType: mysqlEnum("drawbackType", [
    "suspension",   // Suspensão - importação com suspensão de tributos
    "exemption",    // Isenção - reposição de estoque
    "restitution"   // Restituição - devolução de tributos pagos
  ]).notNull(),
  
  // Ato Concessório
  actNumber: varchar("actNumber", { length: 50 }),
  actDate: timestamp("actDate"),
  validUntil: timestamp("validUntil"),
  
  // Produto exportado (compromisso)
  exportProductName: varchar("exportProductName", { length: 255 }),
  exportNcm: varchar("exportNcm", { length: 10 }),
  exportQuantity: int("exportQuantity"),
  exportValueCents: bigint("exportValueCents", { mode: "number" }),
  
  // Produto importado (benefício)
  importProductName: varchar("importProductName", { length: 255 }),
  importNcm: varchar("importNcm", { length: 10 }),
  importQuantity: int("importQuantity"),
  importValueCents: bigint("importValueCents", { mode: "number" }),
  
  // Tributos suspensos/isentos
  iiSuspendedCents: bigint("iiSuspendedCents", { mode: "number" }).default(0),
  ipiSuspendedCents: bigint("ipiSuspendedCents", { mode: "number" }).default(0),
  pisSuspendedCents: bigint("pisSuspendedCents", { mode: "number" }).default(0),
  cofinsSuspendedCents: bigint("cofinsSuspendedCents", { mode: "number" }).default(0),
  
  // Status
  status: mysqlEnum("status", [
    "draft",        // Rascunho
    "requested",    // Solicitado
    "approved",     // Aprovado
    "active",       // Ativo - em uso
    "fulfilled",    // Cumprido - exportação realizada
    "expired",      // Expirado
    "cancelled"     // Cancelado
  ]).default("draft").notNull(),
  
  // Referências
  quotationId: int("quotationId"),
  notes: text("notes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DrawbackRecord = typeof drawbackRecords.$inferSelect;
export type InsertDrawbackRecord = typeof drawbackRecords.$inferInsert;

/**
 * State Pricing Rules - Regras de precificação por estado destino
 */
export const statePricingRules = mysqlTable("state_pricing_rules", {
  id: int("id").autoincrement().primaryKey(),
  
  // Estado
  stateCode: varchar("stateCode", { length: 2 }).notNull(),
  stateName: varchar("stateName", { length: 100 }).notNull(),
  
  // ICMS
  icmsInternalRate: int("icmsInternalRate").notNull(), // Alíquota interna em basis points
  icmsInterstateRate: int("icmsInterstateRate").notNull(), // Alíquota interestadual
  
  // DIFAL
  hasDifal: boolean("hasDifal").default(true).notNull(),
  difalCalculationMethod: mysqlEnum("difalCalculationMethod", [
    "simple",       // Diferença simples
    "double_base"   // Base dupla (alguns estados)
  ]).default("simple").notNull(),
  
  // ST (Substituição Tributária)
  hasStDefault: boolean("hasStDefault").default(false).notNull(),
  defaultMva: int("defaultMva"), // MVA padrão em basis points
  
  // Custos adicionais estimados
  additionalLogisticsCostPercent: int("additionalLogisticsCostPercent").default(0), // % adicional de frete
  
  // Observações
  notes: text("notes"),
  
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StatePricingRule = typeof statePricingRules.$inferSelect;
export type InsertStatePricingRule = typeof statePricingRules.$inferInsert;

/**
 * Commodity Prices - Preços de commodities internacionais
 */
export const commodityPrices = mysqlTable("commodity_prices", {
  id: int("id").autoincrement().primaryKey(),
  
  // Identificação
  commodityCode: varchar("commodityCode", { length: 50 }).notNull(), // Ex: STEEL_HRC, ALUMINUM_LME
  commodityName: varchar("commodityName", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }), // metals, energy, agricultural
  
  // Preço
  priceCents: bigint("priceCents", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(), // ton, kg, barrel, bushel
  
  // Variação
  changePercent: int("changePercent"), // Variação % * 100
  changeDirection: mysqlEnum("changeDirection", ["up", "down", "stable"]),
  
  // Fonte
  source: varchar("source", { length: 100 }).notNull(),
  
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type CommodityPrice = typeof commodityPrices.$inferSelect;
export type InsertCommodityPrice = typeof commodityPrices.$inferInsert;

/**
 * Tax Change Notifications - Notificações de mudanças tributárias
 */
export const taxChangeNotifications = mysqlTable("tax_change_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // null = notificação global
  
  // Tipo de mudança
  changeType: mysqlEnum("changeType", [
    "ncm_rate",       // Mudança de alíquota por NCM
    "state_rate",     // Mudança de alíquota estadual
    "benefit_new",    // Novo benefício fiscal
    "benefit_expired", // Benefício expirado
    "agreement",      // Acordo comercial
    "regulatory"      // Mudança regulatória
  ]).notNull(),
  
  // Detalhes
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  
  // Referências
  ncmCode: varchar("ncmCode", { length: 10 }),
  stateCode: varchar("stateCode", { length: 2 }),
  
  // Impacto
  impactLevel: mysqlEnum("impactLevel", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  
  // Status
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  
  // Vigência
  effectiveDate: timestamp("effectiveDate"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaxChangeNotification = typeof taxChangeNotifications.$inferSelect;
export type InsertTaxChangeNotification = typeof taxChangeNotifications.$inferInsert;


/**
 * Supplier Prices - Histórico de preços por fornecedor/produto
 * Armazena preços de cada cotação para comparação e análise competitiva
 */
export const supplierPrices = mysqlTable("supplier_prices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Referências
  supplierId: int("supplierId").notNull(),
  quotationId: int("quotationId"),
  calculationId: int("calculationId"),
  
  // Identificação do produto
  productName: varchar("productName", { length: 255 }).notNull(),
  productNameNormalized: varchar("productNameNormalized", { length: 255 }).notNull(), // Nome normalizado para comparação
  ncmCode: varchar("ncmCode", { length: 10 }),
  sku: varchar("sku", { length: 100 }),
  
  // Preço original
  unitPriceCents: bigint("unitPriceCents", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  
  // Preço convertido para BRL (para comparação)
  unitPriceBrlCents: bigint("unitPriceBrlCents", { mode: "number" }).notNull(),
  exchangeRate: bigint("exchangeRate", { mode: "number" }).notNull(), // Rate * 1000000
  
  // Quantidade e condições
  quantity: int("quantity").default(1).notNull(),
  minOrderQuantity: int("minOrderQuantity"),
  leadTimeDays: int("leadTimeDays"),
  
  // Incoterm e condições
  incoterm: varchar("incoterm", { length: 10 }),
  paymentTerms: varchar("paymentTerms", { length: 100 }),
  
  // Validade
  quotationDate: timestamp("quotationDate").defaultNow().notNull(),
  validUntil: timestamp("validUntil"),
  
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierPrice = typeof supplierPrices.$inferSelect;
export type InsertSupplierPrice = typeof supplierPrices.$inferInsert;

/**
 * Product Price Comparison - View de comparação de preços por produto
 * Esta é uma tabela auxiliar para armazenar o melhor preço atual por produto
 */
export const productBestPrices = mysqlTable("product_best_prices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Identificação do produto
  productNameNormalized: varchar("productNameNormalized", { length: 255 }).notNull(),
  ncmCode: varchar("ncmCode", { length: 10 }),
  
  // Melhor preço atual
  bestPriceBrlCents: bigint("bestPriceBrlCents", { mode: "number" }).notNull(),
  bestPriceSupplierId: int("bestPriceSupplierId").notNull(),
  bestPriceSupplierName: varchar("bestPriceSupplierName", { length: 255 }).notNull(),
  bestPriceQuotationId: int("bestPriceQuotationId"),
  bestPriceDate: timestamp("bestPriceDate").notNull(),
  
  // Estatísticas
  totalSuppliers: int("totalSuppliers").default(1).notNull(),
  avgPriceBrlCents: bigint("avgPriceBrlCents", { mode: "number" }),
  minPriceBrlCents: bigint("minPriceBrlCents", { mode: "number" }),
  maxPriceBrlCents: bigint("maxPriceBrlCents", { mode: "number" }),
  
  // Economia potencial
  savingsPercent: int("savingsPercent"), // Economia % em relação ao preço mais alto
  
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductBestPrice = typeof productBestPrices.$inferSelect;
export type InsertProductBestPrice = typeof productBestPrices.$inferInsert;


// ============================================================
// INDÚSTRIAS - Cadastro completo de fornecedores/fábricas
// ============================================================

/**
 * Industries - Cadastro principal de indústrias/fábricas
 * Cada indústria é uma empresa fornecedora com dados completos
 */
export const industries = mysqlTable("industries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Identificação
  name: varchar("name", { length: 255 }).notNull(),
  tradeName: varchar("tradeName", { length: 255 }), // Nome fantasia/comercial
  registrationNumber: varchar("registrationNumber", { length: 100 }), // CNPJ/Tax ID estrangeiro
  website: varchar("website", { length: 500 }),
  
  // Categorização
  sector: mysqlEnum("sector", [
    "metals",           // Metais (ferro, aço, alumínio)
    "construction",     // Construção civil
    "machinery",        // Máquinas e equipamentos
    "electronics",      // Eletrônicos
    "chemicals",        // Químicos
    "textiles",         // Têxteis
    "food",             // Alimentos
    "automotive",       // Automotivo
    "plastics",         // Plásticos
    "wood",             // Madeira
    "packaging",        // Embalagens
    "energy",           // Energia
    "other"             // Outros
  ]).default("other").notNull(),
  subsector: varchar("subsector", { length: 100 }), // Ex: "pregos e parafusos", "escoras metálicas"
  
  // Localização
  country: varchar("country", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  address: text("address"), // Endereço completo
  postalCode: varchar("postalCode", { length: 20 }),
  
  // Região comercial
  region: mysqlEnum("region", [
    "asia_china",       // China
    "asia_india",       // Índia
    "asia_southeast",   // Sudeste Asiático
    "asia_other",       // Outros Ásia
    "europe_west",      // Europa Ocidental
    "europe_east",      // Europa Oriental
    "north_america",    // América do Norte
    "south_america",    // América do Sul (Mercosul)
    "middle_east",      // Oriente Médio
    "africa",           // África
    "oceania"           // Oceania
  ]).default("asia_china").notNull(),
  
  // Contato principal
  contactName: varchar("contactName", { length: 255 }),
  contactRole: varchar("contactRole", { length: 100 }), // Cargo: Sales Manager, Director, etc.
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  contactWhatsapp: varchar("contactWhatsapp", { length: 50 }),
  contactWechat: varchar("contactWechat", { length: 100 }),
  
  // Dados comerciais
  isMercosul: boolean("isMercosul").default(false).notNull(),
  preferredIncoterm: mysqlEnum("preferredIncoterm", [
    "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"
  ]).default("FOB"),
  preferredCurrency: varchar("preferredCurrency", { length: 3 }).default("USD"),
  paymentTerms: varchar("paymentTerms", { length: 255 }), // Ex: "30% advance, 70% before shipment"
  minOrderValue: bigint("minOrderValue", { mode: "number" }), // Valor mínimo de pedido em centavos (moeda preferida)
  leadTimeDays: int("leadTimeDays"), // Prazo médio de produção em dias
  
  // Capacidade
  productionCapacity: varchar("productionCapacity", { length: 255 }), // Ex: "5000 tons/month"
  certifications: text("certifications"), // ISO 9001, CE, etc. (JSON array como texto)
  yearEstablished: int("yearEstablished"),
  employeeCount: int("employeeCount"),
  
  // Rating composto (calculado automaticamente)
  overallRating: decimal("overallRating", { precision: 3, scale: 2 }).default("0"), // 0.00 a 5.00
  priceRating: decimal("priceRating", { precision: 3, scale: 2 }).default("0"),
  qualityRating: decimal("qualityRating", { precision: 3, scale: 2 }).default("0"),
  deliveryRating: decimal("deliveryRating", { precision: 3, scale: 2 }).default("0"),
  communicationRating: decimal("communicationRating", { precision: 3, scale: 2 }).default("0"),
  totalOrders: int("totalOrders").default(0),
  
  // Comunicação preferida
  preferredLanguage: mysqlEnum("preferredLanguage", [
    "pt", "en", "es", "zh", "ar", "fr", "de", "it", "ja", "ko"
  ]).default("en"),
  preferredChannel: mysqlEnum("preferredChannel", [
    "email", "whatsapp", "wechat", "phone", "alibaba", "other"
  ]).default("email"),
  
  // Status
  status: mysqlEnum("status", [
    "active",       // Ativo - fornecedor em uso
    "prospect",     // Prospecto - ainda não comprou
    "inactive",     // Inativo - não fornece mais
    "blacklisted"   // Bloqueado - problemas graves
  ]).default("prospect").notNull(),
  
  // Observações
  notes: text("notes"),
  tags: text("tags"), // Tags separadas por vírgula para busca
  
  // Vínculo com tabela antiga de suppliers (migração)
  legacySupplierId: int("legacySupplierId"),

  // ===== FASE 5: Compradores nacionais / Setores (benchmark) =====
  segmento: varchar("segmento", { length: 120 }),
  regiao: varchar("regiao", { length: 120 }),
  perfilDemanda: mysqlEnum("perfilDemanda", ["recorrente", "eventual", "projeto", "spot"]),
  sensibilidadePreco: mysqlEnum("sensibilidadePreco", ["alta", "media", "baixa"]),
  volumeEstimadoMensal: int("volumeEstimadoMensal"),
  potencialComercial: mysqlEnum("potencialComercial", ["alto", "medio", "baixo"]),

  // ===== FASE 0.5: Discriminador da base unificada =====
  // A mesma tabela atende fornecedores/fabricantes e compradores/setores.
  tipoEntidade: mysqlEnum("tipoEntidade", [
    "fornecedor",   // Fabricante ou fornecedor (internacional ou nacional)
    "comprador",    // Comprador nacional / setor (benchmark de demanda)
  ]).default("fornecedor").notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Industry = typeof industries.$inferSelect;
export type InsertIndustry = typeof industries.$inferInsert;

/**
 * Industry Contacts - Múltiplos contatos por indústria
 */
export const industryContacts = mysqlTable("industry_contacts", {
  id: int("id").autoincrement().primaryKey(),
  industryId: int("industryId").notNull(),
  
  // Dados do contato
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }), // Sales, Logistics, Quality, Finance, Director
  department: varchar("department", { length: 100 }),
  
  // Canais de comunicação
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  wechat: varchar("wechat", { length: 100 }),
  skype: varchar("skype", { length: 100 }),
  
  // Preferências
  preferredChannel: mysqlEnum("preferredChannel", [
    "email", "whatsapp", "wechat", "phone", "skype", "other"
  ]).default("email"),
  language: mysqlEnum("language", [
    "pt", "en", "es", "zh", "ar", "fr", "de", "it", "ja", "ko"
  ]).default("en"),
  
  // Status
  isPrimary: boolean("isPrimary").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  
  notes: text("notes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IndustryContact = typeof industryContacts.$inferSelect;
export type InsertIndustryContact = typeof industryContacts.$inferInsert;

/**
 * Industry Products - Catálogo de produtos por indústria com preços
 */
export const industryProducts = mysqlTable("industry_products", {
  id: int("id").autoincrement().primaryKey(),
  industryId: int("industryId").notNull(),
  userId: int("userId").notNull(),
  
  // Identificação do produto
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sku: varchar("sku", { length: 100 }), // SKU do fornecedor
  ncmCode: varchar("ncmCode", { length: 10 }),
  hsCode: varchar("hsCode", { length: 10 }), // HS Code internacional
  
  // Categoria
  category: varchar("category", { length: 100 }), // Ex: "pregos", "escoras", "acabamentos"
  subcategory: varchar("subcategory", { length: 100 }),
  
  // Especificações
  specifications: text("specifications"), // Detalhes técnicos (dimensões, material, etc.)
  unit: varchar("unit", { length: 20 }).default("UN").notNull(), // UN, KG, TON, M, M2, M3, PCT, CX
  weightPerUnit: decimal("weightPerUnit", { precision: 10, scale: 4 }), // Peso por unidade em KG
  
  // Preços
  priceExw: bigint("priceExw", { mode: "number" }), // Preço EXW em centavos (moeda do fornecedor)
  priceFob: bigint("priceFob", { mode: "number" }), // Preço FOB em centavos
  priceCif: bigint("priceCif", { mode: "number" }), // Preço CIF em centavos (se disponível)
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  
  // Condições
  moq: int("moq"), // Minimum Order Quantity
  leadTimeDays: int("leadTimeDays"), // Prazo de produção
  packagingInfo: varchar("packagingInfo", { length: 255 }), // Ex: "Pallets 1000 un"
  
  // Validade do preço
  priceValidFrom: timestamp("priceValidFrom"),
  priceValidUntil: timestamp("priceValidUntil"),
  lastQuotedAt: timestamp("lastQuotedAt"), // Última vez que foi cotado
  
  // Qualidade e certificações
  qualityGrade: varchar("qualityGrade", { length: 50 }), // A, B, C ou custom
  certifications: varchar("certifications", { length: 500 }), // Certificações do produto
  
  // Ranking (calculado automaticamente)
  priceRank: int("priceRank"), // Posição no ranking de preço (1 = mais barato)
  totalCompetitors: int("totalCompetitors"), // Quantos fornecedores oferecem este produto
  priceVsAverage: int("priceVsAverage"), // % acima/abaixo da média (positivo = mais caro)
  
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  
  // Imagem/foto do produto
  imageUrl: varchar("imageUrl", { length: 512 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IndustryProduct = typeof industryProducts.$inferSelect;
export type InsertIndustryProduct = typeof industryProducts.$inferInsert;

/**
 * Supplier Ratings - Avaliações individuais vinculadas a pedidos/produtos
 */
export const supplierRatings = mysqlTable("supplier_ratings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  industryId: int("industryId").notNull(),
  
  // Referência (opcional - pode ser rating geral ou vinculado a um pedido)
  quotationId: int("quotationId"),
  productId: int("productId"), // industryProducts.id
  
  // Avaliações (1 a 5)
  priceScore: int("priceScore").notNull(), // Competitividade do preço
  qualityScore: int("qualityScore").notNull(), // Qualidade do produto
  deliveryScore: int("deliveryScore").notNull(), // Cumprimento do prazo
  communicationScore: int("communicationScore").notNull(), // Comunicação/resposta
  
  // Comentário
  comment: text("comment"),
  
  // Dados do pedido avaliado
  orderDate: timestamp("orderDate"),
  orderValue: bigint("orderValue", { mode: "number" }), // Valor em centavos
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupplierRating = typeof supplierRatings.$inferSelect;
export type InsertSupplierRating = typeof supplierRatings.$inferInsert;

/**
 * Outbound Messages - Mensagens enviadas para fornecedores (cotações, follow-ups)
 */
export const outboundMessages = mysqlTable("outbound_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  industryId: int("industryId").notNull(),
  contactId: int("contactId"), // industryContacts.id
  rfqId: int("rfqId"), // Vinculado a uma RFQ
  
  // Canal e destinatário
  channel: mysqlEnum("channel", [
    "email", "whatsapp", "wechat", "phone", "other"
  ]).notNull(),
  recipientAddress: varchar("recipientAddress", { length: 320 }).notNull(), // Email, telefone, etc.
  
  // Conteúdo
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  language: mysqlEnum("language", [
    "pt", "en", "es", "zh", "ar", "fr"
  ]).default("en").notNull(),
  
  // Link de resposta (para via dupla)
  responseToken: varchar("responseToken", { length: 64 }), // Token único para resposta
  responseUrl: varchar("responseUrl", { length: 500 }), // URL pública para o fornecedor responder
  
  // Status
  status: mysqlEnum("status", [
    "draft",        // Rascunho
    "queued",       // Na fila de envio
    "sent",         // Enviado
    "delivered",    // Entregue (confirmação)
    "read",         // Lido
    "responded",    // Respondido
    "bounced",      // Falhou
    "expired"       // Expirado sem resposta
  ]).default("draft").notNull(),
  
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  respondedAt: timestamp("respondedAt"),
  expiresAt: timestamp("expiresAt"), // Prazo para resposta
  
  // Metadados
  messageId: varchar("messageId", { length: 255 }), // ID externo (email message-id, etc.)
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OutboundMessage = typeof outboundMessages.$inferSelect;
export type InsertOutboundMessage = typeof outboundMessages.$inferInsert;

/**
 * Inbound Messages - Respostas recebidas dos fornecedores
 */
export const inboundMessages = mysqlTable("inbound_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  industryId: int("industryId"),
  contactId: int("contactId"),
  rfqId: int("rfqId"),
  outboundMessageId: int("outboundMessageId"), // Mensagem original que gerou esta resposta
  
  // Canal e remetente
  channel: mysqlEnum("channel", [
    "email", "whatsapp", "wechat", "portal", "other"
  ]).notNull(),
  senderAddress: varchar("senderAddress", { length: 320 }),
  senderName: varchar("senderName", { length: 255 }),
  
  // Conteúdo
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  
  // Anexos
  attachments: json("attachments"), // Array de { name, url, mimeType, size }
  
  // Dados extraídos (preenchido por IA)
  extractedPrices: json("extractedPrices"), // Preços extraídos automaticamente
  extractedLeadTime: int("extractedLeadTime"), // Prazo extraído em dias
  extractedMoq: int("extractedMoq"), // MOQ extraído
  extractedIncoterm: varchar("extractedIncoterm", { length: 10 }),
  
  // Status
  status: mysqlEnum("status", [
    "unread",       // Não lida
    "read",         // Lida
    "processed",    // Processada (dados extraídos)
    "converted",    // Convertida em cotação no sistema
    "archived"      // Arquivada
  ]).default("unread").notNull(),
  
  // Token de resposta (via portal público)
  responseToken: varchar("responseToken", { length: 64 }),
  
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InboundMessage = typeof inboundMessages.$inferSelect;
export type InsertInboundMessage = typeof inboundMessages.$inferInsert;

// ============================================================
// MOTOR V2 SCHEMAS — Operações, Demandas e Timeline
// ============================================================

/**
 * SCHEMA — Entidade OPERAÇÃO (espinha dorsal) + DEMANDA + linha do tempo.
 *
 * Estágios: demand → source → analyze → execute → finance → closed | lost
 * GO/NO-GO é a decisão de primeira classe entre analyze e execute.
 */

/** Demanda: o que o cliente precisa. Pode gerar uma ou várias operações. */
export const demandas = mysqlTable(
  "demandas",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    clienteNome: varchar("clienteNome", { length: 255 }),
    productId: int("productId"),
    descricao: text("descricao").notNull(),
    ncmProvavel: varchar("ncmProvavel", { length: 10 }),
    quantidade: int("quantidade"),
    unidade: varchar("unidade", { length: 20 }).default("UN"),
    paisDestino: varchar("paisDestino", { length: 60 }).default("Brasil"),
    estadoDestino: varchar("estadoDestino", { length: 2 }).default("SC"),
    precoAlvoBrlCents: int("precoAlvoBrlCents"),
    prazoDesejado: timestamp("prazoDesejado"),
    status: mysqlEnum("status", ["aberta", "em_operacao", "atendida", "descartada"])
      .default("aberta").notNull(),
    criadaEm: timestamp("criadaEm").defaultNow().notNull(),
    atualizadaEm: timestamp("atualizadaEm").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({ byUser: index("idx_demandas_user").on(t.userId) })
);
export type Demanda = typeof demandas.$inferSelect;
export type InsertDemanda = typeof demandas.$inferInsert;

/** Operação: fio condutor que percorre os 5 estágios. */
export const operacoes = mysqlTable(
  "operacoes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    codigo: varchar("codigo", { length: 20 }).notNull(),
    titulo: varchar("titulo", { length: 255 }).notNull(),

    demandaId: int("demandaId"),
    clienteNome: varchar("clienteNome", { length: 255 }),
    fornecedorId: int("fornecedorId"),
    fornecedorNome: varchar("fornecedorNome", { length: 255 }),
    cotacaoVencedoraId: int("cotacaoVencedoraId"),
    calculoId: int("calculoId"),

    estagioAtual: mysqlEnum("estagioAtual",
      ["demand", "source", "analyze", "execute", "finance", "closed", "lost"])
      .default("demand").notNull(),
    status: mysqlEnum("status",
      ["ativa", "pausada", "go", "no_go", "concluida", "perdida"])
      .default("ativa").notNull(),

    // Ramificação da jornada:
    //  - cotacao: usuário já trouxe uma proposta formal (proforma) → nasce em Viabilidade
    //  - desenvolvimento: item pesquisado do zero → nasce em Estudo do item
    // Nulo em operações antigas (antes do campo existir).
    modo: mysqlEnum("modo", ["cotacao", "desenvolvimento"]),

    // Tracking de embarque (preenchimento manual; integração com API fica pendente).
    trackingContainer: varchar("trackingContainer", { length: 60 }),
    trackingBl: varchar("trackingBl", { length: 60 }),
    trackingArmador: varchar("trackingArmador", { length: 120 }),
    trackingNavio: varchar("trackingNavio", { length: 120 }),
    trackingEta: timestamp("trackingEta"),
    trackingStatus: varchar("trackingStatus", { length: 120 }),

    regimeTributario: mysqlEnum("regimeTributario",
      ["lucro_real", "lucro_presumido", "simples_nacional"]),
    origemPais: varchar("origemPais", { length: 60 }),
    origemDesejada: varchar("origemDesejada", { length: 60 }),
    valorEstimadoBrlCents: int("valorEstimadoBrlCents"),
    margemEstimadaBp: int("margemEstimadaBp"),

    prioridade: mysqlEnum("prioridade", ["baixa", "media", "alta", "critica"])
      .default("media"),
    prazoDesejado: timestamp("prazoDesejado"),
    responsavelId: int("responsavelId"),

    decisaoGoNoGo: json("decisaoGoNoGo"),

    criadaEm: timestamp("criadaEm").defaultNow().notNull(),
    atualizadaEm: timestamp("atualizadaEm").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    byUser: index("idx_operacoes_user").on(t.userId),
    byStage: index("idx_operacoes_stage").on(t.estagioAtual),
    byCodigo: index("idx_operacoes_codigo").on(t.codigo),
  })
);
export type Operacao = typeof operacoes.$inferSelect;
export type InsertOperacao = typeof operacoes.$inferInsert;

/** Linha do tempo imutável: cada ação relevante vira um evento. */
export const operacaoEventos = mysqlTable(
  "operacao_eventos",
  {
    id: int("id").autoincrement().primaryKey(),
    operacaoId: int("operacaoId").notNull(),
    tipo: mysqlEnum("tipo", [
      "demanda_criada", "operacao_criada", "rfq_enviada", "cotacao_recebida",
      "cotacao_extraida", "calculo_executado", "go_decidido", "no_go_decidido",
      "di_registrada", "cambio_fechado", "mensagem", "nota_interna", "alerta_ia",
      "estagio_avancado", "anexo_adicionado", "anexo_removido",
      "financeiro_lancado", "financeiro_removido",
      "pedido_confirmado", "producao_iniciada", "produto_embarcado",
      "nacionalizado", "entregue",
      // Marcos da jornada (estudo / sourcing) sem evento equivalente prévio
      "item_pesquisado", "fornecedores_identificados", "fornecedor_selecionado",
    ]).notNull(),
    estagio: mysqlEnum("estagio",
      ["demand", "source", "analyze", "execute", "finance", "closed", "lost"]).notNull(),
    refTipo: varchar("refTipo", { length: 40 }),
    refId: int("refId"),
    autor: mysqlEnum("autor", ["usuario", "excambia", "sistema"]).default("usuario").notNull(),
    titulo: varchar("titulo", { length: 255 }),
    payload: json("payload"),
    criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  },
  (t) => ({ byOperacao: index("idx_eventos_operacao").on(t.operacaoId) })
);
export type OperacaoEvento = typeof operacaoEventos.$inferSelect;
export type InsertOperacaoEvento = typeof operacaoEventos.$inferInsert;

/** Passagem por estágio + gate (critério de avanço). */
export const operacaoEstagios = mysqlTable(
  "operacao_estagios",
  {
    id: int("id").autoincrement().primaryKey(),
    operacaoId: int("operacaoId").notNull(),
    estagio: mysqlEnum("estagio",
      ["demand", "source", "analyze", "execute", "finance"]).notNull(),
    entrouEm: timestamp("entrouEm").defaultNow().notNull(),
    saiuEm: timestamp("saiuEm"),
    gateCumprido: int("gateCumprido").default(0).notNull(),
    gateChecklist: json("gateChecklist"),
  },
  (t) => ({ byOperacao: index("idx_estagios_operacao").on(t.operacaoId) })
);
export type OperacaoEstagio = typeof operacaoEstagios.$inferSelect;

/** Anexos da operação: desenhos, PDFs, imagens, especificações, catálogos, cotações. */
export const operacaoAnexos = mysqlTable(
  "operacao_anexos",
  {
    id: int("id").autoincrement().primaryKey(),
    operacaoId: int("operacaoId").notNull(),
    userId: int("userId").notNull(),
    tipo: mysqlEnum("tipo", [
      "desenho", "pdf", "imagem", "especificacao", "catalogo", "cotacao", "outro",
    ]).default("outro").notNull(),
    nome: varchar("nome", { length: 255 }).notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
    contentType: varchar("contentType", { length: 120 }),
    tamanhoBytes: bigint("tamanhoBytes", { mode: "number" }),
    descricao: text("descricao"),
    autor: mysqlEnum("autor", ["usuario", "excambia", "sistema"]).default("usuario").notNull(),
    estagio: mysqlEnum("estagio",
      ["demand", "source", "analyze", "execute", "finance", "closed", "lost"]),
    criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  },
  (t) => ({ byOperacao: index("idx_anexos_operacao").on(t.operacaoId) })
);
export type OperacaoAnexo = typeof operacaoAnexos.$inferSelect;
export type InsertOperacaoAnexo = typeof operacaoAnexos.$inferInsert;

/**
 * Camada financeira transversal da operação: lançamentos previstos/realizados
 * (câmbio, pagamento ao fornecedor, impostos, frete, despesas locais, receita).
 * Cada lançamento gera um evento na timeline (coesão Painel ↔ Excambia).
 */
export const operacaoFinanceiro = mysqlTable(
  "operacao_financeiro",
  {
    id: int("id").autoincrement().primaryKey(),
    operacaoId: int("operacaoId").notNull(),
    userId: int("userId").notNull(),

    tipo: mysqlEnum("tipo", [
      "cambio", "pagamento_fornecedor", "imposto", "frete", "seguro",
      "despesa_local", "comissao", "receita", "outro",
    ]).default("outro").notNull(),
    direcao: mysqlEnum("direcao", ["entrada", "saida"]).default("saida").notNull(),
    status: mysqlEnum("status", ["previsto", "realizado", "cancelado"])
      .default("previsto").notNull(),

    descricao: varchar("descricao", { length: 255 }),

    // Valor na moeda original + conversão para BRL (para somatório)
    valorCents: bigint("valorCents", { mode: "number" }).notNull(),
    moeda: varchar("moeda", { length: 3 }).default("BRL").notNull(),
    valorBrlCents: bigint("valorBrlCents", { mode: "number" }),
    cambioRate: bigint("cambioRate", { mode: "number" }), // rate * 1000000

    // Vínculo opcional a outra entidade (quotation, calculation, di, etc.)
    refTipo: varchar("refTipo", { length: 40 }),
    refId: int("refId"),

    dataReferencia: timestamp("dataReferencia"),
    vencimento: timestamp("vencimento"),

    autor: mysqlEnum("autor", ["usuario", "excambia", "sistema"]).default("usuario").notNull(),
    estagio: mysqlEnum("estagio",
      ["demand", "source", "analyze", "execute", "finance", "closed", "lost"]),
    criadoEm: timestamp("criadoEm").defaultNow().notNull(),
    atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({ byOperacao: index("idx_financeiro_operacao").on(t.operacaoId) })
);
export type OperacaoFinanceiro = typeof operacaoFinanceiro.$inferSelect;
export type InsertOperacaoFinanceiro = typeof operacaoFinanceiro.$inferInsert;

/**
 * Marcos da operação: pontos-chave no fluxo de produção/embarque/nacionalização.
 * Cada marco gera um evento na timeline (coesão Painel ↔ Excambia).
 * Marcos são imutáveis (uma vez registrado, não se remove — apenas marcar como cancelado).
 */
export const operacaoMarcos = mysqlTable(
  "operacao_marcos",
  {
    id: int("id").autoincrement().primaryKey(),
    operacaoId: int("operacaoId").notNull(),
    userId: int("userId").notNull(),

    tipo: mysqlEnum("tipo", [
      // Estudo do item
      "item_pesquisado", "fornecedores_identificados",
      // Cotação e RFQ
      "rfq_enviada", "cotacao_recebida", "fornecedor_selecionado",
      // Viabilidade
      "calculo_feito", "go_aprovado",
      // Produção e Embarque
      "pedido_confirmado", "producao_iniciada", "produto_embarcado",
      // Nacionalização e Entrega
      "di_registrada", "nacionalizado", "entregue",
    ]).notNull(),

    status: mysqlEnum("status", ["planejado", "realizado", "cancelado"])
      .default("realizado").notNull(),

    descricao: text("descricao"),
    dataReferencia: timestamp("dataReferencia").notNull(),

    refTipo: varchar("refTipo", { length: 40 }),
    refId: int("refId"),

    autor: mysqlEnum("autor", ["usuario", "excambia", "sistema"]).default("usuario").notNull(),
    criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  },
  (t) => ({ byOperacao: index("idx_marcos_operacao").on(t.operacaoId) })
);
export type OperacaoMarco = typeof operacaoMarcos.$inferSelect;
export type InsertOperacaoMarco = typeof operacaoMarcos.$inferInsert;

// ============================================================
// MOTOR V2 SCHEMAS — Market Intelligence (Comex Stat)
// ============================================================

/**
 * Referência de mercado por NCM + país de origem + período.
 * Tabela MATERIALIZADA pelo ETL a partir da Comex Stat (dados oficiais).
 */
export const marketReferenceNcm = mysqlTable(
  "market_reference_ncm",
  {
    id: int("id").autoincrement().primaryKey(),
    ncmCode: varchar("ncmCode", { length: 8 }).notNull(),
    flow: varchar("flow", { length: 6 }).notNull(),
    countryCode: varchar("countryCode", { length: 8 }),
    countryName: varchar("countryName", { length: 120 }),
    economicBlock: varchar("economicBlock", { length: 80 }),
    periodFrom: varchar("periodFrom", { length: 7 }).notNull(),
    periodTo: varchar("periodTo", { length: 7 }).notNull(),

    totalFobUsd: bigint("totalFobUsd", { mode: "number" }).default(0).notNull(),
    totalCifUsd: bigint("totalCifUsd", { mode: "number" }).default(0).notNull(),
    totalFreightUsd: bigint("totalFreightUsd", { mode: "number" }).default(0).notNull(),
    totalNetKg: bigint("totalNetKg", { mode: "number" }).default(0).notNull(),
    totalStatQty: bigint("totalStatQty", { mode: "number" }).default(0).notNull(),

    avgFobPerKgUsd: decimal("avgFobPerKgUsd", { precision: 14, scale: 4 }),
    avgCifPerKgUsd: decimal("avgCifPerKgUsd", { precision: 14, scale: 4 }),
    freightSharePct: decimal("freightSharePct", { precision: 6, scale: 2 }),
    originSharePct: decimal("originSharePct", { precision: 6, scale: 2 }),

    recordCount: int("recordCount").default(0).notNull(),
    isOutlierFiltered: int("isOutlierFiltered").default(0).notNull(),
    source: varchar("source", { length: 40 }).default("comexstat").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqKey: index("uq_market_ref").on(t.ncmCode, t.flow, t.countryCode, t.periodFrom, t.periodTo),
    ncmIdx: index("idx_market_ref_ncm").on(t.ncmCode),
  })
);
export type MarketReferenceNcm = typeof marketReferenceNcm.$inferSelect;
export type InsertMarketReferenceNcm = typeof marketReferenceNcm.$inferInsert;

/**
 * Snapshot mensal por NCM — série temporal para tendência e sazonalidade.
 */
export const marketTrendNcm = mysqlTable(
  "market_trend_ncm",
  {
    id: int("id").autoincrement().primaryKey(),
    ncmCode: varchar("ncmCode", { length: 8 }).notNull(),
    flow: varchar("flow", { length: 6 }).notNull(),
    yearMonth: varchar("yearMonth", { length: 7 }).notNull(),
    totalFobUsd: bigint("totalFobUsd", { mode: "number" }).default(0).notNull(),
    totalNetKg: bigint("totalNetKg", { mode: "number" }).default(0).notNull(),
    avgFobPerKgUsd: decimal("avgFobPerKgUsd", { precision: 14, scale: 4 }),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqKey: index("uq_market_trend").on(t.ncmCode, t.flow, t.yearMonth),
    ncmIdx: index("idx_market_trend_ncm").on(t.ncmCode),
  })
);
export type MarketTrendNcm = typeof marketTrendNcm.$inferSelect;
export type InsertMarketTrendNcm = typeof marketTrendNcm.$inferInsert;

/** Controle de execuções do ETL (idempotência e auditoria). */
export const etlRuns = mysqlTable("etl_runs", {
  id: int("id").autoincrement().primaryKey(),
  job: varchar("job", { length: 60 }).notNull(),
  periodFrom: varchar("periodFrom", { length: 7 }),
  periodTo: varchar("periodTo", { length: 7 }),
  status: varchar("status", { length: 20 }).notNull(),
  rowsProcessed: int("rowsProcessed").default(0).notNull(),
  message: varchar("message", { length: 500 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});
export type EtlRun = typeof etlRuns.$inferSelect;

/* ============================================================
 * FASE 5 — Tabelas novas (vínculos, histórico e ingestão)
 * Tudo aditivo. FKs lógicas (sem constraint física) para flexibilidade.
 * ============================================================ */

/** Histórico de preços do ativo (nacional e internacional) */
export const ativoPrecos = mysqlTable("ativo_precos", {
  id: int("id").autoincrement().primaryKey(),
  ativoId: int("ativoId").notNull(),          // → products.id
  origem: mysqlEnum("origem", ["nacional", "internacional"]).notNull(),
  fornecedorId: int("fornecedorId"),           // → suppliers.id
  precoCents: bigint("precoCents", { mode: "number" }).notNull(),
  moeda: varchar("moeda", { length: 3 }).default("BRL").notNull(),
  incoterm: varchar("incoterm", { length: 10 }),
  moq: int("moq"),
  fonte: mysqlEnum("fonte", ["proforma", "invoice", "cotacao", "manual", "mercado"]).notNull(),
  documentoId: int("documentoId"),             // → fase5_documentos.id
  registradoEm: timestamp("registradoEm").defaultNow().notNull(),
}, (t) => ({
  byAtivo: index("idx_ativo_precos_ativo").on(t.ativoId),
}));
export type AtivoPreco = typeof ativoPrecos.$inferSelect;
export type InsertAtivoPreco = typeof ativoPrecos.$inferInsert;

/** Vínculo ativo ↔ fornecedor (muitos-para-muitos, com origem) */
export const ativoFornecedor = mysqlTable("ativo_fornecedor", {
  id: int("id").autoincrement().primaryKey(),
  ativoId: int("ativoId").notNull(),
  fornecedorId: int("fornecedorId").notNull(),
  origem: mysqlEnum("origem", ["nacional", "internacional"]).notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  byAtivo: index("idx_ativo_fornecedor_ativo").on(t.ativoId),
  byFornecedor: index("idx_ativo_fornecedor_forn").on(t.fornecedorId),
}));
export type AtivoFornecedor = typeof ativoFornecedor.$inferSelect;
export type InsertAtivoFornecedor = typeof ativoFornecedor.$inferInsert;

/** Ocorrências / não conformidades do fornecedor */
export const fornecedorOcorrencias = mysqlTable("fornecedor_ocorrencias", {
  id: int("id").autoincrement().primaryKey(),
  fornecedorId: int("fornecedorId").notNull(),
  tipo: mysqlEnum("tipo", ["nao_conformidade", "atraso", "elogio", "observacao"]).notNull(),
  descricao: text("descricao"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  byFornecedor: index("idx_forn_ocorr_forn").on(t.fornecedorId),
}));
export type FornecedorOcorrencia = typeof fornecedorOcorrencias.$inferSelect;
export type InsertFornecedorOcorrencia = typeof fornecedorOcorrencias.$inferInsert;

/** Documentos ingeridos — base do pipeline de ingestão (Fatia 3) */
export const fase5Documentos = mysqlTable("fase5_documentos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tipo: mysqlEnum("tipo", ["proforma", "invoice", "cotacao", "planilha", "pdf_outro"]).notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  status: mysqlEnum("status", [
    "recebido", "extraindo", "extraido", "em_revisao", "aprovado", "erro",
  ]).default("recebido").notNull(),
  // resultado bruto da extração (antes da aprovação humana):
  extracao: json("extracao"),
  // nível de confiança geral da extração (0-100):
  confianca: int("confianca"),
  operacaoId: int("operacaoId"),               // se veio de uma operação
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  byUser: index("idx_fase5_docs_user").on(t.userId),
}));
export type Fase5Documento = typeof fase5Documentos.$inferSelect;
export type InsertFase5Documento = typeof fase5Documentos.$inferInsert;

/**
 * ===== FASE 0.5: PROFORMAS & INVOICES =====
 *
 * Resultado ESTRUTURADO de uma proforma/invoice processada pela Excambia.
 * Tabela dedicada (aditiva, sem conflito com supplier_quotes do fluxo RFQ).
 *
 * Fluxo de COESÃO:
 *   upload/manual → Excambia extrai → proforma (rascunho) → revisão humana →
 *   distribuição: fornecedor → industries (tipoEntidade=fornecedor)
 *                 itens/preços → products (Ativos & Insumos)
 */
export const proformas = mysqlTable("proformas", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),

  // Identificação do documento
  numero: varchar("numero", { length: 50 }),            // auto: PF-2026-0001
  tipo: mysqlEnum("tipo", ["proforma", "invoice"]).default("proforma").notNull(),

  // Vínculo opcional ao documento bruto ingerido (pipeline Fase 5)
  documentoId: int("documentoId"),

  // Fornecedor (vínculo opcional à base unificada)
  industriaId: int("industriaId"),                       // FK lógica → industries (fornecedor)
  supplierName: varchar("supplierName", { length: 255 }),
  supplierCountry: varchar("supplierCountry", { length: 100 }),
  supplierEmail: varchar("supplierEmail", { length: 320 }),
  supplierPhone: varchar("supplierPhone", { length: 50 }),

  // Condições comerciais
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  incoterm: varchar("incoterm", { length: 5 }).default("FOB"),
  paymentTerms: varchar("paymentTerms", { length: 255 }),
  leadTimeDays: int("leadTimeDays"),
  moq: int("moq"),
  totalFobCents: bigint("totalFobCents", { mode: "number" }),
  quotationDate: timestamp("quotationDate"),
  validUntil: timestamp("validUntil"),

  // Vínculo opcional a operação/RFQ (proforma pode ser avulsa)
  operacaoId: int("operacaoId"),
  rfqId: int("rfqId"),

  // Documento original
  fileUrl: varchar("fileUrl", { length: 512 }),
  fileName: varchar("fileName", { length: 255 }),

  // Extração IA (antes da aprovação humana)
  extractionConfidence: int("extractionConfidence"),     // 0-100
  rawExtraction: json("rawExtraction"),

  // Ciclo de vida
  status: mysqlEnum("status", [
    "rascunho",     // criada, dados incompletos
    "extraida",     // IA extraiu, aguardando revisão
    "revisada",     // humano revisou/aprovou
    "distribuida",  // dados enviados para a base (industries + products)
    "arquivada",
  ]).default("rascunho").notNull(),
  distributedAt: timestamp("distributedAt"),

  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  byUser: index("idx_proformas_user").on(t.userId),
  byIndustria: index("idx_proformas_industria").on(t.industriaId),
}));
export type Proforma = typeof proformas.$inferSelect;
export type InsertProforma = typeof proformas.$inferInsert;

export const proformaItems = mysqlTable("proforma_items", {
  id: int("id").autoincrement().primaryKey(),
  proformaId: int("proformaId").notNull(),

  // Produto
  // productName guarda o NOME CURTO comercial (ex.: "Escora de aço Q235").
  // As especificações técnicas completas vão em `description`.
  // 1024 de folga p/ nomes ainda assim longos; a coluna não é indexada.
  productName: varchar("productName", { length: 1024 }).notNull(),
  // Especificações técnicas completas (medidas, material, acabamento, etc.).
  description: text("description"),
  ncmCode: varchar("ncmCode", { length: 10 }),
  quantity: int("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(),
  unitPriceCents: bigint("unitPriceCents", { mode: "number" }).notNull(),
  totalPriceCents: bigint("totalPriceCents", { mode: "number" }),

  // Pós-distribuição / cálculo
  productId: int("productId"),                           // FK lógica → products (Ativos & Insumos)
  nationalizedUnitCostCents: bigint("nationalizedUnitCostCents", { mode: "number" }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  byProforma: index("idx_proforma_items_proforma").on(t.proformaId),
}));
export type ProformaItem = typeof proformaItems.$inferSelect;
export type InsertProformaItem = typeof proformaItems.$inferInsert;

/* ============================================================
 * PARÂMETROS DE CÁLCULO — fundação de dados versionada
 * Migração: 0032_parametros_de_calculo.sql (cria tabelas + seed)
 * ============================================================ */

/**
 * Tax Parameters — parâmetros globais do motor com vigência por data.
 * Substitui as constantes hardcoded (PIS, COFINS, AFRMM, Siscomex, despesas).
 * O valor vigente de uma chave = última linha com effectiveDate <= hoje,
 * isActive=true e (endDate nula ou > hoje).
 */
export const taxParameters = mysqlTable("tax_parameters", {
  id: int("id").autoincrement().primaryKey(),
  paramKey: varchar("paramKey", { length: 60 }).notNull(), // PIS_IMPORT, COFINS_IMPORT, AFRMM_RATE, SISCOMEX_BASE, SISCOMEX_ADICAO, BL_LIBERATION, CUSTOMS_BROKER
  label: varchar("label", { length: 180 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(), // tributo_federal | taxa_fixa | despesa
  unit: varchar("unit", { length: 12 }).notNull(), // bp | cents
  valueBp: int("valueBp"), // alíquota em basis points (2,1% = 210)
  valueCents: bigint("valueCents", { mode: "number" }), // taxa fixa em centavos
  effectiveDate: timestamp("effectiveDate").notNull(),
  endDate: timestamp("endDate"), // null = vigente
  legalBasis: varchar("legalBasis", { length: 255 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  byKey: index("idx_tax_parameters_key").on(t.paramKey),
  uqKeyDate: unique("uq_tax_parameters").on(t.paramKey, t.effectiveDate),
}));
export type TaxParameter = typeof taxParameters.$inferSelect;
export type InsertTaxParameter = typeof taxParameters.$inferInsert;

/**
 * Port Costs — custos portuários por terminal, lançáveis na planilha de cálculo.
 * THC e liberação em centavos; armazenagem em basis points do CIF.
 */
export const portCosts = mysqlTable("port_costs", {
  id: int("id").autoincrement().primaryKey(),
  portCode: varchar("portCode", { length: 10 }).notNull(),
  portName: varchar("portName", { length: 180 }).notNull(),
  stateCode: varchar("stateCode", { length: 2 }).notNull(),
  modal: varchar("modal", { length: 20 }).default("maritimo").notNull(), // maritimo | aereo | rodoviario
  thcCents: bigint("thcCents", { mode: "number" }).default(0).notNull(),
  storageBp: int("storageBp").default(0).notNull(), // % do CIF em bp (1,5% = 150)
  liberationCents: bigint("liberationCents", { mode: "number" }).default(0).notNull(),
  otherCents: bigint("otherCents", { mode: "number" }).default(0).notNull(), // capatazia/extras
  effectiveDate: timestamp("effectiveDate").notNull(),
  legalBasis: varchar("legalBasis", { length: 255 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  byPort: index("idx_port_costs_port").on(t.portCode),
  byState: index("idx_port_costs_state").on(t.stateCode),
  uqPortModalDate: unique("uq_port_costs").on(t.portCode, t.modal, t.effectiveDate),
}));
export type PortCost = typeof portCosts.$inferSelect;
export type InsertPortCost = typeof portCosts.$inferInsert;

/**
 * NCM Exceptions (Ex-Tarifário) — reduções/suspensões temporárias de II/IPI
 * por NCM, conforme Resolução GECEX / Portaria SECEX.
 */
export const ncmExceptions = mysqlTable("ncm_exceptions", {
  id: int("id").autoincrement().primaryKey(),
  ncmCode: varchar("ncmCode", { length: 10 }).notNull(),
  exCode: varchar("exCode", { length: 20 }), // número do Ex-tarifário
  description: text("description"),
  reducedIiRate: int("reducedIiRate"), // II reduzido em bp (0 = isento)
  reducedIpiRate: int("reducedIpiRate"), // IPI reduzido em bp
  legalBasis: varchar("legalBasis", { length: 255 }), // Resolução GECEX nº ...
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  byNcm: index("idx_ncm_exceptions_ncm").on(t.ncmCode),
  uqNcmEx: unique("uq_ncm_exceptions").on(t.ncmCode, t.exCode),
}));
export type NcmException = typeof ncmExceptions.$inferSelect;
export type InsertNcmException = typeof ncmExceptions.$inferInsert;
