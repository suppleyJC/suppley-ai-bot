import * as operacaoService from "./operacaoService";

export interface ChatMsg {
  author: "user" | "excambia" | "assistant" | string;
  content: string;
}

export interface EnrichmentResult {
  updated: Record<string, any>;
  enrichedAt: Date;
}

export async function enrichOperacaoFromChat(
  userId: number,
  operacaoId: number,
  chatMessages: ChatMsg[]
): Promise<EnrichmentResult> {
  const result = await operacaoService.getOperacao(userId, operacaoId);
  if (!result) throw new Error("Operação não encontrada");

  const op = result.operacao;
  const updated: Record<string, any> = {};
  const enrichedAt = new Date();

  // Cliente
  const clienteResp = extractFromMessages(chatMessages, ["cliente", "comprador", "vender para"]);
  if (clienteResp && !op.clienteNome) {
    await operacaoService.updateOperacao({ userId, operacaoId, clienteNome: clienteResp });
    updated.cliente = clienteResp;
  }

  // Origem
  const origemResp = extractFromMessages(chatMessages, ["país", "origem", "importar de"]);
  if (origemResp && !op.origemPais && !op.origemDesejada) {
    await operacaoService.updateOperacao({ userId, operacaoId, origemDesejada: origemResp });
    updated.origem = origemResp;
  }

  // Prazo
  const prazoResp = extractDateFromMessages(chatMessages, ["prazo", "entrega", "dia"]);
  if (prazoResp && !op.prazoDesejado) {
    await operacaoService.updateOperacao({ userId, operacaoId, prazoDesejado: prazoResp });
    updated.prazo = prazoResp;
  }

  // Regime tributário
  const regimeResp = extractRegimeFromMessages(chatMessages);
  if (regimeResp && !op.regimeTributario) {
    await operacaoService.updateOperacao({ userId, operacaoId, regimeTributario: regimeResp });
    updated.regime = regimeResp;
  }

  // Registra enriquecimento como evento (nota interna na timeline)
  if (Object.keys(updated).length > 0) {
    await operacaoService.addEvento({
      operacaoId,
      tipo: "nota_interna",
      estagio: op.estagioAtual,
      autor: "excambia",
      titulo: `Dados enriquecidos via chat: ${Object.keys(updated).join(", ")}`,
      payload: updated,
    });
  }

  return { updated, enrichedAt };
}

function extractFromMessages(messages: ChatMsg[], keywords: string[]): string | null {
  const userMessages = messages.filter((m) => m.author === "user");
  const combined = userMessages.map((m) => m.content.toLowerCase()).join(" ");

  const hasKeyword = keywords.some((kw) => combined.includes(kw.toLowerCase()));
  if (!hasKeyword) return null;

  const lastUserMsg = userMessages[userMessages.length - 1];
  if (!lastUserMsg) return null;

  return lastUserMsg.content.split(/\s+/).slice(0, 10).join(" ");
}

function extractDateFromMessages(messages: ChatMsg[], keywords: string[]): Date | null {
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

function extractRegimeFromMessages(
  messages: ChatMsg[]
): "lucro_real" | "lucro_presumido" | "simples_nacional" | null {
  const userMessages = messages.filter((m) => m.author === "user");
  const combined = userMessages.map((m) => m.content.toLowerCase()).join(" ");

  if (combined.includes("lucro real")) return "lucro_real";
  if (combined.includes("presumido")) return "lucro_presumido";
  if (combined.includes("simples")) return "simples_nacional";

  return null;
}
