import { Router, Request, Response } from "express";
import * as jwt from "jose";
import * as conversaDb from "../db/conversaDb";
import { runExcambiaStream, type StreamChunk } from "../agent/orchestrator";
import { enrichOperacaoFromChat } from "../services/gapEnrichmentService";
import type { Message } from "../_core/llm";

const router = Router();

interface StreamPayload {
  conversaId: number;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  operacaoId?: number;
  estagio?: string;
}

async function verifyJWT(token: string): Promise<{ userId: number } | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key");
    const verified = await jwt.jwtVerify(token, secret);
    return { userId: (verified.payload as any).userId };
  } catch {
    return null;
  }
}

router.post("/api/chat/stream", async (req: Request, res: Response) => {
  try {
    // Autenticação via JWT
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = authHeader.slice(7);
    const auth = await verifyJWT(token);
    if (!auth) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const userId = auth.userId;
    const payload: StreamPayload = req.body;

    // Validação
    if (!payload.conversaId || !payload.messages) {
      res.status(400).json({ error: "Missing conversaId or messages" });
      return;
    }

    // Adiciona mensagem do usuário ao histórico
    const userMsg = payload.messages[payload.messages.length - 1];
    if (userMsg?.role === "user") {
      await conversaDb.addMessage(payload.conversaId, "user", userMsg.content);
    }

    // Enriquecimento automático (Pilar 2)
    let enriched: Record<string, unknown> = {};
    if (payload.operacaoId) {
      try {
        const res = await enrichOperacaoFromChat(
          userId,
          payload.operacaoId,
          payload.messages.map((m) => ({ author: m.role, content: m.content })),
        );
        enriched = res.updated;
      } catch (err) {
        console.error("[chatStream] enriquecimento falhou:", err);
      }
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Emite chunks do stream
    let fullReply = "";
    let toolsUsed: string[] = [];
    let toolResults: Array<{ name: string; ok: boolean; data?: unknown }> = [];

    try {
      for await (const chunk of runExcambiaStream({
        userId,
        operacaoId: payload.operacaoId,
        estagio: payload.estagio,
        messages: payload.messages as Message[],
      })) {
        // Acumula para persistência
        if (chunk.type === "reply") {
          fullReply = chunk.reply;
          toolsUsed = chunk.toolsUsed;
          toolResults = chunk.toolResults;
        }

        // Envia como SSE
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

      // Fecha stream
      res.write("data: {\"type\":\"done\"}\n\n");
      res.end();
    } catch (err) {
      console.error("[chatStream] erro:", err);
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Erro ao processar requisição",
        })}\n\n`
      );
      res.end();
    }
  } catch (err) {
    console.error("[chatStream] erro geral:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as chatStreamRouter };
