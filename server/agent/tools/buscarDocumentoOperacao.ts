/**
 * TOOL: buscar_documento_operacao (LEITURA)
 *
 * O campo de anexos da operação é o REPOSITÓRIO de toda a documentação (proforma,
 * invoice, packing list, BL/AWB, DI, contrato, etc.). Esta ferramenta acha um
 * documento por nome/tipo e devolve um LINK de download fresco (re-assinado a
 * partir do fileKey no S3) para a Excambia entregar direto no chat.
 *
 * Fecha o pedido "me traz a invoice dessa operação" → a Excambia busca e devolve
 * o arquivo (link) na conversa.
 *
 * Read-only: não grava nada. O fileUrl salvo no banco expira em ~1h, então o
 * link entregue aponta para a rota de arquivo da aplicação, que re-assina o S3
 * a cada clique — a mensagem fica no histórico para sempre e o link precisa
 * sobreviver a ela.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as operacaoService from "../../services/operacaoService";
import { linkEstavelDeArquivo } from "../../routes/arquivoRoute";
import { normalizeForSearch } from "../../services/productSimilarity";

const schema = defineSchema(
  "buscar_documento_operacao",
  "Busca um DOCUMENTO/anexo de uma operação (proforma, invoice, packing list, " +
  "BL/AWB, DI, contrato, etc.) e devolve um LINK de download para entregar no chat. " +
  "Use quando pedirem 'me traz a invoice/o BL/a proforma dessa operação', 'quero o " +
  "arquivo X', 'baixar o documento Y'. Sem operationId, usa a operação do contexto.",
  {
    type: "object",
    properties: {
      operationId: { type: "number", description: "ID da operação (opcional; usa o contexto se ausente)" },
      termo: {
        type: "string",
        description:
          "O que a pessoa quer, pelo NOME do documento: 'invoice', 'packing list', " +
          "'BL', 'proforma', 'DI', ou parte do nome do arquivo. Deixe vazio para listar todos.",
      },
      tipo: {
        type: "string",
        enum: ["desenho", "pdf", "imagem", "especificacao", "catalogo", "cotacao", "outro"],
        description: "Filtro opcional pelo tipo do anexo.",
      },
    },
  },
);

/** Casa o termo contra nome+descrição do anexo por tokens normalizados. */
function casa(anexo: any, termoNorm: string): boolean {
  if (!termoNorm) return true;
  const alvo = normalizeForSearch(`${anexo.nome ?? ""} ${anexo.descricao ?? ""}`);
  const tokens = termoNorm.split(" ").filter(Boolean);
  return tokens.some((t) => alvo.includes(t));
}

export const buscarDocumentoOperacaoTool: AgentTool = {
  name: "buscar_documento_operacao",
  schema,
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const opId = typeof args.operationId === "number" ? args.operationId : ctx.operacaoId;
    if (!opId) {
      return {
        ok: false,
        summary:
          "Preciso saber de qual operação é o documento. Confirme a operação (código ou nome) " +
          "e eu busco o arquivo.",
        error: "sem_operacao",
      };
    }

    const anexos = await operacaoService.listarAnexos(ctx.userId, opId);
    if (!anexos.length) {
      return {
        ok: true,
        summary: `A operação ${opId} ainda não tem nenhum documento anexado no repositório.`,
        data: { documentos: [] },
      };
    }

    const termoNorm = typeof args.termo === "string" ? normalizeForSearch(args.termo) : "";
    const tipoArg = typeof args.tipo === "string" ? args.tipo : undefined;
    let candidatos = anexos.filter(
      (a: any) => (!tipoArg || a.tipo === tipoArg) && casa(a, termoNorm),
    );

    // Se o termo não casou com nada, cai para a lista completa (pessoa escolhe).
    const semMatch = candidatos.length === 0;
    if (semMatch) candidatos = anexos as any[];

    // Link ESTÁVEL da aplicação a partir do fileKey: a mensagem fica no
    // histórico para sempre, então um link que expira vira XML de AccessDenied
    // dias depois. A rota re-assina o S3 a cada clique. Só cai na URL
    // pré-assinada em registro legado, sem fileKey.
    const documentos = await Promise.all(
      candidatos.slice(0, 8).map(async (a: any) => {
        let url: string | null = null;
        try {
          url = a.fileKey
            ? await linkEstavelDeArquivo({ k: a.fileKey, n: a.nome, u: ctx.userId })
            : (a.fileUrl ?? null);
        } catch {
          url = a.fileUrl ?? null; // fallback best-effort
        }
        return { id: a.id, nome: a.nome, tipo: a.tipo, contentType: a.contentType ?? null, url };
      }),
    );

    const linhas = documentos
      .map((d) => (d.url ? `• [${d.nome}](${d.url})${d.tipo ? ` (${d.tipo})` : ""}` : `• ${d.nome} (link indisponível)`))
      .join("\n");

    if (semMatch) {
      return {
        ok: true,
        summary:
          `Não achei um documento que casasse com "${typeof args.termo === "string" ? args.termo : ""}" ` +
          `na operação ${opId}. Documentos disponíveis:\n${linhas}\n` +
          `Entregue a lista com os links e pergunte qual a pessoa quer.`,
        data: { documentos, match: false },
      };
    }

    return {
      ok: true,
      summary:
        (documentos.length === 1
          ? `Documento encontrado na operação ${opId}:\n${linhas}\n`
          : `Documentos encontrados na operação ${opId}:\n${linhas}\n`) +
        `Entregue o(s) link(s) de download direto no chat.`,
      data: { documentos, match: true },
    };
  },
};
