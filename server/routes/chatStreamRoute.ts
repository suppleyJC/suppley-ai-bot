import { Router, Request, Response } from "express";
import { performance } from "node:perf_hooks";
import { jwtVerify } from "jose";
import * as conversaDb from "../db/conversaDb";
import { getUserById } from "../services/authService";
import { runExcambiaStream } from "../agent/orchestrator";
import { enrichOperacaoFromChat } from "../services/gapEnrichmentService";
import { applyAttachmentToMessages, attachmentMarker, type AttachmentRef } from "../services/attachmentBlock";
import type { Message } from "../_core/llm";
import { getJwtSecret } from "../_core/jwtSecret";
import { createRateLimit } from "../_core/rateLimit";

const router = Router();
const chatStreamRateLimit = createRateLimit({ windowMs: 60_000, max: 30 });
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
    const { payload } = await jwtVerify(token, getJwtSecret());
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

/**
 * O stream aceita somente o cookie HttpOnly da sessão.
 * Evita ambiguidade entre duas credenciais controláveis pelo request e mantém
 * a rota alinhada ao fetch same-origin usado pelo cliente.
 */
async function resolveUserId(req: Request): Promise<number | null> {
  // Sempre executa a verificação criptográfica. Cookie ausente vira string vazia,
  // que jwtVerify rejeita e converte para null dentro de verifySessionToken.
  // Assim não existe um ramo controlado pelo request que pule o security check.
  return verifySessionToken(readSessionCookie(req) ?? "");
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

router.post("/api/chat/stream", chatStreamRateLimit, async (req: Request, res: Response) => {
  const perfStartedAt = performance.now();
  let perfFirstEventAt: number | null = null;
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

    // POSSE DA CONVERSA (obrigatório): o conversaId vem do corpo da requisição.
    // Sem esta checagem, um usuário autenticado grava mensagens — e faz a
    // Excambia responder — dentro da thread de OUTRO usuário. Todo o resto da
    // rota escreve usando este id, então a validação vem antes de qualquer
    // gravação.
    const daPessoa = await conversaDb.conversaPertenceAoUsuario(payload.conversaId, user.id);
    if (!daPessoa) {
      res.status(404).json({ error: "Conversa não encontrada" });
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
      user.id,
    );

    // Enriquecimento automático — FORA do caminho crítico: rodava ANTES do
    // primeiro byte da resposta e atrasava a percepção de fluidez. Agora roda
    // em paralelo (o agente já tem as mensagens no contexto; o snapshot da
    // operação pega o enriquecimento a partir do próximo turno).
    if (payload.operacaoId) {
      void enrichOperacaoFromChat(
        user.id,
        payload.operacaoId,
        payload.messages.map((m) => ({ author: m.role, content: m.content })),
      ).catch((err) => console.error("[chatStream] enriquecimento falhou:", err));
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const perfHeadersAt = performance.now();

    let fullReply = "";
    let toolsUsed: string[] = [];
    let toolResults: Array<{ name: string; ok: boolean; data?: unknown }> = [];

    try {
      for await (const chunk of runExcambiaStream({
        userId: user.id,
        operacaoId: payload.operacaoId,
        estagio: payload.estagio,
        messages: agentMessages,
        // Chave permanente do anexo → tools vinculam o arquivo ao que criarem.
        anexo: payload.attachment?.fileKey
          ? {
              fileKey: payload.attachment.fileKey,
              name: payload.attachment.name,
              mimeType: payload.attachment.mimeType,
            }
          : undefined,
      })) {
        if (perfFirstEventAt == null) perfFirstEventAt = performance.now();
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

      const perfFinishedAt = performance.now();
      console.info("[perf:chat]", {
        prepMs: Math.round(perfHeadersAt - perfStartedAt),
        firstEventMs: perfFirstEventAt == null ? null : Math.round(perfFirstEventAt - perfStartedAt),
        totalMs: Math.round(perfFinishedAt - perfStartedAt),
        toolsUsed: toolsUsed.length,
        hadAttachment: Boolean(payload.attachment),
      });

      res.write('data: {"type":"done"}\n\n');
      res.end();
    } catch (err) {
      console.error("[chatStream] erro no stream:", err);
      console.info("[perf:chat]", {
        failed: true,
        totalMs: Math.round(performance.now() - perfStartedAt),
        firstEventMs: perfFirstEventAt == null ? null : Math.round(perfFirstEventAt - perfStartedAt),
        hadAttachment: Boolean(payload.attachment),
      });
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
