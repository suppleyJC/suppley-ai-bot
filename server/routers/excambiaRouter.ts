import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import * as excambiaService from "../services/excambiaAgentService";
import * as openaiService from "../services/openaiService";

export const excambiaRouter = router({
// Chat with Excambia
chat: protectedProcedure
  .input(z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    includeHistory: z.boolean().default(true),
  }))
  .mutation(async ({ ctx, input }) => {
    // Get user quotation history + RFQ history for context
    let context: excambiaService.AnalysisContext | undefined;
    
    if (input.includeHistory) {
      const history = await excambiaService.getUserQuotationHistory(ctx.user.id, 5);
      const rfqHistory = await excambiaService.getUserRfqHistory(ctx.user.id, 5);
      
      if (history.length > 0 || rfqHistory.length > 0) {
        context = {
          quotations: history.length > 0 ? history.map(q => ({
            id: q.id,
            name: q.supplierName || "Sem nome",
            totalFobCents: Number(q.totalFobCents),
            totalCifCents: Number(q.totalCifCents),
            totalTaxesCents: Number(q.totalTaxesCents),
            totalCostCents: Number(q.totalCostCents),
            suggestedPriceCents: Number(q.totalSuggestedPriceCents),
            createdAt: q.createdAt,
          })) : undefined,
          rfqs: rfqHistory.length > 0 ? rfqHistory : undefined,
        };
      }
    }
    
    const response = await excambiaService.processMessage(ctx.user.id, input.messages, context);
    
    return { response };
  }),

// Analyze document (PDF or image)
analyzeDocument: protectedProcedure
  .input(z.object({
    documentUrl: z.string().url(),
    mimeType: z.string(),
    question: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const analysis = await excambiaService.analyzeDocument(
      ctx.user.id,
      input.documentUrl,
      input.mimeType,
      input.question
    );
    
    return { analysis };
  }),

// Generate viability analysis for a quotation
analyzeViability: protectedProcedure
  .input(z.object({
    products: z.array(z.object({
      name: z.string(),
      ncm: z.string(),
      quantity: z.number(),
      unitPriceFob: z.number(),
      totalCost: z.number(),
      suggestedPrice: z.number(),
      targetPrice: z.number().optional(),
    })),
    totalFob: z.number(),
    totalCost: z.number(),
    totalTaxes: z.number(),
    markup: z.number(),
  }))
  .mutation(async ({ input }) => {
    const analysis = await excambiaService.generateViabilityAnalysis(input);
    return { analysis };
  }),

// Generate negotiation suggestions
suggestNegotiation: protectedProcedure
  .input(z.object({
    supplierName: z.string(),
    products: z.array(z.object({
      name: z.string(),
      ncm: z.string(),
      unitPriceFob: z.number(),
    })),
    totalFob: z.number(),
  }))
  .mutation(async ({ input }) => {
    const suggestions = await excambiaService.generateNegotiationSuggestions(input);
    return { suggestions };
  }),

// Get quotation history for context
getHistory: protectedProcedure
  .input(z.object({ limit: z.number().default(10) }).optional())
  .query(async ({ ctx, input }) => {
    return excambiaService.getUserQuotationHistory(ctx.user.id, input?.limit ?? 10);
  }),

// OpenAI API Key Management
hasApiKey: protectedProcedure.query(async ({ ctx }) => {
  return openaiService.hasOpenAIApiKey(ctx.user.id);
}),

validateApiKey: protectedProcedure
  .input(z.object({ apiKey: z.string().min(1) }))
  .mutation(async ({ input }) => {
    return openaiService.validateOpenAIApiKey(input.apiKey);
  }),

saveApiKey: protectedProcedure
  .input(z.object({ apiKey: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    // First validate the key
    const validation = await openaiService.validateOpenAIApiKey(input.apiKey);
    if (!validation.valid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: validation.error || "API key inválida",
      });
    }
    
    // Save the key
    const saved = await openaiService.saveOpenAIApiKey(ctx.user.id, input.apiKey);
    if (!saved) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao salvar API key",
      });
    }
    
    return { success: true, models: validation.models };
  }),

removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
  return openaiService.removeOpenAIApiKey(ctx.user.id);
}),

// Chat History Persistence
getChatHistory: protectedProcedure
  .input(z.object({ limit: z.number().default(100) }).optional())
  .query(async ({ ctx, input }) => {
    const messages = await db.getChatHistory(ctx.user.id, input?.limit ?? 100);
    // Reverse to get chronological order (oldest first)
    return messages.reverse();
  }),

saveChatMessage: protectedProcedure
  .input(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    sessionId: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return db.saveChatMessage({
      userId: ctx.user.id,
      role: input.role,
      content: input.content,
      sessionId: input.sessionId || null,
    });
  }),

clearChatHistory: protectedProcedure.mutation(async ({ ctx }) => {
  return db.clearChatHistory(ctx.user.id);
}),

// Learning Context
getLearningContext: protectedProcedure.query(async ({ ctx }) => {
  return db.getLearningContext(ctx.user.id);
}),

saveLearningContext: protectedProcedure
  .input(z.object({
    contextType: z.enum(["preference", "business_rule", "supplier_info", "product_insight", "market_trend", "calculation_pattern", "feedback"]),
    key: z.string(),
    value: z.string(),
    importance: z.number().min(0).max(100).default(50),
    source: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return db.saveLearningContext({
      userId: ctx.user.id,
      contextType: input.contextType,
      key: input.key,
      value: input.value,
      importance: input.importance,
      source: input.source || null,
    });
  }),
});
