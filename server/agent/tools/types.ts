/**
 * Tipos base do sistema de ferramentas (tools) da Excambia.
 *
 * Uma AgentTool empacota: o schema que o LLM vê (para decidir chamar)
 * e o handler que executa de verdade (chamando um serviço que já existe).
 *
 * O contrato do schema espelha o `Tool` de _core/llm.ts:
 *   { type: "function", function: { name, description, parameters } }
 */
import type { Tool } from "../../_core/llm";

/** Contexto passado a toda execução de tool — quem está pedindo e em qual operação. */
export interface ToolContext {
  userId: number;
  operacaoId?: number;        // se a conversa está dentro de uma operação
  estagio?: string;           // estágio atual (demand|source|analyze|execute|finance)
}

/** Resultado padronizado de uma tool. */
export interface ToolResult {
  ok: boolean;
  /** Texto curto que volta para o LLM continuar a conversa. */
  summary: string;
  /** Dados estruturados (para a UI e para gravar no evento). */
  data?: unknown;
  /** Mensagem de erro, se ok=false. */
  error?: string;
}

/** Uma ferramenta da Excambia. */
export interface AgentTool {
  /** Nome único — é o que o LLM usa para chamar. */
  name: string;
  /** Schema no formato do invokeLLM (Anthropic por baixo). */
  schema: Tool;
  /** Em quais estágios esta tool faz sentido (vazio = sempre). */
  estagios?: string[];
  /**
   * Executa a tool. `args` já vem parseado do JSON do LLM.
   * Toda implementação deve validar `args` antes de usar.
   */
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

/** Helper para montar o schema de uma tool com menos verbosidade. */
export function defineSchema(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): Tool {
  return { type: "function", function: { name, description, parameters } };
}
