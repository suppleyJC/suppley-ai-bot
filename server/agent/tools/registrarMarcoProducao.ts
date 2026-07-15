/**
 * TOOL: registrar_marco_producao
 *
 * Registra marcos da JORNADA COMPLETA da operação — do estudo do item à
 * entrega: item pesquisado, fornecedores identificados, RFQ enviada, cotação
 * recebida, fornecedor selecionado, cálculo feito, GO aprovado, pedido
 * confirmado, produção iniciada, embarque, DI registrada, nacionalizado,
 * entregue. Consome operacaoService.registrarMarco (o MESMO serviço do
 * painel — coesão Painel ↔ Excambia garantida pela timeline única).
 *
 * CONVERGÊNCIA: um marco "realizado" de estágio à frente avança a operação
 * automaticamente (o card muda de coluna no painel na hora).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as operacaoService from "../../services/operacaoService";
import { MARCO_LABEL_PT, STAGE_LABEL_PT, MARCO_ORDER } from "../../services/operacaoService";

// Fonte única: todos os marcos da jornada (fases 1–9), na ordem canônica.
const TIPOS: operacaoService.TipoMarco[] = MARCO_ORDER;

const schema = defineSchema(
  "registrar_marco_producao",
  "Registra um marco da JORNADA da operação (estudo do item → cotação/RFQ → viabilidade → " +
  "produção/embarque → nacionalização/entrega). O marco aparece na jornada e na timeline do " +
  "painel na hora; se pertencer a um estágio à frente, a operação AVANÇA de coluna " +
  "automaticamente. Use sempre que a pessoa relatar um avanço concreto (ex.: 'o pedido foi " +
  "confirmado', 'embarcou hoje', 'a DI saiu', 'chegou/entregue').",
  {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: TIPOS,
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
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.operacaoId) {
      return { ok: false, summary: "Esta ferramenta requer uma operação ativa.", error: "sem_operacao" };
    }

    const tipo = args.tipo as operacaoService.TipoMarco;
    if (!tipo || !TIPOS.includes(tipo)) {
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

      const avancou = (marco as { estagioSincronizado?: string | null }).estagioSincronizado;
      return {
        ok: true,
        summary:
          `Marco "${MARCO_LABEL_PT[tipo] ?? tipo}" registrado na jornada da operação.` +
          (avancou
            ? ` A operação avançou para "${STAGE_LABEL_PT[avancou as operacaoService.Estagio] ?? avancou}" no painel.`
            : ""),
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
