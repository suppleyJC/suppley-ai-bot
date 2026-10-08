import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { generateSupplierMessage } from "../services/rfqService";
import crypto from "crypto";

/**
 * Messaging Router - Sistema de disparo multicanal com inbox bidirecional
 * 
 * Fluxo:
 * 1. Usuário seleciona indústria/contato e cria mensagem (ou usa template)
 * 2. Sistema gera token único de resposta e URL pública
 * 3. Mensagem é disparada via canal escolhido (email, WhatsApp, WeChat)
 * 4. Fornecedor responde via portal público (usando token) ou via canal direto
 * 5. Resposta é recebida, processada por IA e aparece no inbox
 */

function generateResponseToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const messagingRouter = router({
  // === OUTBOUND (Envio) ===
  
  // Listar mensagens enviadas
  outbound: router({
    list: protectedProcedure
      .input(z.object({
        industryId: z.number().optional(),
        rfqId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return db.getOutboundMessages(ctx.user.id, input?.industryId, input?.rfqId);
      }),

    // Criar e enviar mensagem
    send: protectedProcedure
      .input(z.object({
        industryId: z.number(),
        contactId: z.number().optional(),
        rfqId: z.number().optional(),
        channel: z.enum(["email", "whatsapp", "wechat", "phone", "other"]),
        recipientAddress: z.string().min(1),
        subject: z.string().optional(),
        body: z.string().min(1),
        language: z.enum(["pt", "en", "es", "zh", "ar", "fr"]).default("en"),
      }))
      .mutation(async ({ ctx, input }) => {
        const responseToken = generateResponseToken();
        // URL pública onde o fornecedor pode responder
        const baseUrl = process.env.VITE_APP_URL || process.env.PUBLIC_URL || "";
        const responseUrl = `${baseUrl}/api/portal/respond/${responseToken}`;

        const result = await db.createOutboundMessage({
          userId: ctx.user.id,
          industryId: input.industryId,
          contactId: input.contactId || null,
          rfqId: input.rfqId || null,
          channel: input.channel,
          recipientAddress: input.recipientAddress,
          subject: input.subject || null,
          body: input.body,
          language: input.language,
          responseToken,
          responseUrl,
          status: "queued",
        });

        const messageId = result?.id;

        // Enviar via provedor real se configurado
        let deliveryStatus: "sent" | "failed" = "sent";
        let deliveryError: string | undefined;

        if (input.channel === "email") {
          const { sendEmail, buildNotificationEmail, isEmailConfigured } = await import("../services/emailService");
          if (isEmailConfigured()) {
            const { html, text } = buildNotificationEmail({
              title: input.subject || "Nova mensagem",
              message: input.body,
              ctaText: "Responder",
              ctaUrl: responseUrl,
            });
            const emailResult = await sendEmail({
              to: input.recipientAddress,
              subject: input.subject || "Nova mensagem - SUPPLEY Calc",
              html,
              text,
              replyTo: ctx.user.email || undefined,
              tags: ["messaging", "outbound"],
              metadata: { messageId: String(messageId || ""), userId: String(ctx.user.id) },
            });
            if (!emailResult.success) {
              deliveryStatus = "failed";
              deliveryError = emailResult.error;
            }
          }
        } else if (input.channel === "whatsapp") {
          const { sendWhatsAppMessage, isWhatsAppConfigured } = await import("../services/whatsappService");
          if (isWhatsAppConfigured()) {
            const waResult = await sendWhatsAppMessage({
              to: input.recipientAddress,
              body: `${input.subject ? `*${input.subject}*\n\n` : ""}${input.body}\n\nResponder: ${responseUrl}`,
            });
            if (!waResult.success) {
              deliveryStatus = "failed";
              deliveryError = waResult.error;
            }
          }
        }

        if (messageId) {
          await db.updateOutboundMessageStatus(messageId, deliveryStatus, { sentAt: new Date() });
        }

        return { 
          id: messageId, 
          responseToken, 
          responseUrl,
          status: deliveryStatus,
          ...(deliveryError ? { error: deliveryError } : {}),
        };
      }),

    // Gerar template de mensagem para fornecedor
    generateTemplate: protectedProcedure
      .input(z.object({
        industryId: z.number(),
        rfqId: z.number().optional(),
        language: z.enum(["pt", "en", "es", "zh"]).default("en"),
        products: z.array(z.object({
          name: z.string(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          specifications: z.string().optional(),
        })),
        incoterm: z.enum(["EXW", "FOB", "CIF", "CFR", "DDP"]).default("FOB"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Buscar dados da indústria
        const industry = await db.getIndustryById(input.industryId, ctx.user.id);
        if (!industry) throw new TRPCError({ code: "NOT_FOUND", message: "Indústria não encontrada" });

        // Gerar mensagem usando o rfqService
        const rfqItems = input.products.map(p => ({
          productName: p.name,
          quantity: p.quantity || 1,
          unit: p.unit || "UN",
          specifications: p.specifications ? { desc: p.specifications } : undefined,
        }));
        const preferences = {
          preferredIncoterm: input.incoterm,
          destinationState: "SC",
          urgency: "standard" as const,
          currency: "USD",
        };
        const message = generateSupplierMessage(
          `RFQ-${Date.now()}`,
          rfqItems,
          preferences,
          input.language as "en" | "zh" | "pt"
        );

        return {
          subject: message.subject,
          body: message.body,
          language: input.language,
        };
      }),

    // Disparar cotação para múltiplos fornecedores de uma vez
    bulkSend: protectedProcedure
      .input(z.object({
        rfqId: z.number().optional(),
        recipients: z.array(z.object({
          industryId: z.number(),
          contactId: z.number().optional(),
          channel: z.enum(["email", "whatsapp", "wechat", "phone", "other"]),
          recipientAddress: z.string().min(1),
        })),
        subject: z.string().optional(),
        body: z.string().min(1),
        language: z.enum(["pt", "en", "es", "zh", "ar", "fr"]).default("en"),
      }))
      .mutation(async ({ ctx, input }) => {
        const results = [];
        let sentCount = 0;
        let failedCount = 0;

        for (const recipient of input.recipients) {
          const responseToken = generateResponseToken();
          const baseUrl = process.env.VITE_APP_URL || process.env.PUBLIC_URL || "";
          const responseUrl = `${baseUrl}/api/portal/respond/${responseToken}`;

          const msgResult = await db.createOutboundMessage({
            userId: ctx.user.id,
            industryId: recipient.industryId,
            contactId: recipient.contactId || null,
            rfqId: input.rfqId || null,
            channel: recipient.channel,
            recipientAddress: recipient.recipientAddress,
            subject: input.subject || null,
            body: input.body,
            language: input.language,
            responseToken,
            responseUrl,
            status: "queued",
          });

          const msgId = msgResult?.id;
          let deliveryStatus: "sent" | "failed" = "sent";
          let deliveryError: string | undefined;

          // Enviar via provedor real se configurado
          try {
            if (recipient.channel === "email") {
              const { sendEmail, buildNotificationEmail, isEmailConfigured } = await import("../services/emailService");
              if (isEmailConfigured()) {
                const { html, text } = buildNotificationEmail({
                  title: input.subject || "Nova cota\u00e7\u00e3o",
                  message: input.body,
                  ctaText: "Responder Cota\u00e7\u00e3o",
                  ctaUrl: responseUrl,
                });
                const emailResult = await sendEmail({
                  to: recipient.recipientAddress,
                  subject: input.subject || "Solicita\u00e7\u00e3o de Cota\u00e7\u00e3o - SUPPLEY",
                  html,
                  text,
                  replyTo: ctx.user.email || undefined,
                  tags: ["bulk-send", "rfq"],
                  metadata: { messageId: String(msgId || ""), rfqId: String(input.rfqId || "") },
                });
                if (!emailResult.success) {
                  deliveryStatus = "failed";
                  deliveryError = emailResult.error;
                }
              }
            } else if (recipient.channel === "whatsapp") {
              const { sendWhatsAppMessage, isWhatsAppConfigured } = await import("../services/whatsappService");
              if (isWhatsAppConfigured()) {
                const waResult = await sendWhatsAppMessage({
                  to: recipient.recipientAddress,
                  body: `${input.subject ? `*${input.subject}*\n\n` : ""}${input.body}\n\nResponder: ${responseUrl}`,
                });
                if (!waResult.success) {
                  deliveryStatus = "failed";
                  deliveryError = waResult.error;
                }
              }
            }
          } catch (err: any) {
            deliveryStatus = "failed";
            deliveryError = err?.message || "Erro desconhecido no envio";
          }

          if (msgId) {
            await db.updateOutboundMessageStatus(msgId, deliveryStatus, { sentAt: new Date() });
          }

          if (deliveryStatus === "sent") sentCount++;
          else failedCount++;

          results.push({
            industryId: recipient.industryId,
            messageId: msgId,
            responseToken,
            status: deliveryStatus,
            ...(deliveryError ? { error: deliveryError } : {}),
          });
        }

        return { sent: sentCount, failed: failedCount, total: results.length, results };
      }),

    // Atualizar status de uma mensagem
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "queued", "sent", "delivered", "read", "responded", "bounced", "failed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateOutboundMessageStatus(input.id, input.status);
        return { success: true };
      }),
  }),

  // === INBOUND (Recebimento) ===
  inbound: router({
    // Listar mensagens recebidas (inbox)
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["unread", "read", "processed", "converted", "archived"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return db.getInboundMessages(ctx.user.id, input?.status);
      }),

    // Contar mensagens não lidas
    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const messages = await db.getInboundMessages(ctx.user.id, "unread");
        return { count: messages.length };
      }),

    // Marcar como lida
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateInboundMessageStatus(input.id, "read");
        return { success: true };
      }),

    // Converter resposta em cotação no sistema
    convertToQuote: protectedProcedure
      .input(z.object({
        id: z.number(),
        rfqId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateInboundMessageStatus(input.id, "converted");
        return { success: true, message: "Resposta convertida em cotação" };
      }),

    // Arquivar mensagem
    archive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateInboundMessageStatus(input.id, "archived");
        return { success: true };
      }),
  }),

  // === STATS ===
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const outbound = await db.getOutboundMessages(ctx.user.id);
      const inbound = await db.getInboundMessages(ctx.user.id);
      const unread = inbound.filter(m => m.status === "unread");

      return {
        totalSent: outbound.length,
        totalReceived: inbound.length,
        unreadCount: unread.length,
        responseRate: outbound.length > 0 
          ? Math.round((outbound.filter(m => m.status === "responded").length / outbound.length) * 100) 
          : 0,
      };
    }),

  // === INTEGRATION STATUS ===
  integrationStatus: protectedProcedure
    .query(async () => {
      const { getIntegrationStatus } = await import("../services/integrationStatusService");
      return getIntegrationStatus();
    }),
});
