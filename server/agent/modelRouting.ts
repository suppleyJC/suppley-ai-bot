import { MODELS, type Message } from "../_core/llm";

/**
 * Turnos curtos de confirmação/continuidade não precisam pagar a latência do
 * modelo mais pesado. Mantemos o contexto e as mesmas tools; apenas usamos o
 * modelo balanceado quando a mensagem atual é inequivocamente conversacional.
 */
const QUICK_TURN =
  /^(?:oi|ol[aá]|bom dia|boa tarde|boa noite|ok|okay|sim|n[aã]o|beleza|blz|perfeito|entendi|obrigad[oa]|valeu|show|isso|exato|pode seguir|pode continuar|continue|continua|opa deu boa|deu boa)[\s!.?]*$/i;

const ACTION_CRITICAL_CONTEXT =
  /aprovar|aprova[çc][aã]o|confirmar|confirma[çc][aã]o|autorizar|autoriza[çc][aã]o|enviar|envio|executar|execu[çc][aã]o|prosseguir com|fechar|cancelar|excluir|pagamento|cotação|fornecedor|pedido|rfq|disparar/i;

export function isQuickConversationalTurn(messages: Message[]): boolean {
  const lastUserIndex = [...messages].map((m) => m.role).lastIndexOf("user");
  if (lastUserIndex < 0) return false;

  const last = messages[lastUserIndex];
  if (typeof last.content !== "string") return false;

  const text = last.content.trim().replace(/\s+/g, " ");
  if (text.length > 120 || !QUICK_TURN.test(text)) return false;

  const previousAssistant = [...messages.slice(0, lastUserIndex)]
    .reverse()
    .find((m) => m.role === "assistant");

  if (
    previousAssistant &&
    typeof previousAssistant.content === "string" &&
    ACTION_CRITICAL_CONTEXT.test(previousAssistant.content)
  ) {
    return false;
  }

  return true;
}

export function modelForTurn(messages: Message[], deepReasoning: boolean): string {
  if (!deepReasoning && isQuickConversationalTurn(messages)) {
    return MODELS.balanced;
  }
  return MODELS.smart;
}
