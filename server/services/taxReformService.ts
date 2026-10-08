/**
 * Tax Reform Service - Motor Tributário Dual (Regime Atual + IBS/CBS)
 * 
 * Implementa a Reforma Tributária brasileira (EC 132/2023 + LC 214/2025)
 * com suporte completo ao período de transição 2026-2033.
 * 
 * Excambia - Primeira plataforma de importação com simulação de reforma tributária
 */

// ============================================================
// CRONOGRAMA DA REFORMA TRIBUTÁRIA
// ============================================================

export interface TaxReformPhase {
  year: number;
  description: string;
  cbsRate: number;        // CBS rate in basis points (0.9% = 90 in 2026)
  ibsRate: number;        // IBS rate in basis points (0.1% = 10 in 2026)
  cbsActive: boolean;     // CBS is being collected
  ibsActive: boolean;     // IBS is being collected
  pisCofinActive: boolean; // PIS/COFINS still active
  ipiActive: boolean;     // IPI still active
  icmsActive: boolean;    // ICMS still active
  issActive: boolean;     // ISS still active
  ibsTransitionPercent: number; // IBS transition percentage (0-100)
  isTestPhase: boolean;   // Whether it's a test phase (no actual collection)
  selectiveActive: boolean; // Imposto Seletivo active
}

export const TAX_REFORM_TIMELINE: TaxReformPhase[] = [
  {
    year: 2025,
    description: "Regime atual - Sem reforma",
    cbsRate: 0, ibsRate: 0,
    cbsActive: false, ibsActive: false,
    pisCofinActive: true, ipiActive: true, icmsActive: true, issActive: true,
    ibsTransitionPercent: 0, isTestPhase: false, selectiveActive: false,
  },
  {
    year: 2026,
    description: "Fase teste - CBS 0,9% + IBS 0,1% (simulação, sem recolhimento efetivo)",
    cbsRate: 90, ibsRate: 10,
    cbsActive: false, ibsActive: false, // Test phase - no actual collection
    pisCofinActive: true, ipiActive: true, icmsActive: true, issActive: true,
    ibsTransitionPercent: 0, isTestPhase: true, selectiveActive: false,
  },
  {
    year: 2027,
    description: "CBS integral substitui PIS/COFINS. IPI zerado (exceto ZFM). Imposto Seletivo inicia.",
    cbsRate: 880, ibsRate: 10, // CBS full rate ~8.8% (estimated)
    cbsActive: true, ibsActive: false,
    pisCofinActive: false, ipiActive: false, icmsActive: true, issActive: true,
    ibsTransitionPercent: 0, isTestPhase: false, selectiveActive: true,
  },
  {
    year: 2028,
    description: "Consolidação CBS. ICMS e ISS ainda vigentes.",
    cbsRate: 880, ibsRate: 10,
    cbsActive: true, ibsActive: false,
    pisCofinActive: false, ipiActive: false, icmsActive: true, issActive: true,
    ibsTransitionPercent: 0, isTestPhase: false, selectiveActive: true,
  },
  {
    year: 2029,
    description: "Início transição IBS. IBS = 10% da participação. ICMS/ISS reduzem proporcionalmente.",
    cbsRate: 880, ibsRate: 170, // ~1.7% (10% of estimated full rate ~17%)
    cbsActive: true, ibsActive: true,
    pisCofinActive: false, ipiActive: false, icmsActive: true, issActive: true,
    ibsTransitionPercent: 10, isTestPhase: false, selectiveActive: true,
  },
  {
    year: 2030,
    description: "IBS = 20% da participação.",
    cbsRate: 880, ibsRate: 340,
    cbsActive: true, ibsActive: true,
    pisCofinActive: false, ipiActive: false, icmsActive: true, issActive: true,
    ibsTransitionPercent: 20, isTestPhase: false, selectiveActive: true,
  },
  {
    year: 2031,
    description: "IBS = 30% da participação.",
    cbsRate: 880, ibsRate: 510,
    cbsActive: true, ibsActive: true,
    pisCofinActive: false, ipiActive: false, icmsActive: true, issActive: true,
    ibsTransitionPercent: 30, isTestPhase: false, selectiveActive: true,
  },
  {
    year: 2032,
    description: "IBS = 40% da participação.",
    cbsRate: 880, ibsRate: 680,
    cbsActive: true, ibsActive: true,
    pisCofinActive: false, ipiActive: false, icmsActive: true, issActive: true,
    ibsTransitionPercent: 40, isTestPhase: false, selectiveActive: true,
  },
  {
    year: 2033,
    description: "Implantação total. ICMS e ISS extintos. IBS + CBS plenos.",
    cbsRate: 880, ibsRate: 1700, // Full IBS rate (estimated ~17%)
    cbsActive: true, ibsActive: true,
    pisCofinActive: false, ipiActive: false, icmsActive: false, issActive: false,
    ibsTransitionPercent: 100, isTestPhase: false, selectiveActive: true,
  },
];

