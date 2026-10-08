/**
 * State Pricing Service
 * Serviço para precificação dinâmica por estado destino
 * Considera ICMS interno, DIFAL e ST quando aplicável
 */

import { getDb } from "../db";
import { statePricingRules } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// Interfaces
export interface StatePricing {
  stateCode: string;
  stateName: string;
  
  // ICMS
  icmsInternalRate: number; // Alíquota interna em basis points
  icmsInterstateRate: number; // Alíquota interestadual
  
  // DIFAL
  hasDifal: boolean;
  difalAmount: number; // Valor do DIFAL em centavos
  difalRate: number; // Alíquota efetiva do DIFAL
  
  // ST (se aplicável)
  hasSt: boolean;
  stAmount: number; // Valor da ST em centavos
  mvaRate: number; // MVA em basis points
  
  // Custos adicionais
  additionalLogisticsCost: number; // Custo adicional de frete em centavos
  
  // Preço final
  basePrice: number; // Preço base em centavos
  finalPrice: number; // Preço final com todos os impostos
  totalTaxes: number; // Total de impostos adicionais
  
  // Comparativo
  priceIncrease: number; // Aumento em relação ao preço base (%)
}

export interface MultiStatePricing {
  originState: string;
  basePrice: number;
  pricing: StatePricing[];
  cheapestState: string;
  mostExpensiveState: string;
  averagePrice: number;
}

// Dados de ICMS por estado (alíquotas internas e interestaduais)
const STATE_ICMS_DATA: Record<string, { name: string; internal: number; interstate: number }> = {
  AC: { name: "Acre", internal: 1900, interstate: 1200 },
  AL: { name: "Alagoas", internal: 1900, interstate: 1200 },
  AM: { name: "Amazonas", internal: 2000, interstate: 1200 },
  AP: { name: "Amapá", internal: 1800, interstate: 1200 },
  BA: { name: "Bahia", internal: 2050, interstate: 1200 },
  CE: { name: "Ceará", internal: 2000, interstate: 1200 },
  DF: { name: "Distrito Federal", internal: 2000, interstate: 1200 },
  ES: { name: "Espírito Santo", internal: 1700, interstate: 1200 },
  GO: { name: "Goiás", internal: 1900, interstate: 1200 },
  MA: { name: "Maranhão", internal: 2200, interstate: 1200 },
  MG: { name: "Minas Gerais", internal: 1800, interstate: 1200 },
  MS: { name: "Mato Grosso do Sul", internal: 1700, interstate: 1200 },
  MT: { name: "Mato Grosso", internal: 1700, interstate: 1200 },
  PA: { name: "Pará", internal: 1900, interstate: 1200 },
  PB: { name: "Paraíba", internal: 2000, interstate: 1200 },
  PE: { name: "Pernambuco", internal: 2050, interstate: 1200 },
  PI: { name: "Piauí", internal: 2100, interstate: 1200 },
  PR: { name: "Paraná", internal: 1950, interstate: 1200 },
  RJ: { name: "Rio de Janeiro", internal: 2200, interstate: 1200 },
  RN: { name: "Rio Grande do Norte", internal: 2000, interstate: 1200 },
  RO: { name: "Rondônia", internal: 1950, interstate: 1200 },
  RR: { name: "Roraima", internal: 2000, interstate: 1200 },
  RS: { name: "Rio Grande do Sul", internal: 1700, interstate: 1200 },
  SC: { name: "Santa Catarina", internal: 1700, interstate: 1200 },
  SE: { name: "Sergipe", internal: 1900, interstate: 1200 },
  SP: { name: "São Paulo", internal: 1800, interstate: 1200 },
  TO: { name: "Tocantins", internal: 2000, interstate: 1200 },
};

// Alíquota interestadual para produtos importados
const IMPORTED_INTERSTATE_RATE = 400; // 4%

