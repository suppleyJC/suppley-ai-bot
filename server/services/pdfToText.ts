/**
 * pdfToText — extrai TEXTO PURO de um PDF digital para enviar ao LLM no lugar
 * do binário base64.
 *
 * POR QUÊ: mandar o PDF como bloco `document` (base64) faz o modelo "renderizar"
 * cada página — fontes, imagens, layout, metadados viram tokens. Um PDF de texto
 * (proforma, invoice, cotação, contrato digital) tem toda a informação útil no
 * texto; extrair só o texto corta 70–95% dos tokens daquele anexo, sem perda de
 * conteúdo relevante (produtos, NCM, quantidades, valores).
 *
 * FALLBACK CRÍTICO: PDF escaneado/fotografado NÃO tem camada de texto — a
 * extração volta vazia. Nesses casos `ok:false` e o chamador deve manter o
 * envio como imagem/documento (base64), senão o modelo receberia lixo.
 *
 * Espelha o padrão de spreadsheetToText.ts (buffer → texto para o LLM).
 */
import { PDFParse } from "pdf-parse";

/** Limite de páginas processadas — proteção contra PDFs gigantes no contexto. */
const MAX_PAGES = 60;
/**
 * Mínimo de caracteres (após limpeza) para considerar a extração aproveitável.
 * Abaixo disso tratamos como PDF-imagem e caímos para o modo base64.
 */
const MIN_USEFUL_CHARS = 40;

/** Faixa de caracteres de controle a remover (mantém \t = 09 e \n = 0A). */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");

export interface PdfTextResult {
  /** true quando extraímos texto suficiente para usar no lugar do base64. */
  ok: boolean;
  /** Texto limpo e normalizado (vazio quando !ok). */
  text: string;
  /** Nº de páginas do documento (0 se falhou ao abrir). */
  pageCount: number;
}

/**
 * Normaliza o texto extraído: colapsa espaços, remove linhas em branco
 * excessivas e caracteres de controle — o "peso visual" que não agrega ao LLM.
 */
function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/[ \t]+\n/g, "\n")   // espaços no fim de linha
    .replace(/[ \t]{2,}/g, " ")   // espaços repetidos
    .replace(/\n{3,}/g, "\n\n")   // no máx. 1 linha em branco
    .trim();
}

/**
 * Extrai texto de um buffer de PDF. Best-effort: qualquer erro vira `ok:false`
 * (o chamador segue com o base64). Nunca lança.
 */
export async function pdfBufferToText(buffer: Buffer): Promise<PdfTextResult> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText({ last: MAX_PAGES });
    const text = cleanText(result.text || "");
    const pageCount = result.total || result.pages?.length || 0;
    // Heurística de PDF-imagem: pouquíssimo texto (ou nenhum) por página.
    const ok = text.length >= MIN_USEFUL_CHARS;
    return { ok, text: ok ? text : "", pageCount };
  } catch (err) {
    console.error("[pdfToText] falha ao extrair texto do PDF:", err);
    return { ok: false, text: "", pageCount: 0 };
  } finally {
    try { await parser?.destroy(); } catch { /* ignore */ }
  }
}

/** Extrai texto direto de um base64 de PDF (sem prefixo data:). */
export async function pdfBase64ToText(base64: string): Promise<PdfTextResult> {
  try {
    return await pdfBufferToText(Buffer.from(base64, "base64"));
  } catch (err) {
    console.error("[pdfToText] base64 inválido:", err);
    return { ok: false, text: "", pageCount: 0 };
  }
}
