/**
 * TOOL: registrar_marco_producao
 *
 * Registra marcos do processo produtivo: pedido confirmado, produção iniciada,
 * embarque do produto, DI registrada, nacionalizado, entregue.
 * Consumes operacaoService.registrarMarco (serviço compartilhado).
 * Cada marco gera um evento na timeline (coesão Painel ↔ Excambia).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as operacaoService from "../../services/operacaoService";

const schema = defineSchema(
  "registrar_marco_producao",
  "Registra um marco importante no processo produtivo (pedido confirmado, produção iniciada, " +
  "embarque, DI registrada, nacionalizado, entregue). Cada marco aparece na timeline da operação.",
  {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["pedido_confirmado", "producao_iniciada", "produto_embarcado", "di_registrada", "nacionalizado", "entregue"],
        description: "Qual marco está sendo registrado",
      },
      descricao: { type: "string", description: "Descrição opcional do marco (ex: 'Pedido #12345 da Acme Inc.')" },
      dataReferencia: {
        type: "string",
        description: "Data de referência (ISO format: YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss). Se omitida, usa agora.",
      },
      status: {
        type: "string",
        enum: ["planejado", "realizado", "cancelado"],
        description: "Status do marco (default: realizado)",
      },
    },
    required: ["tipo"],
  },
);

export const registrarMarcoProducaoTool: AgentTool = {
  name: "registrar_marco_producao",
  schema,
  estagios: ["execute", "finance"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.operacaoId) {
      return { ok: false, summary: "Esta ferramenta requer uma operação ativa.", error: "sem_operacao" };
    }

    const tipo = args.tipo as operacaoService.TipoMarco;
    if (!tipo) {
      return { ok: false, summary: "Tipo de marco é obrigatório.", error: "tipo_requerido" };
    }

    const descricao = typeof args.descricao === "string" ? args.descricao : undefined;
    const status = (args.status ?? "realizado") as operacaoService.StatusMarco;

    // Parse data se fornecida
    let dataReferencia: Date | undefined;
    if (typeof args.dataReferencia === "string") {
      const d = new Date(args.dataReferencia);
      if (!isNaN(d.getTime())) {
        dataReferencia = d;
      }
    }

    try {
      const marco = await operacaoService.registrarMarco({
        userId: ctx.userId,
        operacaoId: ctx.operacaoId,
        tipo,
        status,
        descricao,
        dataReferencia,
        autor: "excambia",
      });

      if (!marco) {
        return { ok: false, summary: "Falha ao registrar o marco.", error: "registro_falhado" };
      }

      const tipoLabel = tipo.replace(/_/g, " ");
      return {
        ok: true,
        summary: `Marco "${tipoLabel}" registrado com sucesso na timeline da operação.`,
        data: marco,
      };
    } catch (e: any) {
      return {
        ok: false,
        summary: "Erro ao registrar o marco.",
        error: String(e?.message ?? e),
      };
    }
  },
};
