/**
 * TOOL: registrar_nacionalizacao
 *
 * Marca o produto como nacionalizado (último passo antes da entrega).
 * Consolida câmbio, impostos, DI e prepara para entrega.
 * Wraps registrarMarco com tipo=nacionalizado.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as operacaoService from "../../services/operacaoService";

const schema = defineSchema(
  "registrar_nacionalizacao",
  "Registra que o produto foi nacionalizado (último passo antes da entrega). " +
  "Consolida todo o processo de importação e prepara para entrega final.",
  {
    type: "object",
    properties: {
      descricao: {
        type: "string",
        description: "Descrição da nacionalização (ex: 'Processo finalizado, pronto para entrega ao cliente')",
      },
      dataReferencia: {
        type: "string",
        description: "Data da nacionalização (ISO format). Se omitida, usa agora.",
      },
    },
    required: [],
  },
);

export const registrarNacionalizacaoTool: AgentTool = {
  name: "registrar_nacionalizacao",
  schema,
  estagios: ["finance"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.operacaoId) {
      return { ok: false, summary: "Esta ferramenta requer uma operação ativa.", error: "sem_operacao" };
    }

    const descricao = typeof args.descricao === "string"
      ? args.descricao
      : "Produto nacionalizado — pronto para entrega";

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
        tipo: "nacionalizado",
        status: "realizado",
        descricao,
        dataReferencia,
        autor: "excambia",
      });

      if (!marco) {
        return { ok: false, summary: "Falha ao registrar nacionalização.", error: "registro_falhado" };
      }

      return {
        ok: true,
        summary: "Produto nacionalizado com sucesso. Próximo passo: entrega ao cliente.",
        data: marco,
      };
    } catch (e: any) {
      return {
        ok: false,
        summary: "Erro ao registrar nacionalização.",
        error: String(e?.message ?? e),
      };
    }
  },
};
