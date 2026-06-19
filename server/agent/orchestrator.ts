/**
 * ORQUESTRADOR DA EXCAMBIA — o copiloto transversal único.
 *
 * Substitui o emaranhado de agentes (excambiaAgent/agent/langGraph/sofia).
 * Recebe a mensagem do usuário + contexto da operação, deixa o Claude decidir
 * qual ferramenta chamar (function calling), executa a tool, devolve o
 * resultado ao modelo e repete até ter a resposta final.
 *
 * Princípios aplicados:
 *  - UMA identidade (Excambia), especialização via ferramentas (não personas).
 *  - Toda chamada de tool passa por guardrails e é registrada (auditável).
 *  - Limite de gasto por sessão (guardrail).
 *  - Roda no Claude (invokeLLM de _core/llm.ts). Sem OpenAI.
 */
import { invokeLLM, type Message } from "../_core/llm";
import { getToolSchemas, runTool } from "./tools";
import type { ToolContext } from "./tools/types";
import { checkBudget } from "./guardrails";

const EXCAMBIA_SYSTEM_PROMPT = `Você é a Excambia, inteligência especialista em comércio exterior da plataforma SUPPLEY.
Seu papel é conduzir a operação de importação ponta a ponta, conversando de forma clara e objetiva em português.

FERRAMENTAS DISPONÍVEIS:
- montar_calculo: calcula custo nacionalizado, CMV e margem no motor certificado.
- classificar_ncm: sugere a NCM de um produto (com alternativas e risco) quando a pessoa não souber a classificação.
- comparar_cotacoes: compara preços de fornecedores já cadastrados para um produto.

REGRAS IMPORTANTES:
- Você NÃO calcula impostos de cabeça. Para qualquer cálculo de viabilidade, custo ou margem, use a ferramenta montar_calculo, que aciona o motor certificado. Nunca invente alíquotas.
- A NCM sugerida por classificar_ncm é uma recomendação: peça confirmação antes de usá-la num cálculo definitivo.
- Antes de calcular, confirme com a pessoa os dados que você estruturou (human-in-the-loop).
- Decisões GO/NO-GO são recomendações suas; a pessoa decide.
- Quando faltar um dado essencial (NCM, quantidade, preço, câmbio, regime), pergunte de forma direta.
- Seja concisa. Não repita informação que a pessoa já deu.`;

export interface OrchestratorInput {
  userId: number;
  operacaoId?: number;
  estagio?: string;
  /** Histórico da conversa (sem o system prompt — ele é injetado aqui). */
  messages: Message[];
}

export interface OrchestratorOutput {
  reply: string;
  toolsUsed: string[];
  toolResults: Array<{ name: string; ok: boolean; data?: unknown }>;
}

const MAX_TURNS = 6; // teto de idas-e-voltas com tools por mensagem

export async function runExcambia(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const ctx: ToolContext = {
    userId: input.userId,
    operacaoId: input.operacaoId,
    estagio: input.estagio,
  };

  const toolSchemas = getToolSchemas(input.estagio);
  const toolsUsed: string[] = [];
  const toolResults: OrchestratorOutput["toolResults"] = [];

  // monta a conversa com o system prompt da Excambia
  const conversation: Message[] = [
    { role: "system", content: EXCAMBIA_SYSTEM_PROMPT },
    ...input.messages,
  ];

  let turns = 0;
  let llmCalls = 0;

  while (turns < MAX_TURNS) {
    turns++;

    // GUARDRAIL DE GASTO
    const budget = checkBudget(llmCalls);
    if (!budget.ok) {
      return { reply: budget.reason!, toolsUsed, toolResults };
    }
    llmCalls++;

    const result = await invokeLLM({
      messages: conversation,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      tool_choice: toolSchemas.length > 0 ? "auto" : undefined,
    });

    const choice = result.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    // Sem tool: resposta final em texto
    if (toolCalls.length === 0) {
      const reply = typeof choice?.content === "string" ? choice.content : "";
      return { reply, toolsUsed, toolResults };
    }

    // Anexa a mensagem do assistente (que pediu tools) ao histórico.
    // IMPORTANTE: precisa carregar os tool_calls para a Anthropic conseguir
    // casar cada tool_result com seu tool_use no próximo turno.
    conversation.push({
      role: "assistant",
      content: typeof choice?.content === "string" ? choice.content : "",
      tool_calls: toolCalls,
    } as Message);

    // Executa cada tool pedida e devolve o resultado ao modelo
    for (const call of toolCalls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      const toolResult = await runTool(name, args, ctx);
      toolsUsed.push(name);
      toolResults.push({ name, ok: toolResult.ok, data: toolResult.data });

      // devolve o resultado da tool como mensagem 'tool'
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
    // volta ao while: o modelo agora vê os resultados e decide o próximo passo
  }

  // Esgotou os turns sem resposta final
  return {
    reply: "Precisei de muitos passos para concluir. Pode reformular ou dar mais detalhes?",
    toolsUsed,
    toolResults,
  };
}
