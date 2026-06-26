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

/**
 * Traduz o erro técnico (geralmente da API da Anthropic) numa mensagem clara e
 * ACIONÁVEL, exibida na própria conversa — assim o problema é diagnosticável sem
 * abrir os logs do servidor.
 */
function diagnoseError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  const has = (re: RegExp) => re.test(msg);

  if (has(/ANTHROPIC_API_KEY is not configured/i))
    return "Configuração ausente: a chave da API (ANTHROPIC_API_KEY) não está definida no servidor. Avise o time técnico.";
  if (has(/\b401\b|authentication|invalid x-api-key|invalid api key/i))
    return "Falha de autenticação com a IA — a chave da API parece inválida ou expirada. É preciso atualizar a ANTHROPIC_API_KEY.";
  if (has(/\b403\b|permission|not allowed|web_search/i))
    return "A IA recusou a requisição (permissão). Pode ser um recurso não habilitado na conta (ex.: pesquisa web). Avise o time técnico para revisar.";
  if (has(/credit|billing|quota|insufficient|payment/i))
    return "Os créditos da API da IA acabaram. É preciso recarregar o saldo na conta da Anthropic para a Excambia voltar a responder.";
  if (has(/\b429\b|rate limit|overloaded|too many requests/i))
    return "Muitas requisições em pouco tempo (limite da IA). Aguarde alguns segundos e tente de novo.";
  if (has(/prompt is too long|context|maximum.*tokens|too many tokens/i))
    return "O conteúdo ficou grande demais para uma única análise. Tente enviar menos itens por vez ou um arquivo menor.";
  if (has(/\b400\b/i))
    return "A requisição à IA foi rejeitada (erro 400). Já estou registrando o detalhe — me diga o que tentou fazer que eu ajusto.";

  return "Tive um problema técnico ao processar agora. Tente de novo em instantes — se persistir, me diga de outro jeito que eu sigo daqui.";
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

      // INTERAÇÃO CONSTANTE: nunca deixe o usuário sem resposta. Se o agente
      // voltou vazio, entrega um texto de continuidade em vez de uma bolha vazia.
      if (!fullReply || !fullReply.trim()) {
        fullReply =
          "Não consegui formular uma resposta agora. Pode reformular ou me dar um pouco mais de contexto?";
        res.write(`data: ${JSON.stringify({ type: "reply", reply: fullReply, toolsUsed, toolResults })}\n\n`);
      }

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
      // Mesmo em erro, responde e PERSISTE — a conversa não pode ficar muda.
      // Diagnostica o tipo do erro para a mensagem ser ACIONÁVEL na própria tela.
      const fallback = diagnoseError(err);
      try {
        await conversaDb.addMessage(payload.conversaId, "assistant", fallback, [], []);
      } catch { /* não bloqueia a resposta ao usuário */ }
      res.write(`data: ${JSON.stringify({ type: "reply", reply: fallback, toolsUsed: [], toolResults: [] })}\n\n`);
      res.write('data: {"type":"done"}\n\n');
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
