/**
 * attachmentBlock — converte um anexo (PDF/imagem/planilha) já no storage em um
 * bloco de conteúdo multimodal que o Claude consegue ler.
 *
 * Compartilhado entre o caminho síncrono (conversasRouter.send) e o de streaming
 * (chatStreamRoute) para que AMBOS encaminhem o arquivo ao agente da mesma forma.
 *  - PDF        → bloco `document` (base64)
 *  - imagem     → bloco `image` (base64)
 *  - planilha   → parseada para texto/Markdown (o Claude não lê o binário)
 * Best-effort: erro vira null (segue só com o texto).
 */
import type { MessageContent } from "../_core/llm";
import { isSpreadsheet, spreadsheetBufferToText } from "./spreadsheetToText";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

export interface AttachmentRef {
  url: string;
  mimeType: string;
  name: string;
}

export async function buildAttachmentBlock(att: AttachmentRef): Promise<MessageContent | null> {
  try {
    const resp = await fetch(att.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());

    // Planilhas: converte para texto/Markdown antes de enviar ao LLM.
    if (isSpreadsheet(att.mimeType, att.name)) {
      const tabela = await spreadsheetBufferToText(buffer, { name: att.name, mimeType: att.mimeType });
      return { type: "text", text: `Conteúdo da planilha anexada (${att.name}):\n\n${tabela}` };
    }

    const data = buffer.toString("base64");
    if (att.mimeType === "application/pdf") {
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    }
    const media = (IMAGE_TYPES as readonly string[]).includes(att.mimeType)
      ? (att.mimeType as (typeof IMAGE_TYPES)[number])
      : "image/jpeg";
    return { type: "image", source: { type: "base64", media_type: media, data } };
  } catch (err) {
    console.error("[attachmentBlock] falha ao ler anexo:", err);
    return null;
  }
}

/**
 * Injeta o anexo na ÚLTIMA mensagem do usuário, transformando-a em conteúdo
 * multimodal (texto + arquivo). Retorna a lista de mensagens pronta para o agente.
 */
export async function applyAttachmentToMessages<T extends { role: string; content: any }>(
  messages: T[],
  attachment: AttachmentRef | undefined,
): Promise<T[]> {
  if (!attachment || messages.length === 0) return messages;
  const block = await buildAttachmentBlock(attachment);
  if (!block) return messages;
  const out = [...messages];
  const lastIdx = out.length - 1;
  const lastText = (typeof out[lastIdx].content === "string" ? out[lastIdx].content : "") || "";
  const text = lastText.trim() || "Segue o arquivo em anexo. Leia o documento e conduza conforme a operação.";
  out[lastIdx] = { ...out[lastIdx], content: [{ type: "text", text }, block] } as T;
  return out;
}

/** Marcador textual (sem emoji) usado ao persistir uma mensagem com anexo. */
export function attachmentMarker(name: string, text?: string): string {
  return text ? `Anexo: ${name}\n\n${text}` : `Anexo: ${name}`;
}
