import * as operacaoService from "./operacaoService";
import type { ConversaMensagem } from "../db/conversaDb";

export interface EnrichmentResult {
  updated: Record<string, any>;
  enrichedAt: Date;
}

export async function enrichOperacaoFromChat(
  userId: number,
  operacaoId: number,
  chatMessages: ConversaMensagem[]
): Promise<EnrichmentResult> {
  const operacao = await operacaoService.getOperacao(userId, operacaoId);
  if (!operacao) throw new Error("Operação não encontrada");

  const updated: Record<string, any> = {};
  const enrichedAt = new Date();

  // Procura resposta para NCM nas mensagens do usuário
  const ncmResponse = extractFromMessages(chatMessages, ["ncm", "código", "classific"]);
  if (ncmResponse && !operacao.ncmProvavel) {
    await operacaoService.updateOperacao({
      userId,
      operacaoId,
      data: {
        ncmProvavel: ncmResponse,
        ncmValidated: false,
      },
    });
    updated.ncm = ncmResponse;
  }

  // Procura resposta para quantidade
  const quantityResponse = extractNumberFromMessages(chatMessages, ["quantidade", "unidade", "pç", "pc"]);
  if (quantityResponse && !operacao.quantidadeDesejada) {
    await operacaoService.updateOperacao({
      userId,
      operacaoId,
      data: {
        quantidadeDesejada: quantityResponse,
      },
    });
    updated.quantity = quantityResponse;
  }

  // Procura resposta para prazo
  const deadlineResponse = extractDateFromMessages(chatMessages, ["prazo", "entrega", "dia"]);
  if (deadlineResponse && !operacao.prazoDesejado) {
    await operacaoService.updateOperacao({
      userId,
      operacaoId,
      data: {
        prazoDesejado: deadlineResponse,
      },
    });
    updated.deadline = deadlineResponse;
  }

  // Procura resposta para país/origem
  const originResponse = extractFromMessages(chatMessages, ["país", "origem", "para importar"]);
  if (originResponse && !operacao.origemDesejada) {
    await operacaoService.updateOperacao({
      userId,
      operacaoId,
      data: {
        origemDesejada: originResponse,
      },
    });
    updated.origin = originResponse;
  }

  // Registra enriquecimento como evento
  if (Object.keys(updated).length > 0) {
    await operacaoService.addEvento({
      userId,
      operacaoId,
      tipo: "dados_enriquecidos",
      autor: "excambia",
      descricao: `Dados enriquecidos via chat: ${Object.keys(updated).join(", ")}`,
      payload: updated,
    });
  }

  return { updated, enrichedAt };
}

function extractFromMessages(messages: ConversaMensagem[], keywords: string[]): string | null {
  const userMessages = messages.filter((m) => m.author === "user");
  const combined = userMessages.map((m) => m.content.toLowerCase()).join(" ");

  const keywordMatches = keywords.filter((kw) => combined.includes(kw.toLowerCase()));
  if (keywordMatches.length === 0) return null;

  const lastUserMsg = userMessages[userMessages.length - 1];
  if (!lastUserMsg) return null;

  const words = lastUserMsg.content.split(/\s+/);
  return words.slice(0, 10).join(" ");
}

function extractNumberFromMessages(messages: ConversaMensagem[], keywords: string[]): number | null {
  const userMessages = messages.filter((m) => m.author === "user");

  for (const msg of userMessages) {
    const lowerMsg = msg.content.toLowerCase();
    const hasKeyword = keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
    if (!hasKeyword) continue;

    const numbers = msg.content.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      return parseInt(numbers[numbers.length - 1], 10);
    }
  }

  return null;
}

function extractDateFromMessages(messages: ConversaMensagem[], keywords: string[]): Date | null {
  const userMessages = messages.filter((m) => m.author === "user");

  for (const msg of userMessages) {
    const lowerMsg = msg.content.toLowerCase();
    const hasKeyword = keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
    if (!hasKeyword) continue;

    const dayMatch = msg.content.match(/(\d{1,2})\s+dias?/i);
    if (dayMatch) {
      const days = parseInt(dayMatch[1], 10);
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date;
    }

    const dateMatch = msg.content.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10) - 1;
      const year = parseInt(dateMatch[3], 10);
      return new Date(year > 100 ? year : 2000 + year, month, day);
    }
  }

  return null;
}