// ============================================================
// IMPOSTO SELETIVO - Produtos prejudiciais à saúde/meio ambiente
// ============================================================

export interface SelectiveTaxConfig {
  ncmPattern: string;
  description: string;
  rate: number; // basis points
  category: "health" | "environment" | "both";
}

export const SELECTIVE_TAX_PRODUCTS: SelectiveTaxConfig[] = [
  { ncmPattern: "2402", description: "Cigarros e tabaco", rate: 5000, category: "health" },
  { ncmPattern: "2203", description: "Cerveja", rate: 2000, category: "health" },
  { ncmPattern: "2204", description: "Vinhos", rate: 1500, category: "health" },
  { ncmPattern: "2205", description: "Vermutes", rate: 1500, category: "health" },
  { ncmPattern: "2206", description: "Outras bebidas fermentadas", rate: 2000, category: "health" },
  { ncmPattern: "2207", description: "Álcool etílico", rate: 2000, category: "health" },
  { ncmPattern: "2208", description: "Bebidas destiladas", rate: 2500, category: "health" },
  { ncmPattern: "1701", description: "Açúcar (bebidas açucaradas)", rate: 500, category: "health" },
  { ncmPattern: "2710", description: "Óleos de petróleo", rate: 1000, category: "environment" },
  { ncmPattern: "2711", description: "Gás de petróleo", rate: 800, category: "environment" },
  { ncmPattern: "8703", description: "Veículos com motor a combustão", rate: 1200, category: "environment" },
];

// ============================================================
// INTERFACES DE CÁLCULO
// ============================================================

export interface ReformTaxCalculationInput {
  cifValueCents: number;
  ncmCode: string;
  originCountry: string;
  destinationState: string;
  isMercosul?: boolean;
  referenceYear?: number; // Ano de referência para aplicar regras da reforma
  
  // Current regime rates (from existing system)
  currentIiRate?: number;
  currentIpiRate?: number;
  currentPisRate?: number;
  currentCofinsRate?: number;
  currentIcmsRate?: number;
}

export interface ReformTaxCalculationResult {
  // Regime being applied
  regime: "current" | "transition" | "new";
  referenceYear: number;
  phase: TaxReformPhase;
  
  // Current regime taxes (when applicable)
  currentRegime?: {
    iiCents: number;
    ipiCents: number;
    pisCents: number;
    cofinsCents: number;
    icmsCents: number;
    totalCents: number;
  };
  
  // New regime taxes (IBS/CBS - when applicable)
  newRegime?: {
    iiCents: number;       // II remains even after reform
    cbsCents: number;
    ibsCents: number;
    selectiveCents: number;
    totalCents: number;
  };
  