/**
 * Retorna a alíquota interna de ICMS de um estado como FRAÇÃO (ex.: 0.17),
 * pronta para uso no motor de cálculo. Retorna null se o estado for desconhecido.
 *
 * Fonte da verdade única do ICMS interno por UF (usado pelo motor de importação
 * para aplicar o regime cheio fora de SC, e pela precificação por estado).
 */
export function getStateIcmsInternalRate(stateCode: string): number | null {
  const uf = (stateCode || "").toUpperCase().slice(0, 2);
  const data = STATE_ICMS_DATA[uf];
  if (!data) return null;
  return data.internal / 10000; // basis points → fração
}

/** Nome do estado pela UF (ou null se desconhecido). */
export function getStateName(stateCode: string): string | null {
  const uf = (stateCode || "").toUpperCase().slice(0, 2);
  return STATE_ICMS_DATA[uf]?.name ?? null;
}

/**
 * Calcula DIFAL (Diferencial de Alíquota)
 * DIFAL = (Alíquota Interna - Alíquota Interestadual) * Base de Cálculo
 */
export function calculateDifal(params: {
  baseValue: number; // Valor da operação em centavos
  originState: string;
  destinationState: string;
  isImported: boolean;
}): { difalAmount: number; difalRate: number; breakdown: string } {
  const destData = STATE_ICMS_DATA[params.destinationState];
  if (!destData) {
    return { difalAmount: 0, difalRate: 0, breakdown: "Estado destino não encontrado" };
  }

  // Alíquota interestadual: 4% para importados, 12% para nacionais
  const interstateRate = params.isImported ? IMPORTED_INTERSTATE_RATE : 1200;
  const internalRate = destData.internal;

  // Se alíquota interna <= interestadual, não há DIFAL
  if (internalRate <= interstateRate) {
    return { difalAmount: 0, difalRate: 0, breakdown: "Alíquota interna <= interestadual, sem DIFAL" };
  }

  const difalRate = internalRate - interstateRate;
  
  // Cálculo do DIFAL "por dentro"
  // Base de cálculo do DIFAL = Valor / (1 - Alíquota Interna)
  const baseCalculo = Math.round(params.baseValue / (1 - internalRate / 10000));
  const difalAmount = Math.round(baseCalculo * difalRate / 10000);

  const breakdown = `
DIFAL Calculation:
- Alíquota Interna (${params.destinationState}): ${(internalRate / 100).toFixed(2)}%
- Alíquota Interestadual: ${(interstateRate / 100).toFixed(2)}%
- Diferencial: ${(difalRate / 100).toFixed(2)}%
- Base de Cálculo: R$ ${(baseCalculo / 100).toFixed(2)}
- DIFAL: R$ ${(difalAmount / 100).toFixed(2)}
  `.trim();

  return { difalAmount, difalRate, breakdown };
}

/**
 * Calcula Substituição Tributária (ST)
 * ST = (Base ST * Alíquota Interna) - ICMS Próprio
 * Base ST = (Valor + IPI + Frete + Seguro + Outras Despesas) * (1 + MVA)
 */
export function calculateST(params: {
  baseValue: number; // Valor da operação em centavos
  icmsProprio: number; // ICMS próprio já pago
  mvaPercent: number; // MVA em basis points (ex: 4000 = 40%)
  destinationState: string;
}): { stAmount: number; baseST: number; breakdown: string } {
  const destData = STATE_ICMS_DATA[params.destinationState];
  if (!destData) {
    return { stAmount: 0, baseST: 0, breakdown: "Estado destino não encontrado" };
  }

  // Base ST = Valor * (1 + MVA)
  const mvaMultiplier = 1 + params.mvaPercent / 10000;
  const baseST = Math.round(params.baseValue * mvaMultiplier);

  // ST = (Base ST * Alíquota Interna) - ICMS Próprio
  const icmsST = Math.round(baseST * destData.internal / 10000);
  const stAmount = Math.max(0, icmsST - params.icmsProprio);

  const breakdown = `
ST Calculation:
- Valor Base: R$ ${(params.baseValue / 100).toFixed(2)}
- MVA: ${(params.mvaPercent / 100).toFixed(2)}%
- Base ST: R$ ${(baseST / 100).toFixed(2)}
- Alíquota Interna: ${(destData.internal / 100).toFixed(2)}%
- ICMS ST: R$ ${(icmsST / 100).toFixed(2)}
- ICMS Próprio: R$ ${(params.icmsProprio / 100).toFixed(2)}
- ST a Recolher: R$ ${(stAmount / 100).toFixed(2)}
  `.trim();

  return { stAmount, baseST, breakdown };
}

