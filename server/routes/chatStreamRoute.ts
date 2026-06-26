import { Router, Request, Response } from "express";
import { jwtVerify } from "jose";
import * as conversaDb from "../db/conversaDb";
import { getUserById } from "../services/authService";
import { runExcambiaStream } from "../agent/orchestrator";
import { enrichOperacaoFromChat } from "../services/gapEnrichmentService";
import { applyAttachmentToMessages, attachmentMarker, type AttachmentRef } from "../services/attachmentBlock";
import type { Message } from "../_core/llm";

const router = Router();

// Mesmo secret e cookie do context.ts (autenticação tRPC) — manter sincronizado.
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "suppley-calc-secret-key-2024"
);
const SESSION_COOKIE = "suppley_session";

interface StreamPayload {
  conversaId: number;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  operacaoId?: number;
  estagio?: string;
  attachment?: AttachmentRef;
}

async function verifySessionToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return (payload.userId as number) ?? null;
  } catch {
    return null;
  }
}

/** Lê o cookie de sessão direto do header (não há cookie-parser registrado). */
function readSessionCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Resolve o usuário do request: Authorization Bearer (fallback) ou cookie de sessão. */
async function resolveUserId(req: Request): Promise<number | null> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const userId = await verifySessionToken(authHeader.slice(7));
    if (userId) return userId;
  }
  const cookieToken = readSessionCookie(req);
  if (cookieToken) {
    const userId = await verifySessionToken(cookieToken);
    if (userId) return userId;
  }
  return null;
}

router.post("/api/chat/stream", async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Confirma que o usuário existe (espelha o context.ts).
    const user = await getUserById(userId);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload: StreamPayload = req.body;
    if (!payload?.conversaId || !Array.isArray(payload.messages)) {
      res.status(400).json({ error: "Missing conversaId or messages" });
      return;
    }

    // Adiciona mensagem do usuário ao histórico (com marcador do anexo, sem emoji)
    const userMsg = payload.messages[payload.messages.length - 1];
    if (userMsg?.role === "user") {
      const persisted = payload.attachment
        ? attachmentMarker(payload.attachment.name, userMsg.content)
        : userMsg.content;
      await conversaDb.addMessage(payload.conversaId, "user", persisted);
    }

    // Se houver anexo, transforma a última mensagem em conteúdo multimodal.
    const agentMessages = await applyAttachmentToMessages(
      payload.messages as Message[],
      payload.attachment,
    );

    // Enriquecimento automático (Pilar 2) — tolerante a falha
    if (payload.operacaoId) {
      try {
        await enrichOperacaoFromChat(
          user.id,
          payload.operacaoId,
          payload.messages.map((m) => ({ author: m.role, content: m.content })),
        );
      } catch (err) {
        console.error("[chatStream] enriquecimento falhou:", err);
      }
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let fullReply = "";
    let toolsUsed: string[] = [];
    let toolResults: Array<{ name: string; ok: boolean; data?: unknown }> = [];

    try {
      for await (const chunk of runExcambiaStream({
        userId: user.id,
        operacaoId: payload.operacaoId,
        estagio: payload.estagio,
        messages: agentMessages,
      })) {
        if (chunk.type === "reply") {
          fullReply = chunk.reply;
          toolsUsed = chunk.toolsUsed;
          toolResults = chunk.toolResults;
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      // Persiste resposta completa
      await conversaDb.addMessage(
        payload.conversaId,
        "assistant",
        fullReply,
        toolsUsed,
        toolResults,
      );

      res.write('data: {"type":"done"}\n\n');
      res.end();
    } catch (err) {
      console.error("[chatStream] erro no stream:", err);
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Erro ao processar requisição" })}\n\n`
      );
      res.end();
    }
  } catch (err) {
    console.error("[chatStream] erro geral:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.end();
    }
  }
});

export { router as chatStreamRouter };