  // Transition regime (both systems running)
  transitionRegime?: {
    iiCents: number;
    // Old taxes (reduced proportionally)
    ipiCents: number;
    pisCents: number;
    cofinsCents: number;
    icmsReducedCents: number;
    // New taxes
    cbsCents: number;
    ibsCents: number;
    selectiveCents: number;
    totalCents: number;
  };
  
  // Comparison data
  comparison: {
    currentTotalCents: number;
    newTotalCents: number;
    differenceCents: number;
    differencePercent: number;
    impact: "cheaper" | "more_expensive" | "neutral";
    savingsOrCostCents: number;
  };
  
  // Effective rates
  effectiveRates: {
    currentEffectiveRate: number; // basis points
    newEffectiveRate: number;     // basis points
    transitionEffectiveRate?: number;
  };
  
  // Key insights
  insights: string[];
}

// ============================================================
// MOTOR DE CÁLCULO DUAL
// ============================================================

/**
 * Get the reform phase for a given year
 */
export function getReformPhase(year: number): TaxReformPhase {
  const phase = TAX_REFORM_TIMELINE.find(p => p.year === year);
  if (phase) return phase;
  
  // Before reform
  if (year < 2026) return TAX_REFORM_TIMELINE[0]; // 2025 rules
  // After full implementation
  if (year > 2033) return TAX_REFORM_TIMELINE[TAX_REFORM_TIMELINE.length - 1]; // 2033 rules
  
  // Shouldn't reach here, but fallback
  return TAX_REFORM_TIMELINE[0];
}

/**
 * Check if a product is subject to Selective Tax
 */
export function getSelectiveTaxRate(ncmCode: string): SelectiveTaxConfig | null {
  const cleanNcm = ncmCode.replace(/\D/g, "");
  return SELECTIVE_TAX_PRODUCTS.find(st => cleanNcm.startsWith(st.ncmPattern)) || null;
}

/**
 * Calculate import taxes under the NEW regime (IBS/CBS)
 * 
 * Key differences from current regime:
 * 1. NO "cálculo por dentro" - taxes are calculated "por fora" (on top)
 * 2. CBS replaces PIS + COFINS + IPI
 * 3. IBS replaces ICMS + ISS
 * 4. II (Imposto de Importação) remains unchanged
 * 5. Same rates for imports and domestic operations (isonomia)
 */
export function calculateNewRegimeTaxes(
  cifValueCents: number,
  iiRate: number,
  cbsRate: number,
  ibsRate: number,
  ncmCode: string,
): {
  iiCents: number;
  cbsCents: number;
  ibsCents: number;
  selectiveCents: number;
  totalCents: number;
} {
  // II remains the same
  const iiCents = Math.round((cifValueCents * iiRate) / 10000);
  
  // Base for CBS and IBS: CIF + II (NO "cálculo por dentro")
  const baseForNewTaxes = cifValueCents + iiCents;
  
  // CBS (replaces PIS + COFINS + IPI) - calculated "por fora"
  const cbsCents = Math.round((baseForNewTaxes * cbsRate) / 10000);
  
  // IBS (replaces ICMS + ISS) - calculated "por fora"
  const ibsCents = Math.round((baseForNewTaxes * ibsRate) / 10000);
  
  // Selective Tax (if applicable)
  const selectiveConfig = getSelectiveTaxRate(ncmCode);
  const selectiveCents = selectiveConfig 
    ? Math.round((baseForNewTaxes * selectiveConfig.rate) / 10000)
    : 0;
  
  const totalCents = iiCents + cbsCents + ibsCents + selectiveCents;
  
  return { iiCents, cbsCents, ibsCents, selectiveCents, totalCents };
}

/**
 * Calculate taxes under the TRANSITION regime
 * During transition, both old and new taxes coexist with proportional reduction
 */
