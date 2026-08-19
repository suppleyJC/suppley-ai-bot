/**
 * TOOL: reler_documento — RE-HIDRATA no contexto o CONTEÚDO de um arquivo já
 * guardado no storage (proforma catalogada ou anexo de operação).
 *
 * POR QUÊ: o texto de um anexo só existe no turno em que foi enviado; nos
 * turnos seguintes o modelo não o tem mais — e a URL pré-assinada da conversa
 * expira em ~1h. Com esta tool, a Excambia re-assina a URL a partir do fileKey
 * permanente, baixa o arquivo e RE-EXTRAI o texto (PDF/planilha/docx/texto),
 * devolvendo-o como resultado — o documento volta ao contexto em qualquer
 * turno futuro, sem pedir para a pessoa reenviar nada.
 *
 * Limite: PDF escaneado (sem camada de texto) não tem o que extrair — nesse
 * caso a tool avisa e sugere reenviar o arquivo no chat (leitura nativa).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { getProformasByUser, getProformaById } from "../../db/proformaDb";
import * as operacaoService from "../../services/operacaoService";
import { storageGet } from "../../storage";
import { buildAttachmentBlock } from "../../services/attachmentBlock";
import { normalizeForSearch } from "../../services/productSimilarity";

const schema = defineSchema(
  "reler_documento",
  "RELÊ o CONTEÚDO de um arquivo já guardado (proforma catalogada ou anexo de operação) e " +
  "o traz de volta para o contexto — texto extraído de PDF, planilha, Word ou texto puro. " +
  "Use quando precisar CONSULTAR de novo um documento enviado em conversa anterior (ex.: " +
  "'confira na proforma Q054', 'quais os itens do PDF que te mandei') em vez de pedir que a " +
  "pessoa reenvie. Identifique o documento pelo número da proforma (ex.: 'PF-2026-0011'), " +
  "pelo nome do arquivo, ou pelo anexo de uma operação. Para itens/preços estruturados de " +
  "proforma catalogada, prefira ler_itens_proforma (mais preciso).",
  {
    type: "object",
    properties: {
      numeroProforma: { type: "string", description: "Número da proforma cujo arquivo original deve ser relido (ex.: 'PF-2026-0011')" },
      proformaId: { type: "number", description: "ID da proforma (alternativa ao número)" },
      nomeArquivo: { type: "string", description: "Parte do nome do arquivo (procura em proformas e nos anexos da operação do contexto)" },
      operationId: { type: "number", description: "ID da operação onde procurar o anexo (opcional; usa o contexto se ausente)" },
    },
  },
);

/** Teto de caracteres devolvidos ao modelo — protege a janela de contexto. */
const MAX_CHARS = 60_000;

interface ArquivoAchado {
  fileKey: string;
  nome: string;
  mimeType: string;
  origem: string;
}

function mimeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".csv")) return "text/csv";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

export const relerDocumentoTool: AgentTool = {
  name: "reler_documento",
  schema,
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const numero = typeof args.numeroProforma === "string" ? args.numeroProforma.trim().toUpperCase() : "";
    const proformaId = typeof args.proformaId === "number" ? args.proformaId : undefined;
    const nomeArquivo = typeof args.nomeArquivo === "string" ? normalizeForSearch(args.nomeArquivo) : "";
    const opId = typeof args.operationId === "number" ? args.operationId : ctx.operacaoId;

    // 1) Localiza o arquivo: proforma (por id/número/nome) → anexos da operação
    let achado: ArquivoAchado | null = null;

    if (proformaId != null) {
      const p = await getProformaById(proformaId, ctx.userId);
      if (p?.fileKey) achado = { fileKey: p.fileKey, nome: p.fileName ?? `proforma-${p.numero}`, mimeType: mimeFromName(p.fileName ?? ".pdf"), origem: `proforma ${p.numero ?? p.id}` };
    }
    if (!achado && (numero || nomeArquivo)) {
      const todas = await getProformasByUser(ctx.userId);
      const p = todas.find((x) =>
        (numero && x.numero?.toUpperCase() === numero) ||
        (nomeArquivo && x.fileName && normalizeForSearch(x.fileName).includes(nomeArquivo)),
      );
      if (p?.fileKey) achado = { fileKey: p.fileKey, nome: p.fileName ?? `proforma-${p.numero}`, mimeType: mimeFromName(p.fileName ?? ".pdf"), origem: `proforma ${p.numero ?? p.id}` };
    }
    if (!achado && opId) {
      try {
        const anexos = await operacaoService.listarAnexos(ctx.userId, opId);
        const a = (anexos as any[]).find(
          (x) => x.fileKey && (!nomeArquivo || normalizeForSearch(`${x.nome ?? ""}`).includes(nomeArquivo)),
        );
        if (a) achado = { fileKey: a.fileKey, nome: a.nome, mimeType: a.contentType || mimeFromName(a.nome ?? ""), origem: `operação ${opId}` };
      } catch { /* segue para o erro padrão */ }
    }

    if (!achado) {
      return {
        ok: false,
        summary:
          "Não encontrei o arquivo no repositório — a proforma pode ter sido catalogada ANTES do " +
          "vínculo de arquivo existir (registros antigos não têm o documento guardado). " +
          "Use ler_itens_proforma para os dados estruturados que temos na base; se precisar do " +
          "documento em si, peça à pessoa para reenviar o arquivo no chat.",
        error: "arquivo_nao_encontrado",
      };
    }

    // 2) Re-assina a URL e re-extrai o conteúdo (mesmo pipeline do anexo do chat)
    let texto: string | null = null;
    try {
      const { url } = await storageGet(achado.fileKey, 3600);
      const block = await buildAttachmentBlock({ url, mimeType: achado.mimeType, name: achado.nome });
      if (block && (block as any).type === "text") {
        texto = String((block as any).text ?? "");
      } else if (block) {
        // PDF escaneado/imagem: conteúdo não-textual — não dá para re-hidratar como texto.
        return {
          ok: false,
          summary:
            `O arquivo "${achado.nome}" (${achado.origem}) é imagem/PDF escaneado — não há texto ` +
            `para extrair por aqui. Peça à pessoa para reenviar o arquivo no chat (a leitura ` +
            `nativa de imagem funciona no anexo do turno).`,
          error: "conteudo_nao_textual",
        };
      }
    } catch (err) {
      return {
        ok: false,
        summary: `Falha ao reler "${achado.nome}" do storage. Tente de novo; se persistir, peça o reenvio do arquivo.`,
        error: String((err as Error)?.message ?? err),
      };
    }

    if (!texto || !texto.trim()) {
      return {
        ok: false,
        summary: `O arquivo "${achado.nome}" foi localizado mas voltou vazio na extração. Peça o reenvio no chat.`,
        error: "extracao_vazia",
      };
    }

    const truncado = texto.length > MAX_CHARS;
    const corpo = truncado
      ? texto.slice(0, MAX_CHARS) + `\n\n[…conteúdo truncado: ${texto.length.toLocaleString("pt-BR")} caracteres no total]`
      : texto;

    return {
      ok: true,
      summary:
        `Conteúdo relido de "${achado.nome}" (${achado.origem})${truncado ? " — TRUNCADO" : ""}:\n\n` +
        corpo +
        `\n\nEste é o conteúdo REAL do documento — use exatamente estes dados; não complete lacunas com estimativas.`,
      data: { nome: achado.nome, origem: achado.origem, chars: texto.length, truncado },
    };
  },
};
