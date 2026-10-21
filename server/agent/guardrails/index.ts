/**
 * GUARDRAILS — decisão e gasto.
 *
 * decisao: a IA recomenda, mas GO/NO-GO sempre exige confirmação humana.
 * gasto:   limite de chamadas de LLM por operação, para evitar loop caro.
 */

export interface GuardrailResult {
  ok: boolean;
  reason?: string;
}

/**
 * GUARDRAIL DE DECISÃO.
 * Toda decisão GO/NO-GO precisa de um humano. Esta função é chamada antes de
 * efetivar uma decisão a partir de uma sugestão da IA: se não houver
 * confirmação humana explícita, bloqueia.
 */
export function requireHumanForGoNoGo(input: {
  decision: "go" | "no_go";
  confirmedByUserId?: number;
}): GuardrailResult {
  if (!input.confirmedByUserId) {
    return {
      ok: false,
      reason:
        "A decisão GO/NO-GO precisa ser confirmada por uma pessoa. " +
        "A Excambia recomenda, mas não decide sozinha.",
    };
  }
  return { ok: true };
}

/**
 * GUARDRAIL DE GASTO.
 * Limita quantas chamadas de LLM uma única operação/sessão pode fazer,
 * evitando loops de ferramentas que consumiriam tokens indefinidamente.
 * O contador deve ser mantido pelo orquestrador (em memória da sessão ou
 * persistido por operação).
 */
const LIMITE_CHAMADAS_POR_SESSAO = 25;

export function checkBudget(chamadasFeitas: number): GuardrailResult {
  if (chamadasFeitas >= LIMITE_CHAMADAS_POR_SESSAO) {
    return {
      ok: false,
      reason:
        // Texto de USUÁRIO: o limite é proteção de custo, assunto do operador.
        // O que o usuário precisa saber é que a análise ficou extensa e como seguir.
        `Esta análise ficou extensa e eu reuni o que tinha até aqui. ` +
        `Me diga qual ponto quer aprofundar primeiro e eu sigo a partir dele.`,
    };
  }
  return { ok: true };
}
