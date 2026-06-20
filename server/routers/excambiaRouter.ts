import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import * as excambiaService from "../services/excambiaAgentService";
import * as openaiService from "../services/openaiService";
import { runExcambia } from "../agent/orchestrator";

export const excambiaRouter = router({
// Chat agêntico — orquestrador com function calling (motor certificado via tools)
agentChat: protectedProcedure
  .input(z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    operacaoId: z.number().optional(),
    estagio: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const out = await runExcambia({
      userId: ctx.user.id,
      operacaoId: input.operacaoId,
      estagio: input.estagio,
      messages: input.messages,
    });
    return { reply: out.reply, toolsUsed: out.toolsUsed, toolResults: out.toolResults };
  }),

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
    conversaId: z.number().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const saved = await db.saveChatMessage({
      userId: ctx.user.id,
      role: input.role,
      content: input.content,
      sessionId: input.sessionId || null,
      conversaId: input.conversaId ?? null,
    });
    // Mantém a sidebar ordenada por atividade recente.
    if (input.conversaId) await db.touchConversa(input.conversaId);
    return saved;
  }),

clearChatHistory: protectedProcedure.mutation(async ({ ctx }) => {
  return db.clearChatHistory(ctx.user.id);
}),

// ==================== Conversas (Fase 3) ====================
// Threads de chat nomeáveis, retomáveis e (opcionalmente) ligadas a uma Operação.

listConversas: protectedProcedure
  .input(z.object({ status: z.enum(["ativa", "arquivada"]).optional() }).optional())
  .query(async ({ ctx, input }) => {
    const conversas = await db.listConversas(ctx.user.id, { status: input?.status });
    const legacyCount = await db.countLegacyMessages(ctx.user.id);
    return { conversas, legacyCount };
  }),

createConversa: protectedProcedure
  .input(z.object({
    titulo: z.string().optional(),
    operacaoId: z.number().optional(),
    estagio: z.enum(["demand", "source", "analyze", "execute", "finance", "closed", "lost"]).optional(),
  }).optional())
  .mutation(async ({ ctx, input }) => {
    return db.createConversa({
      userId: ctx.user.id,
      titulo: input?.titulo,
      operacaoId: input?.operacaoId,
      estagio: input?.estagio,
    });
  }),

getConversa: protectedProcedure
  .input(z.object({ conversaId: z.number() }))
  .query(async ({ ctx, input }) => {
    return db.getConversa(input.conversaId, ctx.user.id);
  }),

getConversaMessages: protectedProcedure
  .input(z.object({ conversaId: z.number() }))
  .query(async ({ ctx, input }) => {
    return db.getConversaMessages(input.conversaId, ctx.user.id);
  }),

renameConversa: protectedProcedure
  .input(z.object({ conversaId: z.number(), titulo: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    const updated = await db.renameConversa(input.conversaId, ctx.user.id, input.titulo);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
    return updated;
  }),

archiveConversa: protectedProcedure
  .input(z.object({ conversaId: z.number(), status: z.enum(["ativa", "arquivada"]) }))
  .mutation(async ({ ctx, input }) => {
    const updated = await db.setConversaStatus(input.conversaId, ctx.user.id, input.status);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
    return updated;
  }),

deleteConversa: protectedProcedure
  .input(z.object({ conversaId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const ok = await db.deleteConversa(input.conversaId, ctx.user.id);
    if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
    return { ok };
  }),

linkConversaOperacao: protectedProcedure
  .input(z.object({
    conversaId: z.number(),
    operacaoId: z.number().nullable(),
    estagio: z.enum(["demand", "source", "analyze", "execute", "finance", "closed", "lost"]).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const updated = await db.linkConversaToOperacao(
      input.conversaId, ctx.user.id, input.operacaoId, input.estagio,
    );
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
    return updated;
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