export function calculateTransitionTaxes(
  cifValueCents: number,
  phase: TaxReformPhase,
  currentRates: {
    iiRate: number;
    ipiRate: number;
    pisRate: number;
    cofinsRate: number;
    icmsRate: number;
  },
  ncmCode: string,
): {
  iiCents: number;
  ipiCents: number;
  pisCents: number;
  cofinsCents: number;
  icmsReducedCents: number;
  cbsCents: number;
  ibsCents: number;
  selectiveCents: number;
  totalCents: number;
} {
  // II always applies
  const iiCents = Math.round((cifValueCents * currentRates.iiRate) / 10000);
  
  // Old regime taxes (reduced proportionally during transition)
  const transitionReduction = phase.ibsTransitionPercent / 100; // 0 to 1
  const oldTaxMultiplier = 1 - transitionReduction;
  
  let ipiCents = 0;
  let pisCents = 0;
  let cofinsCents = 0;
  let icmsReducedCents = 0;
  
  if (phase.pisCofinActive) {
    // PIS/COFINS still active (before 2027)
    const baseIPI = cifValueCents + iiCents;
    ipiCents = Math.round((baseIPI * currentRates.ipiRate * oldTaxMultiplier) / 10000);
    
    // PIS/COFINS with iterative calculation (current method)
    const basePreIterativo = cifValueCents + iiCents + ipiCents;
    const iterResult = calculateIterativePisCofinsIcms(
      basePreIterativo,
      Math.round(currentRates.pisRate * oldTaxMultiplier),
      Math.round(currentRates.cofinsRate * oldTaxMultiplier),
      0 // ICMS handled separately
    );
    pisCents = iterResult.pis;
    cofinsCents = iterResult.cofins;
  }
  
  if (phase.icmsActive) {
    // ICMS reduced proportionally during transition
    const reducedIcmsRate = Math.round(currentRates.icmsRate * oldTaxMultiplier);
    const baseIcms = cifValueCents + iiCents + ipiCents + pisCents + cofinsCents;
    const divisorIcms = 10000 - reducedIcmsRate;
    icmsReducedCents = divisorIcms > 0 ? Math.round((baseIcms * reducedIcmsRate) / divisorIcms) : 0;
  }
  
  // New regime taxes (CBS/IBS)
  const baseNewTaxes = cifValueCents + iiCents;
  const cbsCents = phase.cbsActive ? Math.round((baseNewTaxes * phase.cbsRate) / 10000) : 0;
  const ibsCents = phase.ibsActive ? Math.round((baseNewTaxes * phase.ibsRate) / 10000) : 0;
  
  // Selective Tax
  const selectiveConfig = getSelectiveTaxRate(ncmCode);
  const selectiveCents = (selectiveConfig && phase.selectiveActive)
    ? Math.round((baseNewTaxes * selectiveConfig.rate) / 10000)
    : 0;
  
  const totalCents = iiCents + ipiCents + pisCents + cofinsCents + icmsReducedCents + cbsCents + ibsCents + selectiveCents;
  
  return {
    iiCents, ipiCents, pisCents, cofinsCents, icmsReducedCents,
    cbsCents, ibsCents, selectiveCents, totalCents,
  };
}

/**
 * Iterative PIS/COFINS/ICMS calculation (reused from current system)
 */
function calculateIterativePisCofinsIcms(
  baseValue: number,
  pisRate: number,
  cofinsRate: number,
  icmsRate: number,
): { pis: number; cofins: number; icms: number } {
  let icms = 0;
  let pis = 0;
  let cofins = 0;
  const tolerance = 1;
  const maxIterations = 10;
  
  for (let i = 0; i < maxIterations; i++) {
    const icmsAnterior = icms;
    
    const basePisCofins = baseValue + icms;
    const divisorPisCofins = 10000 - pisRate - cofinsRate;
    pis = divisorPisCofins > 0 ? Math.round((basePisCofins * pisRate) / divisorPisCofins) : 0;
    cofins = divisorPisCofins > 0 ? Math.round((basePisCofins * cofinsRate) / divisorPisCofins) : 0;
    
    if (icmsRate > 0) {
      const baseIcms = baseValue + pis + cofins;
      const divisorIcms = 10000 - icmsRate;
      icms = divisorIcms > 0 ? Math.round((baseIcms * icmsRate) / divisorIcms) : 0;
    }
    
    if (Math.abs(icms - icmsAnterior) < tolerance) break;
  }
  
  return { pis, cofins, icms };
}

