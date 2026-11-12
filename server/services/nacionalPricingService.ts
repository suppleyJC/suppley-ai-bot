/**
 * nacionalPricingService — apoio a cenários NACIONAIS (fora do escopo principal
 * de importação): precificação/CMV de mercadoria comprada no Brasil e abatimento
 * de IRPJ via depreciação de ativo imobilizado.
 *
 * Não substitui um módulo fiscal completo; é um cálculo determinístico para a
 * Excambia responder sem "limitação técnica" quando o usuário vai por esse caminho.
 * Tudo em centavos; alíquotas em fração (0.076 = 7,6%).
 */

export type Regime = "lucro_real" | "lucro_presumido" | "simples_nacional";

/** PIS/COFINS de saída por regime (mesmos defaults do motor de importação). */
const SAIDA_PIS_COFINS: Record<Regime, { pis: number; cofins: number }> = {
  lucro_real: { pis: 0.0165, cofins: 0.076 },
  lucro_presumido: { pis: 0.0065, cofins: 0.03 },
  simples_nacional: { pis: 0, cofins: 0 }, // embutidos no DAS
};

/* ============================================================
 * 1) PRECIFICAÇÃO / CMV — "por quanto vender para ter lucro"
 * ============================================================ */

export interface PrecificacaoNacionalInput {
  /** Custo de aquisição líquido (CMV) em centavos — já sem créditos recuperáveis. */
  cmvCents: number;
  regime: Regime;
  /** Margem de lucro líquida desejada sobre a venda (fração). Padrão 0.15. */
  margemDesejada?: number;
  /** ICMS de saída (fração). Padrão 0.18 (interna típica). */
  icmsVendaRate?: number;
  /** IPI de saída (fração) — só se for industrial/equiparado. Padrão 0. */
  ipiVendaRate?: number;
  /** Alíquota única do Simples (fração) — usada só no Simples. Padrão 0.10. */
  simplesRate?: number;
  /** Despesas fixas rateadas por venda (frete, comissão) em centavos. Padrão 0. */
  despesasVendaCents?: number;
}

export interface PrecificacaoNacionalResult {
  cmvCents: number;
  precoVendaCents: number;
  margemLiquidaCents: number;
  impostosSaidaCents: number;
  /** Alíquotas de saída somadas (fração do preço). */
  cargaSaidaFrac: number;
  detalhe: { icms: number; pis: number; cofins: number; ipi: number; simples: number };
}

/**
 * Método do divisor (mesmo do motor de importação): preço tal que, após impostos
 * de saída "por dentro" e a margem desejada, sobra o lucro líquido pretendido.
 *   preço = (CMV + despesas) / (1 − cargaSaída − margem)
 */
export function precificarNacional(input: PrecificacaoNacionalInput): PrecificacaoNacionalResult {
  const cmv = Math.max(0, Math.round(input.cmvCents));
  const despesas = Math.max(0, Math.round(input.despesasVendaCents ?? 0));
  const margem = input.margemDesejada ?? 0.15;
  const { pis, cofins } = SAIDA_PIS_COFINS[input.regime];

  let icms = input.icmsVendaRate ?? 0.18;
  let ipi = input.ipiVendaRate ?? 0;
  let simples = 0;
  if (input.regime === "simples_nacional") {
    // No Simples, ICMS/PIS/COFINS estão no DAS — usa a alíquota única.
    simples = input.simplesRate ?? 0.10;
    icms = 0;
    ipi = input.ipiVendaRate ?? 0; // IPI pode existir p/ industrial no Simples, mas raro
  }

  const cargaSaidaFrac = icms + pis + cofins + ipi + simples;
  const divisor = 1 - cargaSaidaFrac - margem;
  if (divisor <= 0) {
    throw new Error("Carga de saída + margem ≥ 100%: reduza a margem ou revise as alíquotas.");
  }

  const precoVendaCents = Math.round((cmv + despesas) / divisor);
  const impostosSaidaCents = Math.round(precoVendaCents * cargaSaidaFrac);
  const margemLiquidaCents = Math.round(precoVendaCents * margem);

  return {
    cmvCents: cmv,
    precoVendaCents,
    margemLiquidaCents,
    impostosSaidaCents,
    cargaSaidaFrac,
    detalhe: { icms, pis, cofins, ipi, simples },
  };
}

/* ============================================================
 * 2) ATIVO IMOBILIZADO — economia de IRPJ/CSLL via depreciação
 * ============================================================ */

export interface DepreciacaoAtivoInput {
  /** Valor do ativo imobilizado (centavos). */
  valorAtivoCents: number;
  regime: Regime;
  /** Taxa de depreciação ANUAL (fração). Padrão 0.10 (10% a.a. — vida útil 10 anos). */
  taxaDepreciacaoAnual?: number;
  /** Vida útil em anos (alternativa à taxa). */
  vidaUtilAnos?: number;
  /** Base mensal de lucro real acima de R$ 20.000/mês sofre adicional de 10% de IRPJ. */
  aplicaAdicionalIrpj?: boolean;
}

export interface DepreciacaoAtivoResult {
  valorAtivoCents: number;
  taxaAnual: number;
  depreciacaoAnualCents: number;
  aliquotaAbatimento: number;       // IRPJ+CSLL efetivos que a depreciação abate
  economiaAnualCents: number;       // depreciação × alíquota
  economiaTotalCents: number;       // ao longo da vida útil
  aplicavel: boolean;               // só Lucro Real abate depreciação real
  observacao: string;
}

/**
 * A depreciação de ativo imobilizado só reduz a base de IRPJ/CSLL no **Lucro Real**
 * (despesa dedutível). No Presumido/Simples a base não é o lucro real, então a
 * depreciação não gera esse abatimento direto.
 */
export function depreciacaoAtivo(input: DepreciacaoAtivoInput): DepreciacaoAtivoResult {
  const valor = Math.max(0, Math.round(input.valorAtivoCents));
  const taxaAnual = input.taxaDepreciacaoAnual
    ?? (input.vidaUtilAnos && input.vidaUtilAnos > 0 ? 1 / input.vidaUtilAnos : 0.10);
  const vida = input.vidaUtilAnos ?? (taxaAnual > 0 ? Math.round(1 / taxaAnual) : 10);
  const depreciacaoAnualCents = Math.round(valor * taxaAnual);

  const aplicavel = input.regime === "lucro_real";
  // IRPJ 15% + adicional 10% (opcional) + CSLL 9%.
  const aliquotaAbatimento = aplicavel ? 0.15 + (input.aplicaAdicionalIrpj ? 0.10 : 0) + 0.09 : 0;
  const economiaAnualCents = Math.round(depreciacaoAnualCents * aliquotaAbatimento);
  const economiaTotalCents = Math.round(valor * aliquotaAbatimento);

  return {
    valorAtivoCents: valor,
    taxaAnual,
    depreciacaoAnualCents,
    aliquotaAbatimento,
    economiaAnualCents,
    economiaTotalCents,
    aplicavel,
    observacao: aplicavel
      ? `Depreciação de ${(taxaAnual * 100).toFixed(0)}% a.a. (vida útil ~${vida} anos) é despesa dedutível no Lucro Real; abate IRPJ+CSLL${input.aplicaAdicionalIrpj ? " (com adicional de 10%)" : ""}.`
      : "No Lucro Presumido/Simples a base tributável não é o lucro real — a depreciação não gera abatimento direto de IRPJ. Considere Lucro Real para aproveitar.",
  };
}
