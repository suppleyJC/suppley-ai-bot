/**
 * RUNTIME DOS ESPECIALISTAS — o motor que roda o loop agêntico de um sub-agente.
 *
 * Reaproveita a MESMA máquina da Excambia (invokeLLM + tools-base + guardrails),
 * mas com um system prompt e um subconjunto de tools próprios de cada domínio.
 *
 * Importa de tools/registry (e NÃO de tools/index) para evitar import circular:
 *   tools/index → specialists → runtime → tools/registry  (sem ciclo)
 *
 * Um especialista executa apenas BASE_TOOLS: nunca chama outro especialista
 * (sem recursão), mantendo a hierarquia clara e o custo previsível.
 */
import { invokeLLM, MODELS, type Message } from "../../_core/llm";
import { BASE_TOOLS, schemasByName, runFrom } from "../tools/registry";
import { checkBudget } from "../guardrails";
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "../tools/types";
import type { SpecialistDef } from "./types";

export interface SpecialistRunResult {
  reply: string;
  toolsUsed: string[];
  toolResults: Array<{ name: string; ok: boolean; data?: unknown }>;
}

const DEFAULT_MAX_TURNS = 5;

/**
 * Roda o loop agêntico de um especialista com seu subconjunto de tools.
 * A `reply` final é o que volta para a Excambia consolidar.
 */
export async function runSpecialist(
  def: SpecialistDef,
  tarefa: string,
  contexto: string | undefined,
  ctx: ToolContext,
): Promise<SpecialistRunResult> {
  const toolSchemas = schemasByName(BASE_TOOLS, def.toolNames);
  const toolsUsed: string[] = [];
  const toolResults: SpecialistRunResult["toolResults"] = [];

  const userContent = contexto
    ? `${tarefa}\n\nContexto da operação (já coletado — não peça de novo):\n${contexto}`
    : tarefa;

  const conversation: Message[] = [
    { role: "system", content: def.systemPrompt },
    { role: "user", content: userContent },
  ];

  const maxTurns = def.maxTurns ?? DEFAULT_MAX_TURNS;
  let turns = 0;
  let llmCalls = 0;

  while (turns < maxTurns) {
    turns++;

    const budget = checkBudget(llmCalls);
    if (!budget.ok) {
      return { reply: budget.reason!, toolsUsed, toolResults };
    }
    llmCalls++;

    const result = await invokeLLM({
      messages: conversation,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      tool_choice: toolSchemas.length > 0 ? "auto" : undefined,
      model: def.model ?? MODELS.smart,
    });

    const choice = result.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    // Sem tool: resposta final do especialista
    if (toolCalls.length === 0) {
      const reply = typeof choice?.content === "string" ? choice.content : "";
      return { reply, toolsUsed, toolResults };
    }

    conversation.push({
      role: "assistant",
      content: typeof choice?.content === "string" ? choice.content : "",
      tool_calls: toolCalls,
    } as Message);

    for (const call of toolCalls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      const toolResult = await runFrom(BASE_TOOLS, name, args, ctx);
      toolsUsed.push(name);
      toolResults.push({ name, ok: toolResult.ok, data: toolResult.data });

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: toolResult.ok,
          summary: toolResult.summary,
          data: toolResult.data ?? null,
          error: toolResult.error ?? null,
        }),
      } as Message);
    }
  }

  return {
    reply:
      `O especialista ${def.displayName} precisou de muitos passos sem concluir. ` +
      `Reformule a tarefa com mais foco ou forneça os dados faltantes.`,
    toolsUsed,
    toolResults,
  };
}

/**
 * Embrulha um especialista como uma AgentTool que a Excambia pode chamar.
 * O resultado carrega a trilha (toolsUsed/toolResults) para auditoria futura.
 */
export function specialistAsTool(def: SpecialistDef): AgentTool {
  return {
    name: def.toolName,
    schema: defineSchema(def.toolName, def.descricao, {
      type: "object",
      properties: {
        tarefa: {
          type: "string",
          description:
            "A tarefa ou pergunta específica que o especialista deve resolver, em linguagem natural.",
        },
        contexto: {
          type: "string",
          description:
            "Dados relevantes da operação já coletados (cliente, produto, origem, regime, valores) " +
            "para o especialista não pedir de novo. Opcional, mas recomendado.",
        },
      },
      required: ["tarefa"],
    }),
    async run(args, ctx: ToolContext): Promise<ToolResult> {
      const tarefa = typeof args.tarefa === "string" ? args.tarefa.trim() : "";
      if (!tarefa) {
        return {
          ok: false,
          summary: `Informe a tarefa para o especialista ${def.displayName}.`,
          error: "tarefa vazia",
        };
      }
      const contexto = typeof args.contexto === "string" ? args.contexto : undefined;

      const res = await runSpecialist(def, tarefa, contexto, ctx);

      return {
        ok: true,
        summary: res.reply,
        data: {
          especialista: def.key,
          displayName: def.displayName,
          toolsUsed: res.toolsUsed,
          toolResults: res.toolResults,
        },
      };
    },
  };
}
