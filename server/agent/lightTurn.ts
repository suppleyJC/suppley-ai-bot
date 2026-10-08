import { invokeLLM, MODELS, type Message } from "../_core/llm";
import { ENV } from "../_core/env";
import { invokeDeepSeek } from "../_core/deepseek";

const SOCIAL = /^(?:oi|olá|ola|bom dia|boa tarde|boa noite|obrigado|obrigada|valeu)[\s!.?]*$/i;
// Anchored grammar: a diagnostic echo cannot carry an additional action.
const ECHO_TEST = /^Teste(?: de (?:duplicação|medição de uso))?\. Responda apenas [“"]([^”"\n]{1,80})[”"]\. Não crie operação nem envie cotações\.$/i;

export function lightTurnText(input: { messages: Message[]; operacaoId?: number; anexo?: unknown }): string | undefined {
  // Never discard history that might contain an approval, an attachment or a task.
  if (input.operacaoId != null || input.anexo || input.messages.length !== 1) return;
  const message = input.messages[0];
  if (message.role !== "user" || typeof message.content !== "string" || message.tool_calls?.length) return;
  const text = message.content.trim();
  if (SOCIAL.test(text) || ECHO_TEST.test(text)) return text;
}

export async function runLightTurn(text: string) {
  if (!["anthropic", "deepseek"].includes(ENV.lightLlmProvider)) throw new Error("Invalid LIGHT_LLM_PROVIDER");
  const invoke = ENV.lightLlmProvider === "deepseek" ? invokeDeepSeek : invokeLLM;
  const result = await invoke({
    model: MODELS.fast,
    messages: [
      { role: "system", content: "Você é a Excambia, assistente da SUPPLEY. Responda em português, brevemente, à saudação ou agradecimento. Em um teste de eco, reproduza somente o texto solicitado. Não execute ações, não invente dados nem afirme ter criado operações ou enviado cotações." },
      { role: "user", content: text },
    ],
    maxTokens: 256,
    webSearch: false,
  });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty light-turn response");
  return { reply: content, toolsUsed: [], toolResults: [] };
}
