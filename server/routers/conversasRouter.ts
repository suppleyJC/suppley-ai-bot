/**
 * Router tRPC de CONVERSAS da Excambia.
 *
 * CRUD de conversas + envio de mensagem (que chama o orquestrador agêntico).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as conversaDb from "../db/conversaDb";
import { runExcambia } from "../agent/orchestrator";
import type { Message, MessageContent } from "../_core/llm";
import { enrichOperacaoFromChat } from "../services/gapEnrichmentService";
import { isSpreadsheet, spreadsheetBufferToText } from "../services/spreadsheetToText";
import { TRPCError } from "@trpc/server";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

/**
 * Baixa o arquivo anexado e monta o bloco de conteúdo multimodal (base64) que o
 * Claude consegue ler — `document` para PDF, `image` para imagens, e para
 * planilhas (XLSX/XLS/CSV) parseia o conteúdo e devolve como bloco de texto
 * (o Claude não lê o binário de planilha). Mesmo padrão da extração de
 * proformas. Best-effort: erro vira null (segue só texto).
 */
async function buildAttachmentBlock(att: {
  url: string;
  mimeType: string;
  name: string;
}): Promise<MessageContent | null> {
  try {
    const resp = await fetch(att.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());

    // Planilhas: converte para texto/Markdown antes de enviar ao LLM.
    if (isSpreadsheet(att.mimeType, att.name)) {
      const tabela = await spreadsheetBufferToText(buffer, {
        name: att.name,
        mimeType: att.mimeType,
      });
      return {
        type: "text",
        text: `Conteúdo da planilha anexada (${att.name}):\n\n${tabela}`,
      };
    }

    const data = buffer.toString("base64");

    if (att.mimeType === "application/pdf") {
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      };
    }
    const media = (IMAGE_TYPES as readonly string[]).includes(att.mimeType)
      ? (att.mimeType as (typeof IMAGE_TYPES)[number])
      : "image/jpeg";
    return { type: "image", source: { type: "base64", media_type: media, data } };
  } catch (err) {
    console.error("[conversas.send] falha ao ler anexo:", err);
    return null;
  }
}

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
      // Anexo opcional (PDF/imagem) já enviado ao storage. Quando presente, o
      // arquivo é lido e encaminhado ao agente junto da última mensagem.
      attachment: z
        .object({ url: z.string(), mimeType: z.string(), name: z.string() })
        .optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Adiciona a mensagem do usuário ao histórico (com marcador do anexo).
      const userMsg = input.messages[input.messages.length - 1];
      if (userMsg?.role === "user") {
        const persisted = input.attachment
          ? `📎 ${input.attachment.name}${userMsg.content ? `\n\n${userMsg.content}` : ""}`
          : userMsg.content;
        await conversaDb.addMessage(input.conversaId, "user", persisted);
      }

      // Monta as mensagens para o agente; se houver anexo, transforma a última
      // mensagem do usuário em conteúdo multimodal (texto + arquivo) para o LLM.
      const agentMessages: Message[] = input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      if (input.attachment && agentMessages.length > 0) {
        const block = await buildAttachmentBlock(input.attachment);
        const lastIdx = agentMessages.length - 1;
        const lastText = (agentMessages[lastIdx].content as string) || "";
        if (block) {
          const text =
            lastText.trim() ||
            "Segue o arquivo em anexo. Leia o documento e conduza conforme a operação.";
          agentMessages[lastIdx] = {
            role: "user",
            content: [{ type: "text", text }, block],
          };
        }
      }

      // PILAR 2 — Enriquecimento automático: extrai dados que a pessoa forneceu
      // no chat (cliente, origem, prazo, regime) e grava na operação ANTES de
      // chamar o agente, para que a Excambia já enxergue os dados atualizados.
      // Tolerante a falha: um erro aqui não pode derrubar a conversa.
      let enriched: Record<string, unknown> = {};
      if (input.operacaoId) {
        try {
          const res = await enrichOperacaoFromChat(
            ctx.user.id,
            input.operacaoId,
            input.messages.map((m) => ({ author: m.role, content: m.content })),
          );
          enriched = res.updated;
        } catch (err) {
          console.error("[conversas.send] enriquecimento falhou:", err);
        }
      }

      // Chama o orquestrador (com a mensagem multimodal quando houver anexo)
      const result = await runExcambia({
        userId: ctx.user.id,
        operacaoId: input.operacaoId,
        estagio: input.estagio,
        messages: agentMessages,
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
        enriched,
      };
    }),
});
