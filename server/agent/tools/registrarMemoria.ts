/**
 * registrar_memoria — a Excambia grava aprendizados persistentes sobre o
 * usuário/empresa (preferências, regras de negócio, fatos recorrentes) na
 * tabela excambia_learning_context. Esses itens voltam injetados no system
 * prompt das próximas conversas — é a camada de "memória" da Excambia.
 *
 * Não é fine-tuning: é contexto persistido + reinjetado (barato e auditável).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { saveLearningContext } from "../../db";

const CONTEXT_TYPES = [
  "preference", "business_rule", "supplier_info", "product_insight",
  "market_trend", "calculation_pattern", "feedback",
] as const;

export const registrarMemoriaTool: AgentTool = {
  name: "registrar_memoria",
  schema: defineSchema(
    "registrar_memoria",
    "Memoriza um aprendizado DURÁVEL sobre o usuário/empresa para usar nas próximas " +
      "conversas: preferências (ex.: 'sempre importa por SC'), regras de negócio, " +
      "informações de fornecedores, padrões de cálculo (margem usual, regime), ou " +
      "feedback. Use quando a pessoa revelar algo estável e reaproveitável — NÃO para " +
      "fatos efêmeros de uma única cotação. Registre de forma concisa.",
    {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: CONTEXT_TYPES,
          description:
            "preference | business_rule | supplier_info | product_insight | " +
            "market_trend | calculation_pattern | feedback",
        },
        chave: { type: "string", description: "Rótulo curto do aprendizado (ex: 'estado_importacao_padrao')" },
        valor: { type: "string", description: "Conteúdo do aprendizado (ex: 'Importa sempre por Santa Catarina (TTD 409)')" },
        importancia: {
          type: "number",
          description: "0–100: o quão relevante isto é para decisões futuras (padrão 60)",
        },
      },
      required: ["tipo", "chave", "valor"],
    },
  ),
  async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const tipo = String(args.tipo ?? "");
    const chave = String(args.chave ?? "").trim();
    const valor = String(args.valor ?? "").trim();
    if (!(CONTEXT_TYPES as readonly string[]).includes(tipo)) {
      return { ok: false, summary: "Tipo de memória inválido.", error: "tipo inválido" };
    }
    if (!chave || !valor) {
      return { ok: false, summary: "Memória precisa de chave e valor.", error: "campos vazios" };
    }
    const importancia = Math.max(0, Math.min(100, Number(args.importancia ?? 60) || 60));

    await saveLearningContext({
      userId: ctx.userId,
      contextType: tipo as any,
      key: chave,
      value: valor,
      importance: importancia,
      source: "excambia",
    });

    return {
      ok: true,
      summary: `Memorizado: ${chave}.`,
      data: { tipo, chave, valor, importancia },
    };
  },
};
