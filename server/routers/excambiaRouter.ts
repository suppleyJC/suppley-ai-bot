import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
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
    // Mantém a sidebar ordenada por atividade recente — só na própria conversa
    // (o conversaId vem do cliente; sem a checagem dá para mexer na thread alheia).
    if (input.conversaId && (await db.conversaPertenceAoUsuario(input.conversaId, ctx.user.id))) {
      await db.touchConversa(input.conversaId);
    }
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
    const conversas = await db.listConversasFlat(ctx.user.id, { status: input?.status });
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
    return db.createConversa(ctx.user.id, {
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

updateLearningContext: protectedProcedure
  .input(z.object({
    id: z.number(),
    contextType: z.enum(["preference", "business_rule", "supplier_info", "product_insight", "market_trend", "calculation_pattern", "feedback"]).optional(),
    key: z.string().optional(),
    value: z.string().optional(),
    importance: z.number().min(0).max(100).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    await db.updateLearningContext(id, ctx.user.id, patch);
    return { ok: true };
  }),

deleteLearningContext: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ ctx, input }) => {
    await db.deleteLearningContext(input.id, ctx.user.id);
    return { ok: true };
  }),
});
