import * as db from "../../db";
import { analyzeOperacaoGaps, generateGapPrompt } from "../../services/gapAnalyzerService";
import type { AgentTool, ToolResult, ToolContext } from "./types";
import { defineSchema } from "./types";

export const coletarDadosFaltantesTool: AgentTool = {
  name: "coletar_dados_faltantes",
  schema: defineSchema(
    "coletar_dados_faltantes",
    "Identifica dados faltantes ou incertos em uma operação (NCM, quantidade, prazo, etc) e retorna um prompt para coletar do usuário de forma conversacional",
    {
      type: "object",
      properties: {
        operacaoId: {
          type: "number",
          description: "ID da operação a analisar",
        },
      },
      required: ["operacaoId"],
    }
  ),
  estagios: ["demand", "source", "analyze"],
  async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const operacaoId = args.operacaoId as number | undefined;
    if (!operacaoId || !ctx.operacaoId) {
      return {
        ok: false,
        summary: "operacaoId é obrigatório",
        error: "missing_field",
      };
    }

    try {
      const gaps = await analyzeOperacaoGaps(ctx.userId, ctx.operacaoId);

      if (gaps.length === 0) {
        return {
          ok: true,
          summary: "Seus dados parecem completos! Pronto para avançar na esteira. 🎯",
          data: {
            complete: true,
            gaps: [],
          },
        };
      }

      const prompt = generateGapPrompt(gaps);

      return {
        ok: true,
        summary: `Identifiquei ${gaps.length} ${gaps.length === 1 ? "gap" : "gaps"} nos dados. Vou perguntar um a um para completar:`,
        data: {
          complete: false,
          gaps: gaps.map((g) => ({
            field: g.field,
            isMissing: g.isMissing,
            isUncertain: g.isUncertain,
            suggestion: g.suggestion,
            confidence: g.confidence,
          })),
          prompt,
        },
      };
    } catch (error) {
      return {
        ok: false,
        summary: "Erro ao analisar gaps",
        error: String(error),
      };
    }
  },
};
