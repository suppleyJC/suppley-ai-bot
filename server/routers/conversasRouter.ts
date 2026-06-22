/**
 * Router tRPC de CONVERSAS da Excambia.
 *
 * CRUD de conversas + envio de mensagem (que chama o orquestrador agêntico).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as conversaDb from "../db/conversaDb";
import { runExcambia } from "../agent/orchestrator";
import { TRPCError } from "@trpc/server";

export const conversasRouter = router({
  /** Lista conversas do usuário (operações e avulsas) */
  list: protectedProcedure.query(async ({ ctx }) => {
    return conversaDb.listConversas(ctx.user.id);
  }),

  /** Abre uma conversa com histórico */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return conversaDb.getConversa(input.id, ctx.user.id);
    }),

  /** Cria nova conversa */
  create: protectedProcedure
    .input(z.object({
      titulo: z.string().optional(),
      operacaoId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return conversaDb.createConversa(ctx.user.id, {
        titulo: input.titulo,
        operacaoId: input.operacaoId,
      });
    }),

  /** Renomeia conversa */
  rename: protectedProcedure
    .input(z.object({ id: z.number(), titulo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await conversaDb.renameConversa(input.id, ctx.user.id, input.titulo);
    }),

  /** Fixa/desafixa conversa no topo */
  setPinned: protectedProcedure
    .input(z.object({ id: z.number(), fixada: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await conversaDb.setPinnedConversa(input.id, ctx.user.id, input.fixada);
    }),

  /** Arquiva conversa */
  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await conversaDb.archiveConversa(input.id, ctx.user.id);
    }),

  /** Deleta conversa (soft delete) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await conversaDb.deleteConversa(input.id, ctx.user.id);
    }),

  /** Alias para delete */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await conversaDb.deleteConversa(input.id, ctx.user.id);
    }),

  /** Vincula conversa a uma operação */
  linkOperacao: protectedProcedure
    .input(z.object({ id: z.number(), operacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await conversaDb.linkConversaToOperacao(input.id, ctx.user.id, input.operacaoId);
    }),

  /** Envia mensagem e chama o orquestrador agêntico */
  send: protectedProcedure
    .input(z.object({
      conversaId: z.number(),
      messages: z.array(z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })),
      operacaoId: z.number().optional(),
      estagio: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Adiciona a mensagem do usuário ao histórico
      const userMsg = input.messages[input.messages.length - 1];
      if (userMsg?.role === "user") {
        await conversaDb.addMessage(input.conversaId, "user", userMsg.content);
      }

      // Chama o orquestrador
      const result = await runExcambia({
        userId: ctx.user.id,
        operacaoId: input.operacaoId,
        estagio: input.estagio,
        messages: input.messages,
      });

      // Persiste a resposta
      await conversaDb.addMessage(
        input.conversaId,
        "assistant",
        result.reply,
        result.toolsUsed,
        result.toolResults
      );

      return {
        reply: result.reply,
        toolsUsed: result.toolsUsed,
        toolResults: result.toolResults,
      };
    }),
});
