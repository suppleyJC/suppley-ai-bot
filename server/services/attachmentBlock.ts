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
import { storageGet } from "../storage";

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
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * Anexos do chat só podem ser lidos pela chave permanente criada pelo backend
 * para o próprio usuário. A URL enviada pelo cliente é apenas informativa e
 * NUNCA é usada em fetch, evitando SSRF e acesso cruzado a objetos do bucket.
 */
function validateAttachmentKey(fileKey: string | undefined, userId: number): string {
  const key = normalizeStorageKey(fileKey);
  const expectedPrefix = `quotations/${userId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new Error("Attachment fileKey inválida para este usuário");
  }

  return key;
}

function normalizeStorageKey(fileKey: string | undefined): string {
  if (!fileKey) throw new Error("Attachment fileKey ausente");

  let key = fileKey;
  while (key.startsWith("/")) key = key.slice(1);

  if (!key || key.includes("..") || key.includes("\\")) {
    throw new Error("Attachment fileKey inválida");
  }
  return key;
}

async function fetchStoredAttachmentByKey(fileKey: string): Promise<Response> {
  const key = normalizeStorageKey(fileKey);
  const { url } = await storageGet(key);

  // URL é gerada pelo servidor via AWS SDK. Redirecionamentos são recusados
  // para impedir que uma resposta 3xx transforme o download em novo vetor SSRF.
  const resp = await fetch(url, { redirect: "error" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const declaredSize = Number(resp.headers.get("content-length") || "0");
  if (declaredSize > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment excede o limite de leitura");
  }

  return resp;
}

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

async function buildAttachmentBlockFromStorageKey(att: AttachmentRef, fileKey: string): Promise<MessageContent | null> {
  try {
    const resp = await fetchStoredAttachmentByKey(fileKey);
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error("Attachment excede o limite de leitura");
    }

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
 * Caminho para anexos recebidos do cliente: exige chave no namespace do usuário.
 */
export async function buildAttachmentBlock(att: AttachmentRef, userId: number): Promise<MessageContent | null> {
  try {
    const key = validateAttachmentKey(att.fileKey, userId);
    return await buildAttachmentBlockFromStorageKey(att, key);
  } catch (err) {
    console.error("[attachmentBlock] anexo rejeitado:", err);
    return null;
  }
}

/**
 * Caminho interno para chaves vindas do banco após checagem de posse.
 * Não aceita URL externa; a chave é sempre re-assinada pelo backend.
 */
export async function buildStoredAttachmentBlock(
  att: Omit<AttachmentRef, "url"> & { fileKey: string },
): Promise<MessageContent | null> {
  return buildAttachmentBlockFromStorageKey({ ...att, url: "" }, normalizeStorageKey(att.fileKey));
}

/**
 * Injeta o anexo na ÚLTIMA mensagem do usuário, transformando-a em conteúdo
 * multimodal (texto + arquivo). Retorna a lista de mensagens pronta para o agente.
 */
export async function applyAttachmentToMessages<T extends { role: string; content: any }>(
  messages: T[],
  attachment: AttachmentRef | undefined,
  userId: number,
): Promise<T[]> {
  if (!attachment || messages.length === 0) return messages;
  const block = await buildAttachmentBlock(attachment, userId);
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