/**
 * Calcula preço para um estado específico
 */
export function calculateStatePricing(params: {
  basePrice: number; // Preço base em centavos (sem impostos estaduais adicionais)
  originState: string;
  destinationState: string;
  isImported: boolean;
  icmsProprio?: number; // ICMS já pago na operação
  hasST?: boolean; // Se o produto tem ST
  mvaPercent?: number; // MVA para ST
  additionalLogisticsCostPercent?: number; // % adicional de frete
}): StatePricing {
  const destData = STATE_ICMS_DATA[params.destinationState];
  if (!destData) {
    throw new Error(`Estado ${params.destinationState} não encontrado`);
  }

  const interstateRate = params.isImported ? IMPORTED_INTERSTATE_RATE : 1200;

  // Calcular DIFAL
  const difal = calculateDifal({
    baseValue: params.basePrice,
    originState: params.originState,
    destinationState: params.destinationState,
    isImported: params.isImported,
  });

  // Calcular ST se aplicável
  let stAmount = 0;
  let mvaRate = 0;
  if (params.hasST && params.mvaPercent) {
    const st = calculateST({
      baseValue: params.basePrice,
      icmsProprio: params.icmsProprio || 0,
      mvaPercent: params.mvaPercent,
      destinationState: params.destinationState,
    });
    stAmount = st.stAmount;
    mvaRate = params.mvaPercent;
  }

  // Calcular custo adicional de logística
  const logisticsCostPercent = params.additionalLogisticsCostPercent || 0;
  const additionalLogisticsCost = Math.round(params.basePrice * logisticsCostPercent / 10000);

  // Calcular preço final
  const totalTaxes = difal.difalAmount + stAmount;
  const finalPrice = params.basePrice + totalTaxes + additionalLogisticsCost;
  const priceIncrease = ((finalPrice - params.basePrice) / params.basePrice) * 100;

  return {
    stateCode: params.destinationState,
    stateName: destData.name,
    icmsInternalRate: destData.internal,
    icmsInterstateRate: interstateRate,
    hasDifal: difal.difalAmount > 0,
    difalAmount: difal.difalAmount,
    difalRate: difal.difalRate,
    hasSt: stAmount > 0,
    stAmount,
    mvaRate,
    additionalLogisticsCost,
    basePrice: params.basePrice,
    finalPrice,
    totalTaxes,
    priceIncrease,
  };
}

/**
 * Calcula preço para todos os estados
 */
export function calculateMultiStatePricing(params: {
  basePrice: number;
  originState: string;
  isImported: boolean;
  icmsProprio?: number;
  hasST?: boolean;
  mvaPercent?: number;
}): MultiStatePricing {
  const pricing: StatePricing[] = [];

  for (const stateCode of Object.keys(STATE_ICMS_DATA)) {
    try {
      const statePricing = calculateStatePricing({
        ...params,
        destinationState: stateCode,
      });
      pricing.push(statePricing);
    } catch (error) {
      console.error(`Error calculating pricing for ${stateCode}:`, error);
    }
  }

  // Ordenar por preço final
  pricing.sort((a, b) => a.finalPrice - b.finalPrice);

  const cheapestState = pricing[0]?.stateCode || "";
  const mostExpensiveState = pricing[pricing.length - 1]?.stateCode || "";
  const averagePrice = pricing.reduce((sum, p) => sum + p.finalPrice, 0) / pricing.length;

  return {
    originState: params.originState,
    basePrice: params.basePrice,
    pricing,
    cheapestState,
    mostExpensiveState,
    averagePrice: Math.round(averagePrice),
  };
}