// ============================================================
// SIMULAÇÃO COMPARATIVA COMPLETA
// ============================================================

/**
 * Perform a full dual-regime tax simulation
 * This is the CORE differentiator - shows the user exactly how the reform impacts their import
 */
export async function simulateReformImpact(
  input: ReformTaxCalculationInput
): Promise<ReformTaxCalculationResult> {
  const referenceYear = input.referenceYear || new Date().getFullYear();
  const phase = getReformPhase(referenceYear);
  
  // Default rates if not provided
  const currentRates = {
    iiRate: input.currentIiRate ?? 1400,
    ipiRate: input.currentIpiRate ?? 0,
    pisRate: input.currentPisRate ?? 216,
    cofinsRate: input.currentCofinsRate ?? 1000,
    icmsRate: input.currentIcmsRate ?? 100, // ICMS antecipado
  };
  
  const insights: string[] = [];
  
  // Always calculate current regime for comparison
  const currentII = Math.round((input.cifValueCents * currentRates.iiRate) / 10000);
  const currentBaseIPI = input.cifValueCents + currentII;
  const currentIPI = Math.round((currentBaseIPI * currentRates.ipiRate) / 10000);
  const currentBaseIterativo = input.cifValueCents + currentII + currentIPI;
  const currentIterResult = calculateIterativePisCofinsIcms(
    currentBaseIterativo,
    currentRates.pisRate,
    currentRates.cofinsRate,
    currentRates.icmsRate
  );
  
  const currentRegime = {
    iiCents: currentII,
    ipiCents: currentIPI,
    pisCents: currentIterResult.pis,
    cofinsCents: currentIterResult.cofins,
    icmsCents: currentIterResult.icms,
    totalCents: currentII + currentIPI + currentIterResult.pis + currentIterResult.cofins + currentIterResult.icms,
  };
  
  // Calculate new regime (full IBS/CBS) for comparison
  const estimatedCbsRate = 880; // ~8.8%
  const estimatedIbsRate = 1700; // ~17%
  const newRegime = calculateNewRegimeTaxes(
    input.cifValueCents,
    currentRates.iiRate,
    estimatedCbsRate,
    estimatedIbsRate,
    input.ncmCode,
  );
  
  // Calculate transition regime if applicable
  let transitionRegime: ReformTaxCalculationResult["transitionRegime"];
  if (referenceYear >= 2026 && referenceYear <= 2032) {
    const transResult = calculateTransitionTaxes(
      input.cifValueCents,
      phase,
      currentRates,
      input.ncmCode,
    );
    transitionRegime = transResult;
  }
  
  // Determine which regime applies
  let regime: "current" | "transition" | "new";
  if (referenceYear < 2026) {
    regime = "current";
  } else if (referenceYear >= 2033) {
    regime = "new";
  } else {
    regime = "transition";
  }
  
  // Comparison
  const currentTotal = currentRegime.totalCents;
  const newTotal = newRegime.totalCents;
  const differenceCents = newTotal - currentTotal;
  const differencePercent = currentTotal > 0 
    ? Math.round((differenceCents / currentTotal) * 10000) / 100 
    : 0;
  
  const impact: "cheaper" | "more_expensive" | "neutral" = 
    differenceCents < -100 ? "cheaper" : 
    differenceCents > 100 ? "more_expensive" : "neutral";
  
  // Generate insights
  if (impact === "cheaper") {
    insights.push(`A reforma tributária reduzirá o custo tributário desta importação em ${Math.abs(differencePercent).toFixed(1)}%.`);
    insights.push(`Economia estimada de R$ ${(Math.abs(differenceCents) / 100).toFixed(2)} por operação.`);
  } else if (impact === "more_expensive") {
    insights.push(`A reforma tributária aumentará o custo tributário desta importação em ${differencePercent.toFixed(1)}%.`);
    insights.push(`Custo adicional estimado de R$ ${(differenceCents / 100).toFixed(2)} por operação.`);
  } else {
    insights.push("O impacto da reforma tributária nesta operação será neutro.");
  }
  
  if (phase.isTestPhase) {
    insights.push(`Em ${referenceYear}, CBS (${(phase.cbsRate / 100).toFixed(1)}%) e IBS (${(phase.ibsRate / 100).toFixed(1)}%) são apenas simulação — sem recolhimento efetivo.`);
  }
  
  if (!phase.pisCofinActive && phase.cbsActive) {
    insights.push("PIS e COFINS foram substituídos pela CBS. O 'cálculo por dentro' foi eliminado, simplificando a tributação.");
  }
  
  if (phase.ibsTransitionPercent > 0 && phase.ibsTransitionPercent < 100) {
    insights.push(`ICMS está em transição: ${phase.ibsTransitionPercent}% já migrou para IBS. Alíquota do ICMS reduzida proporcionalmente.`);
  }
  
  const selectiveConfig = getSelectiveTaxRate(input.ncmCode);
  if (selectiveConfig) {
    insights.push(`Este produto está sujeito ao Imposto Seletivo (${(selectiveConfig.rate / 100).toFixed(1)}%) por ser classificado como ${selectiveConfig.category === "health" ? "prejudicial à saúde" : selectiveConfig.category === "environment" ? "prejudicial ao meio ambiente" : "prejudicial à saúde e ao meio ambiente"}.`);
  }
  
  if (input.isMercosul) {
    insights.push("Produto de origem Mercosul: II reduzido/isento. Este benefício permanece inalterado com a reforma tributária.");
  }
  
  // Effective rates
  const currentEffectiveRate = input.cifValueCents > 0 
    ? Math.round((currentTotal / input.cifValueCents) * 10000) 
    : 0;
  const newEffectiveRate = input.cifValueCents > 0 
    ? Math.round((newTotal / input.cifValueCents) * 10000) 
    : 0;
  const transitionEffectiveRate = transitionRegime && input.cifValueCents > 0
    ? Math.round((transitionRegime.totalCents / input.cifValueCents) * 10000)
    : undefined;
  
  return {
    regime,
    referenceYear,
    phase,
    currentRegime,
    newRegime,
    transitionRegime,
    comparison: {
      currentTotalCents: currentTotal,
      newTotalCents: newTotal,
      differenceCents,
      differencePercent,
      impact,
      savingsOrCostCents: Math.abs(differenceCents),
    },
    effectiveRates: {
      currentEffectiveRate,
      newEffectiveRate,
      transitionEffectiveRate,
    },
    insights,
  };
}

