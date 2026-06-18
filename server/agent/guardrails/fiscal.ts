/**
 * GUARDRAIL FISCAL — a salvaguarda mais importante do sistema.
 *
 * Princípio: a IA NUNCA define alíquotas, fórmulas ou bases de cálculo.
 * Tudo isso vem do motor determinístico certificado e das tabelas oficiais.
 * A IA só coleta parâmetros de negócio (quantidade, preço, frete, regime).
 *
 * Este guardrail inspeciona os argumentos que o LLM tentou passar e BLOQUEIA
 * qualquer tentativa de injetar valores de imposto diretamente. Se o LLM
 * "alucinar" uma alíquota de II, ICMS, PIS etc., a execução é barrada.
 */

export interface GuardrailResult {
  ok: boolean;
  reason?: string;
}

/** Chaves que, se vierem do LLM, indicam tentativa de definir tributação. */
const CHAVES_FISCAIS_PROIBIDAS = [
  "aliquotaII", "iiPct", "ii", "aliquotaIpi", "ipiPct",
  "aliquotaIcms", "icmsPct", "aliquotaPis", "pisPct",
  "aliquotaCofins", "cofinsPct", "baseCalculo", "baseIcms",
  "valorImposto", "impostos", "tributos",
];

/**
 * Verifica os argumentos de uma tool de cálculo.
 * Retorna ok=false se detectar injeção de tributação pela IA.
 */
export function applyFiscalGuardrail(args: Record<string, unknown>): GuardrailResult {
  for (const chave of Object.keys(args ?? {})) {
    const norm = chave.toLowerCase();
    for (const proibida of CHAVES_FISCAIS_PROIBIDAS) {
      if (norm === proibida.toLowerCase()) {
        return {
          ok: false,
          reason:
            `Parâmetro fiscal "${chave}" não é aceito da IA. ` +
            `Alíquotas e impostos são calculados exclusivamente pelo motor ` +
            `determinístico certificado, a partir das tabelas oficiais.`,
        };
      }
    }
  }

  // ttdFase é permitido (é um benefício configurado pelo usuário, não uma alíquota inventada),
  // mas validamos o formato para não virar um número solto qualquer.
  if (args.ttdFase != null && typeof args.ttdFase !== "string") {
    return { ok: false, reason: "ttdFase deve ser um identificador textual da fase do benefício." };
  }

  return { ok: true };
}