/**
 * Obtém regras de precificação de um estado do banco de dados
 */
export async function getStatePricingRules(stateCode: string): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const rules = await db
      .select()
      .from(statePricingRules)
      .where(eq(statePricingRules.stateCode, stateCode))
      .limit(1);

    return rules[0] || null;
  } catch (error) {
    console.error("Error fetching state pricing rules:", error);
    return null;
  }
}

/**
 * Salva ou atualiza regras de precificação de um estado
 */
export async function saveStatePricingRules(rules: {
  stateCode: string;
  stateName: string;
  icmsInternalRate: number;
  icmsInterstateRate: number;
  hasDifal?: boolean;
  difalCalculationMethod?: "simple" | "double_base";
  hasStDefault?: boolean;
  defaultMva?: number;
  additionalLogisticsCostPercent?: number;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // Verificar se já existe
    const existing = await db
      .select()
      .from(statePricingRules)
      .where(eq(statePricingRules.stateCode, rules.stateCode))
      .limit(1);

    if (existing.length > 0) {
      // Atualizar
      await db
        .update(statePricingRules)
        .set({
          stateName: rules.stateName,
          icmsInternalRate: rules.icmsInternalRate,
          icmsInterstateRate: rules.icmsInterstateRate,
          hasDifal: rules.hasDifal ?? true,
          difalCalculationMethod: rules.difalCalculationMethod || "simple",
          hasStDefault: rules.hasStDefault ?? false,
          defaultMva: rules.defaultMva,
          additionalLogisticsCostPercent: rules.additionalLogisticsCostPercent || 0,
          notes: rules.notes,
        })
        .where(eq(statePricingRules.stateCode, rules.stateCode));
    } else {
      // Inserir
      await db.insert(statePricingRules).values({
        stateCode: rules.stateCode,
        stateName: rules.stateName,
        icmsInternalRate: rules.icmsInternalRate,
        icmsInterstateRate: rules.icmsInterstateRate,
        hasDifal: rules.hasDifal ?? true,
        difalCalculationMethod: rules.difalCalculationMethod || "simple",
        hasStDefault: rules.hasStDefault ?? false,
        defaultMva: rules.defaultMva,
        additionalLogisticsCostPercent: rules.additionalLogisticsCostPercent || 0,
        notes: rules.notes,
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Lista todos os estados com suas regras de precificação
 */
export function listAllStatesWithPricing(): { stateCode: string; stateName: string; icmsInternal: number }[] {
  return Object.entries(STATE_ICMS_DATA).map(([code, data]) => ({
    stateCode: code,
    stateName: data.name,
    icmsInternal: data.internal,
  }));
}

/**
 * Gera relatório comparativo de preços por estado
 */
export function generateStatePricingReport(multiPricing: MultiStatePricing): string {
  let report = `
RELATÓRIO DE PRECIFICAÇÃO POR ESTADO
====================================
Preço Base: R$ ${(multiPricing.basePrice / 100).toFixed(2)}
Estado de Origem: ${multiPricing.originState}

RANKING DE PREÇOS (do mais barato ao mais caro):
------------------------------------------------
`;

  for (let i = 0; i < multiPricing.pricing.length; i++) {
    const p = multiPricing.pricing[i];
    const rank = i + 1;
    report += `
${rank}. ${p.stateName} (${p.stateCode})
   Preço Final: R$ ${(p.finalPrice / 100).toFixed(2)} (+${p.priceIncrease.toFixed(1)}%)
   DIFAL: R$ ${(p.difalAmount / 100).toFixed(2)} | ST: R$ ${(p.stAmount / 100).toFixed(2)}
`;
  }

  report += `
RESUMO:
-------
Estado mais barato: ${multiPricing.cheapestState}
Estado mais caro: ${multiPricing.mostExpensiveState}
Preço médio: R$ ${(multiPricing.averagePrice / 100).toFixed(2)}
`;

  return report.trim();
}