// ============================================================
// SIMULAÇÃO MULTI-ANO (Timeline de impacto)
// ============================================================

export interface YearlyImpact {
  year: number;
  phase: TaxReformPhase;
  totalTaxCents: number;
  effectiveRate: number;
  comparedToCurrentPercent: number;
}

/**
 * Generate a full timeline showing tax impact from 2025 to 2033
 * This creates the "Tax Reform Impact Timeline" visualization
 */
export function generateReformTimeline(
  cifValueCents: number,
  ncmCode: string,
  currentRates: {
    iiRate: number;
    ipiRate: number;
    pisRate: number;
    cofinsRate: number;
    icmsRate: number;
  },
): YearlyImpact[] {
  const timeline: YearlyImpact[] = [];
  
  // Calculate baseline (2025)
  const baselineII = Math.round((cifValueCents * currentRates.iiRate) / 10000);
  const baselineBaseIPI = cifValueCents + baselineII;
  const baselineIPI = Math.round((baselineBaseIPI * currentRates.ipiRate) / 10000);
  const baselineBase = cifValueCents + baselineII + baselineIPI;
  const baselineIter = calculateIterativePisCofinsIcms(
    baselineBase, currentRates.pisRate, currentRates.cofinsRate, currentRates.icmsRate
  );
  const baselineTotal = baselineII + baselineIPI + baselineIter.pis + baselineIter.cofins + baselineIter.icms;
  
  for (let year = 2025; year <= 2033; year++) {
    const phase = getReformPhase(year);
    let totalTaxCents: number;
    
    if (year <= 2025) {
      totalTaxCents = baselineTotal;
    } else if (year >= 2033) {
      const newResult = calculateNewRegimeTaxes(
        cifValueCents, currentRates.iiRate, 880, 1700, ncmCode
      );
      totalTaxCents = newResult.totalCents;
    } else {
      const transResult = calculateTransitionTaxes(
        cifValueCents, phase, currentRates, ncmCode
      );
      totalTaxCents = transResult.totalCents;
    }
    
    const effectiveRate = cifValueCents > 0 
      ? Math.round((totalTaxCents / cifValueCents) * 10000) 
      : 0;
    
    const comparedToCurrentPercent = baselineTotal > 0
      ? Math.round(((totalTaxCents - baselineTotal) / baselineTotal) * 10000) / 100
      : 0;
    
    timeline.push({
      year,
      phase,
      totalTaxCents,
      effectiveRate,
      comparedToCurrentPercent,
    });
  }
  
  return timeline;
}

