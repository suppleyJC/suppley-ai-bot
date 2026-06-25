/**
 * Registry central de ferramentas da Excambia.
 *
 * Combina as tools-base (capacidades diretas, em ./registry) com os ESPECIALISTAS
 * (sub-agentes expostos como tools, em ../specialists). O orquestrador pede:
 *   - getToolSchemas(estagio) → schemas para passar ao invokeLLM
 *   - runTool(name, args, ctx) → executa a tool/especialista escolhido pelo LLM
 *
 * Para adicionar uma capacidade direta: implemente em ./suaTool.ts e registre em
 * BASE_TOOLS (registry.ts). Para adicionar um especialista: declare em
 * specialists/definitions.ts. Nada mais muda aqui.
 */
import type { AgentTool, ToolContext, ToolResult } from "./types";
import type { Tool } from "../../_core/llm";
import { BASE_TOOLS, schemasFor, runFrom } from "./registry";
import { SPECIALIST_TOOLS } from "../specialists";

/** Todas as tools que a Excambia enxerga: capacidades diretas + especialistas. */
const ALL_TOOLS: AgentTool[] = [...BASE_TOOLS, ...SPECIALIST_TOOLS];

/** Schemas das tools disponíveis para um estágio (ou todas, se estagio undefined). */
export function getToolSchemas(estagio?: string): Tool[] {
  return schemasFor(ALL_TOOLS, estagio);
}

/** Executa uma tool pelo nome, com tratamento de erro padronizado. */
export function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  return runFrom(ALL_TOOLS, name, args, ctx);
}

export { ALL_TOOLS };
