/**
 * attachmentBlock — converte um anexo já no storage em um bloco de conteúdo
 * multimodal que o Claude consegue ler.
 *
 * Compartilhado entre o caminho síncrono (conversasRouter.send) e o de streaming
 * (chatStreamRoute) para que AMBOS encaminhem o arquivo ao agente da mesma forma.
 *  - PDF          → texto extraído (ou `document` base64 p/ PDF escaneado)
 *  - imagem       → bloco `image` (base64)
 *  - planilha     → parseada para texto/Markdown (o Claude não lê o binário)
 *  - .docx        → texto extraído (mammoth)
 *  - texto/código → conteúdo bruto (.txt, .md, .json, .py, .xml, .ts, .js…)
 * Best-effort: erro vira null (segue só com o texto).
 */
import type { MessageContent } from "../_core/llm";
import { isSpreadsheet, spreadsheetBufferToText } from "./spreadsheetToText";
import { pdfBufferToText } from "./pdfToText";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Extensões tratadas como TEXTO PURO (código e dados incluídos).
const TEXT_EXTS = [
  ".txt", ".md", ".json", ".py", ".xml", ".yaml", ".yml",
  ".ts", ".js", ".sql", ".html", ".css", ".log",
];
const TEXT_MIMES = ["text/plain", "text/markdown", "application/json", "text/x-python", "application/x-python", "text/xml", "application/xml"];

// Protege o contexto do agente contra arquivos de texto gigantes (o limite de
// upload é 16MB — um .txt desse tamanho estouraria a janela do modelo).
const MAX_TEXT_CHARS = 120_000;

function isPlainTextFile(mimeType: string, name: string): boolean {
  const n = (name || "").toLowerCase();
  if (TEXT_EXTS.some((ext) => n.endsWith(ext))) return true;
  return TEXT_MIMES.includes(mimeType);
}

function truncateForContext(text: string, name: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return (
    text.slice(0, MAX_TEXT_CHARS) +
    `\n\n[…arquivo "${name}" truncado: ${text.length.toLocaleString("pt-BR")} caracteres no total; exibidos os primeiros ${MAX_TEXT_CHARS.toLocaleString("pt-BR")}]`
  );
}

export interface AttachmentRef {
  url: string;
  mimeType: string;
  name: string;
  /**
   * Chave PERMANENTE no storage (S3). A `url` pré-assinada expira em ~1h; com a
   * chave o agente vincula o arquivo aos registros que criar (proforma etc.) e
   * qualquer leitura futura re-assina a URL na hora.
   */
  fileKey?: string;
}

export async function buildAttachmentBlock(att: AttachmentRef): Promise<MessageContent | null> {
  try {
    const resp = await fetch(att.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());

    // Planilhas: converte para texto/Markdown antes de enviar ao LLM.
    // O truncamento é o MESMO dos demais formatos: o limite por aba
    // (1500 linhas) não impede uma pasta com muitas abas de estourar a janela
    // do modelo — e estouro de contexto derruba a requisição inteira.
    if (isSpreadsheet(att.mimeType, att.name)) {
      const tabela = await spreadsheetBufferToText(buffer, { name: att.name, mimeType: att.mimeType });
      return {
        type: "text",
        text: `Conteúdo da planilha anexada (${att.name}):\n\n${truncateForContext(tabela, att.name)}`,
      };
    }

    // Word (.docx): extrai o texto com mammoth.
    if (att.mimeType === DOCX_MIME || att.name.toLowerCase().endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return {
        type: "text",
        text: `Conteúdo do documento Word anexado (${att.name}):\n\n${truncateForContext(value ?? "", att.name)}`,
      };
    }

    // Texto/código/dados (.txt, .md, .json, .py, .xml…): conteúdo bruto.
    if (isPlainTextFile(att.mimeType, att.name)) {
      const texto = buffer.toString("utf-8");
      return {
        type: "text",
        text: `Conteúdo do arquivo anexado (${att.name}):\n\n${truncateForContext(texto, att.name)}`,
      };
    }

    // PDF: extrai TEXTO PURO (economiza tokens e elimina peso visual/imagens/
    // metadados). PDF escaneado (sem camada de texto) cai no base64 abaixo.
    if (att.mimeType === "application/pdf") {
      const extraido = await pdfBufferToText(buffer);
      if (extraido.ok) {
        return {
          type: "text",
          text: `Conteúdo do PDF anexado (${att.name}${extraido.pageCount ? `, ${extraido.pageCount} pág.` : ""}):\n\n${extraido.text}`,
        };
      }
      // Sem texto extraível (provável PDF-imagem): mantém leitura nativa.
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } };
    }

    const data = buffer.toString("base64");
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