// ============================================================
// HELPERS E UTILIDADES
// ============================================================

/**
 * Format reform phase for display
 */
export function formatPhaseDescription(phase: TaxReformPhase): string {
  const parts: string[] = [];
  
  if (phase.cbsActive) parts.push(`CBS ${(phase.cbsRate / 100).toFixed(1)}%`);
  if (phase.ibsActive) parts.push(`IBS ${(phase.ibsRate / 100).toFixed(1)}%`);
  if (phase.pisCofinActive) parts.push("PIS/COFINS");
  if (phase.ipiActive) parts.push("IPI");
  if (phase.icmsActive) {
    if (phase.ibsTransitionPercent > 0) {
      parts.push(`ICMS (${100 - phase.ibsTransitionPercent}%)`);
    } else {
      parts.push("ICMS");
    }
  }
  if (phase.selectiveActive) parts.push("IS");
  
  return parts.join(" + ");
}

/**
 * Get a human-readable summary of what changes in a given year
 */
export function getYearChangeSummary(year: number): string {
  const phase = getReformPhase(year);
  return phase.description;
}

/**
 * Check if reform affects a specific NCM code
 * Some products may have special treatment under the reform
 */
export function getReformSpecialTreatment(ncmCode: string): {
  hasSpecialTreatment: boolean;
  description?: string;
  type?: "reduced_rate" | "exempt" | "selective_tax" | "zona_franca";
} {
  const cleanNcm = ncmCode.replace(/\D/g, "");
  
  // Check for Selective Tax
  const selective = getSelectiveTaxRate(ncmCode);
  if (selective) {
    return {
      hasSpecialTreatment: true,
      description: `Sujeito ao Imposto Seletivo: ${selective.description} (${(selective.rate / 100).toFixed(1)}%)`,
      type: "selective_tax",
    };
  }
  
  // Basic food items (cesta básica) - reduced CBS/IBS rates
  const basicFoodNcms = ["0201", "0202", "0207", "0302", "0401", "0402", "1001", "1005", "1006"];
  if (basicFoodNcms.some(prefix => cleanNcm.startsWith(prefix))) {
    return {
      hasSpecialTreatment: true,
      description: "Produto da cesta básica: alíquota reduzida de CBS/IBS",
      type: "reduced_rate",
    };
  }
  
  return { hasSpecialTreatment: false };
}
