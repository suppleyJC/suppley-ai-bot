/**
 * Registry central de ferramentas da Excambia.
 *
 * Junta todas as tools num só lugar. O orquestrador pede:
 *   - getToolSchemas(estagio) → schemas para passar ao invokeLLM
 *   - runTool(name, args, ctx) → executa a tool escolhida pelo LLM
 *
 * Para adicionar uma nova ferramenta: implemente em ./suaTool.ts e registre
 * no array ALL_TOOLS abaixo. Nada mais muda.
 */
import type { AgentTool, ToolContext, ToolResult } from "./types";
import type { Tool } from "../../_core/llm";

import { montarCalculoTool } from "./montarCalculo";
import { classificarNcmTool } from "./classificarNcm";
import { compararCotacoesTool } from "./compararCotacoes";
import { enviarRfqTool } from "./enviarRfq";
import { registrarCotacaoTool } from "./registrarCotacao";
import { registrarMarcoProducaoTool } from "./registrarMarcoProducao";
import { registrarNacionalizacaoTool } from "./registrarNacionalizacao";
import { lancarFinanceiroTool } from "./lancarFinanceiroTool";

const ALL_TOOLS: AgentTool[] = [
  montarCalculoTool,
  classificarNcmTool,
  compararCotacoesTool,
  enviarRfqTool,
  registrarCotacaoTool,
  registrarMarcoProducaoTool,
  registrarNacionalizacaoTool,
  lancarFinanceiroTool,
];

const byName = new Map<string, AgentTool>(ALL_TOOLS.map((t) => [t.name, t]));

/** Schemas das tools disponíveis para um estágio (ou todas, se estagio undefined). */
export function getToolSchemas(estagio?: string): Tool[] {
  return ALL_TOOLS
    .filter((t) => !estagio || !t.estagios || t.estagios.includes(estagio))
    .map((t) => t.schema);
}

/** Executa uma tool pelo nome, com tratamento de erro padronizado. */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = byName.get(name);
  if (!tool) {
    return { ok: false, summary: `Ferramenta "${name}" não encontrada.`, error: "tool_inexistente" };
  }
  // valida estágio
  if (tool.estagios && ctx.estagio && !tool.estagios.includes(ctx.estagio)) {
    return {
      ok: false,
      summary: `A ferramenta "${name}" não se aplica ao estágio atual.`,
      error: "estagio_invalido",
    };
  }
  try {
    return await tool.run(args, ctx);
  } catch (e: any) {
    return { ok: false, summary: "Erro ao executar a ferramenta.", error: String(e?.message ?? e) };
  }
}

export { ALL_TOOLS };
