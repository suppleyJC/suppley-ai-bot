import { getNcmTaxRate, getIcmsRate } from "../db";

/**
 * Tax Calculation Service - SUPPLEY Calc
 * 
 * Implementa cálculos tributários conforme legislação brasileira vigente (2026):
 * - Lei 10.865/2004 (PIS/COFINS Importação)
 * - LC 224/2025 (acréscimo COFINS-Importação 2026: +0,6%)
 * - Decreto 6.759/2009 (Regulamento Aduaneiro)
 * - Resolução Senado 13/2012 (ICMS 4% interestadual para importados)
 * - TTD 409/SC (Tratamento Tributário Diferenciado)
 * 
 * Todas as alíquotas em basis points (1% = 100, 10% = 1000)
 * Todos os valores monetários em centavos (R$ 1,00 = 100)
 */

// ============================================================
// CONSTANTES - Alíquotas padrão vigentes em 2026
// ============================================================

/** PIS-Importação: 2,1% (Lei 10.865/2004, art. 8º, I) */
const DEFAULT_PIS_IMPORT_RATE = 210;

/** COFINS-Importação: 9,65% + 0,6% acréscimo (LC 224/2025) = 10,25% */
const DEFAULT_COFINS_IMPORT_RATE = 1025;

/** II padrão quando NCM não encontrado (14% - média TEC) */
const DEFAULT_II_RATE = 1400;

/** IPI padrão quando NCM não encontrado (0%) */
const DEFAULT_IPI_RATE = 0;

/** ICMS interno padrão (17%) */
const DEFAULT_ICMS_INTERNAL_RATE = 1700;

/** ICMS interestadual para produtos importados (Resolução Senado 13/2012) */
const ICMS_INTERESTADUAL_IMPORTADOS = 400;

/** ICMS Antecipado SC - TTD 409 após 36 meses (1%) */
const ICMS_ANTECIPADO_SC_APOS_36M = 100;

/** ICMS Antecipado SC - TTD 409 primeiros 36 meses (2,6%) */
const ICMS_ANTECIPADO_SC_PRIMEIROS_36M = 260;

/** AFRMM - Adicional ao Frete para Renovação da Marinha Mercante (25%) */
const AFRMM_RATE = 2500;

/** Taxa Siscomex base (R$ 185,00 = 18500 centavos) */
const SISCOMEX_BASE_CENTS = 18500;

/** Taxa Siscomex por item adicional (R$ 29,50 = 2950 centavos) */
const SISCOMEX_ITEM_ADICIONAL_CENTS = 2950;

// ============================================================
// MERCOSUL
// ============================================================

export const MERCOSUL_COUNTRIES = [
  "Paraguai", "Paraguay",
  "Argentina",
  "Uruguai", "Uruguay",
  "Venezuela",
  "Bolívia", "Bolivia", // Em processo de adesão
];

export function isMercosulCountry(country: string): boolean {
  return MERCOSUL_COUNTRIES.some(c =>
    c.toLowerCase() === country.toLowerCase()
  );
}

// ============================================================
// TIPOS
// ============================================================

export interface TaxRates {
  ii: number;      // Imposto de Importação (basis points)
  ipi: number;     // IPI (basis points)
  pis: number;     // PIS-Importação (basis points)
  cofins: number;  // COFINS-Importação (basis points)
  icms: number;    // ICMS na importação (basis points) - antecipado ou cheio
}

export interface TaxCalculationInput {
  cifValueCents: number;
  ncmCode: string;
  originCountry: string;
  destinationState: string;
  isMercosul?: boolean;
  freightCents?: number;       // Frete marítimo para cálculo AFRMM
  numItems?: number;           // Número de itens para Siscomex
  ttdPhase?: "primeiros_36m" | "apos_36m"; // Fase do TTD 409
}

export interface TaxCalculationResult {
  rates: TaxRates;
  values: {
    iiValueCents: number;
    ipiValueCents: number;
    pisValueCents: number;
    cofinsValueCents: number;
    icmsValueCents: number;
    afrmmValueCents: number;
    siscomexValueCents: number;
    totalTaxesCents: number;
  };
  breakdown: {
    baseII: number;
    baseIPI: number;
    basePISCOFINS: number;
    baseICMS: number;
  };
  isMercosulPreferential: boolean;
}

// ============================================================
// CÁLCULO DE IMPOSTOS NA IMPORTAÇÃO
// ============================================================

/**
 * Busca alíquotas aplicáveis para um NCM + estado + origem
 */
export async function getTaxRatesForNcm(
  ncmCode: string,
  destinationState: string,
  isMercosul: boolean,
  ttdPhase?: "primeiros_36m" | "apos_36m"
): Promise<TaxRates> {
  const ncmRates = await getNcmTaxRate(ncmCode);
  const icmsRate = await getIcmsRate(destinationState);

  // II: 0% para Mercosul com certificado de origem
  let iiRate = ncmRates?.iiRate ?? DEFAULT_II_RATE;
  if (isMercosul) {
    iiRate = ncmRates?.mercosulIiRate ?? 0;
  }

  // PIS e COFINS: usar do NCM se disponível, senão padrão 2026
  const pisRate = ncmRates?.pisRate ?? DEFAULT_PIS_IMPORT_RATE;
  const cofinsRate = ncmRates?.cofinsRate ?? DEFAULT_COFINS_IMPORT_RATE;

  // ICMS na importação: depende do estado e benefício fiscal
  let icmsImportRate: number;
  if (icmsRate?.hasIncentive && destinationState.toUpperCase() === "SC") {
    // TTD 409 - Santa Catarina
    icmsImportRate = ttdPhase === "primeiros_36m"
      ? ICMS_ANTECIPADO_SC_PRIMEIROS_36M
      : (icmsRate.icmsAntecipadoRate ?? ICMS_ANTECIPADO_SC_APOS_36M);
  } else if (icmsRate?.hasIncentive) {
    // Outros estados com incentivo
    icmsImportRate = icmsRate.icmsAntecipadoRate ?? icmsRate.internalRate ?? DEFAULT_ICMS_INTERNAL_RATE;
  } else {
    // Sem incentivo: ICMS cheio do estado (calculado "por dentro")
    icmsImportRate = icmsRate?.internalRate ?? DEFAULT_ICMS_INTERNAL_RATE;
  }

  return {
    ii: iiRate,
    ipi: ncmRates?.ipiRate ?? DEFAULT_IPI_RATE,
    pis: pisRate,
    cofins: cofinsRate,
    icms: icmsImportRate,
  };
}

/**
 * Calcula todos os impostos de importação
 * 
 * Sequência conforme legislação:
 * 1. II = CIF × Alíquota II
 * 2. IPI = (CIF + II) × Alíquota IPI
 * 3. PIS = CIF × Alíquota PIS (base = valor aduaneiro, Lei 10.865/2004)
 * 4. COFINS = CIF × Alíquota COFINS (base = valor aduaneiro, Lei 10.865/2004)
 * 5. ICMS = (CIF + II + IPI + PIS + COFINS + Despesas) / (1 - Alíquota ICMS) × Alíquota ICMS
 *    OU para TTD 409/SC: Base ICMS × Alíquota Antecipada
 * 6. AFRMM = Frete Marítimo × 25%
 * 7. Siscomex = R$ 185,00 + R$ 29,50/item adicional
 * 
 * NOTA: A base de PIS/COFINS na importação é o VALOR ADUANEIRO (CIF),
 * conforme Lei 10.865/2004, art. 7º. NÃO inclui II e IPI na base.
 * Isso difere do cálculo antigo que usava base iterativa.
 */
export async function calculateImportTaxes(
  input: TaxCalculationInput
): Promise<TaxCalculationResult> {
  const {
    cifValueCents,
    ncmCode,
    originCountry,
    destinationState,
    freightCents = 0,
    numItems = 1,
    ttdPhase,
  } = input;

  const isMercosul = input.isMercosul ?? isMercosulCountry(originCountry);
  const rates = await getTaxRatesForNcm(ncmCode, destinationState, isMercosul, ttdPhase);
  const icmsRate = await getIcmsRate(destinationState);
  const hasIncentive = icmsRate?.hasIncentive && destinationState.toUpperCase() === "SC";

  // 1. II (Imposto de Importação)
  // Base: CIF (valor aduaneiro)
  const baseII = cifValueCents;
  const iiValueCents = Math.round((baseII * rates.ii) / 10000);

  // 2. IPI (Imposto sobre Produtos Industrializados)
  // Base: CIF + II
  const baseIPI = cifValueCents + iiValueCents;
  const ipiValueCents = Math.round((baseIPI * rates.ipi) / 10000);

  // 3. PIS-Importação
  // Base: Valor Aduaneiro (CIF) - Lei 10.865/2004, art. 7º
  const basePISCOFINS = cifValueCents;
  const pisValueCents = Math.round((basePISCOFINS * rates.pis) / 10000);

  // 4. COFINS-Importação
  // Base: Valor Aduaneiro (CIF) - Lei 10.865/2004, art. 7º
  const cofinsValueCents = Math.round((basePISCOFINS * rates.cofins) / 10000);

  // 5. ICMS
  let icmsValueCents: number;
  let baseICMS: number;

  if (hasIncentive) {
    // TTD 409/SC: ICMS antecipado sobre a base de cálculo
    // Base ICMS = CIF + II + IPI + PIS + COFINS
    baseICMS = cifValueCents + iiValueCents + ipiValueCents + pisValueCents + cofinsValueCents;
    icmsValueCents = Math.round((baseICMS * rates.icms) / 10000);
  } else {
    // ICMS cheio "por dentro" (incluso na própria base)
    // Base ICMS = (CIF + II + IPI + PIS + COFINS + Despesas Aduaneiras) / (1 - Alíquota ICMS)
    // ICMS = Base ICMS × Alíquota ICMS
    const somaParcial = cifValueCents + iiValueCents + ipiValueCents + pisValueCents + cofinsValueCents;
    const divisor = 10000 - rates.icms;
    baseICMS = Math.round((somaParcial * 10000) / divisor);
    icmsValueCents = Math.round((baseICMS * rates.icms) / 10000);
  }

  // 6. AFRMM (apenas frete marítimo)
  const afrmmValueCents = Math.round((freightCents * AFRMM_RATE) / 10000);

  // 7. Siscomex
  const siscomexValueCents = SISCOMEX_BASE_CENTS + Math.max(0, (numItems - 1)) * SISCOMEX_ITEM_ADICIONAL_CENTS;

  // Total de impostos
  const totalTaxesCents = iiValueCents + ipiValueCents + pisValueCents +
    cofinsValueCents + icmsValueCents + afrmmValueCents + siscomexValueCents;

  return {
    rates,
    values: {
      iiValueCents,
      ipiValueCents,
      pisValueCents,
      cofinsValueCents,
      icmsValueCents,
      afrmmValueCents,
      siscomexValueCents,
      totalTaxesCents,
    },
    breakdown: {
      baseII,
      baseIPI,
      basePISCOFINS,
      baseICMS,
    },
    isMercosulPreferential: isMercosul && rates.ii === 0,
  };
}

// ============================================================
// PREÇO DE VENDA E MARKUP
// ============================================================

/**
 * Calcula preço de venda com markup sobre custo
 * Preço = Custo × (1 + Markup%)
 */
export function calculateSellingPrice(
  totalCostCents: number,
  markupPercent: number // basis points (30% = 3000)
): number {
  return Math.round(totalCostCents * (10000 + markupPercent) / 10000);
}

/**
 * Calcula margem a partir do preço de venda
 * Margem = (Preço - Custo) / Preço
 */
export function calculateMargin(
  sellingPriceCents: number,
  totalCostCents: number
): number {
  if (sellingPriceCents === 0) return 0;
  return Math.round(((sellingPriceCents - totalCostCents) / sellingPriceCents) * 10000);
}

// ============================================================
// IMPOSTOS SOBRE VENDA
// ============================================================

export type TaxRegime = "simples_nacional" | "lucro_presumido" | "lucro_real";

/**
 * Simples Nacional - Anexo I (Comércio)
 * Faixas de faturamento em centavos (R$ 180.000 = 18.000.000 centavos)
 */
export const SIMPLES_NACIONAL_BRACKETS = [
  { faixa: 1, limiteInferior: 0, limiteSuperior: 18000000, aliquota: 400, deducao: 0 },
  { faixa: 2, limiteInferior: 18000000, limiteSuperior: 36000000, aliquota: 730, deducao: 594000 },
  { faixa: 3, limiteInferior: 36000000, limiteSuperior: 72000000, aliquota: 950, deducao: 1386000 },
  { faixa: 4, limiteInferior: 72000000, limiteSuperior: 180000000, aliquota: 1070, deducao: 2250000 },
  { faixa: 5, limiteInferior: 180000000, limiteSuperior: 360000000, aliquota: 1430, deducao: 8730000 },
  { faixa: 6, limiteInferior: 360000000, limiteSuperior: 480000000, aliquota: 1900, deducao: 25620000 },
];

export interface SaleTaxes {
  icmsOnSale: number;
  pisOnSale: number;
  cofinsOnSale: number;
  irpj: number;
  csll: number;
  simplesTotal?: number;
  totalTaxesOnSale: number;
  effectiveRate: number; // basis points
  // Detalhamento de créditos (Lucro Real)
  pisCredito?: number;
  cofinsCredito?: number;
  icmsCredito?: number;
}

export interface SaleTaxInput {
  sellingPriceCents: number;
  costCents: number;           // CMV para cálculo de créditos
  stateCode: string;
  taxRegime: TaxRegime;
  simplesAliquota?: number;    // Alíquota efetiva do Simples (basis points)
  simplesFaixa?: number;
  icmsPagoImportacaoCents?: number; // ICMS efetivamente pago na importação (para crédito)
}

/**
 * Calcula impostos sobre a venda conforme regime tributário
 */
export function calculateSaleTaxes(input: SaleTaxInput): SaleTaxes {
  const { taxRegime } = input;

  switch (taxRegime) {
    case "simples_nacional":
      return calculateSimplesNacionalTaxes(input);
    case "lucro_presumido":
      return calculateLucroPresumidoTaxes(input);
    case "lucro_real":
      return calculateLucroRealTaxes(input);
    default:
      return calculateLucroPresumidoTaxes(input);
  }
}

/**
 * Simples Nacional
 * Alíquota única sobre faturamento (inclui todos os tributos)
 */
function calculateSimplesNacionalTaxes(input: SaleTaxInput): SaleTaxes {
  const { sellingPriceCents, simplesAliquota = 400 } = input;
  const simplesTotal = Math.round((sellingPriceCents * simplesAliquota) / 10000);

  return {
    icmsOnSale: 0,
    pisOnSale: 0,
    cofinsOnSale: 0,
    irpj: 0,
    csll: 0,
    simplesTotal,
    totalTaxesOnSale: simplesTotal,
    effectiveRate: simplesAliquota,
  };
}

/**
 * Lucro Presumido (regime cumulativo)
 * 
 * PIS: 0,65% sobre receita bruta (cumulativo, sem crédito)
 * COFINS: 3% sobre receita bruta (cumulativo, sem crédito)
 * IRPJ: 15% sobre base presumida (8% da receita para comércio)
 *        + adicional 10% se base presumida > R$ 20.000/mês (R$ 60.000/trimestre)
 * CSLL: 9% sobre base presumida (12% da receita)
 * ICMS: alíquota interna do estado (débito na saída)
 *        - Crédito: ICMS pago na importação (se houver)
 * 
 * NOTA: No Lucro Presumido, PIS/COFINS são cumulativos (sem crédito).
 * Porém o ICMS permite crédito do imposto pago na entrada.
 */
function calculateLucroPresumidoTaxes(input: SaleTaxInput): SaleTaxes {
  const { sellingPriceCents, stateCode, icmsPagoImportacaoCents = 0 } = input;

  // PIS e COFINS cumulativos
  const pisOnSale = Math.round((sellingPriceCents * 65) / 10000);     // 0,65%
  const cofinsOnSale = Math.round((sellingPriceCents * 300) / 10000); // 3%

  // IRPJ: 15% sobre base presumida (8% da receita para comércio)
  const basePresumidaIrpj = Math.round((sellingPriceCents * 800) / 10000);
  let irpj = Math.round((basePresumidaIrpj * 1500) / 10000);
  // Adicional de 10% sobre excedente de R$ 20.000/mês (R$ 60.000/trimestre)
  // Simplificação: se base presumida > R$ 20.000 (2.000.000 centavos), aplica adicional
  const limiteAdicionalCents = 2000000; // R$ 20.000
  if (basePresumidaIrpj > limiteAdicionalCents) {
    irpj += Math.round(((basePresumidaIrpj - limiteAdicionalCents) * 1000) / 10000);
  }

  // CSLL: 9% sobre base presumida (12% da receita)
  const basePresumidaCsll = Math.round((sellingPriceCents * 1200) / 10000);
  const csll = Math.round((basePresumidaCsll * 900) / 10000);

  // ICMS: débito na saída - crédito da importação
  const icmsRate = getIcmsInternalRateByState(stateCode);
  const icmsDebito = Math.round((sellingPriceCents * icmsRate) / 10000);
  const icmsCredito = icmsPagoImportacaoCents;
  const icmsOnSale = Math.max(0, icmsDebito - icmsCredito);

  const totalTaxesOnSale = pisOnSale + cofinsOnSale + irpj + csll + icmsOnSale;
  const effectiveRate = sellingPriceCents > 0
    ? Math.round((totalTaxesOnSale / sellingPriceCents) * 10000)
    : 0;

  return {
    icmsOnSale,
    pisOnSale,
    cofinsOnSale,
    irpj,
    csll,
    totalTaxesOnSale,
    effectiveRate,
    icmsCredito,
  };
}

/**
 * Lucro Real (regime não-cumulativo)
 * 
 * PIS: 1,65% sobre receita - crédito de 1,65% sobre custos
 * COFINS: 7,6% sobre receita - crédito de 7,6% sobre custos
 * IRPJ: 15% sobre lucro real + adicional 10% (se lucro > R$ 20.000/mês)
 * CSLL: 9% sobre lucro real
 * ICMS: alíquota interna do estado - crédito do ICMS pago na importação
 * 
 * NOTA: No Lucro Real, o crédito de PIS/COFINS é sobre o CUSTO de aquisição
 * (incluindo o valor aduaneiro + impostos que compõem o custo).
 * O crédito de ICMS é o valor efetivamente pago na importação.
 */
function calculateLucroRealTaxes(input: SaleTaxInput): SaleTaxes {
  const {
    sellingPriceCents,
    costCents,
    stateCode,
    icmsPagoImportacaoCents = 0,
  } = input;

  // PIS não-cumulativo: débito - crédito
  const pisSaidaRate = 165;  // 1,65%
  const pisSaida = Math.round((sellingPriceCents * pisSaidaRate) / 10000);
  const pisCredito = Math.round((costCents * pisSaidaRate) / 10000);
  const pisOnSale = Math.max(0, pisSaida - pisCredito);

  // COFINS não-cumulativo: débito - crédito
  const cofinsSaidaRate = 760; // 7,6%
  const cofinsSaida = Math.round((sellingPriceCents * cofinsSaidaRate) / 10000);
  const cofinsCredito = Math.round((costCents * cofinsSaidaRate) / 10000);
  const cofinsOnSale = Math.max(0, cofinsSaida - cofinsCredito);

  // ICMS: débito na saída - crédito da importação
  const icmsRate = getIcmsInternalRateByState(stateCode);
  const icmsDebito = Math.round((sellingPriceCents * icmsRate) / 10000);
  const icmsCredito = icmsPagoImportacaoCents;
  const icmsOnSale = Math.max(0, icmsDebito - icmsCredito);

  // Lucro para IRPJ e CSLL
  const lucroReal = sellingPriceCents - costCents - pisOnSale - cofinsOnSale - icmsOnSale;

  // IRPJ: 15% sobre lucro real
  let irpj = 0;
  if (lucroReal > 0) {
    irpj = Math.round((lucroReal * 1500) / 10000);
    // Adicional de 10% sobre excedente de R$ 20.000/mês
    const limiteAdicionalCents = 2000000;
    if (lucroReal > limiteAdicionalCents) {
      irpj += Math.round(((lucroReal - limiteAdicionalCents) * 1000) / 10000);
    }
  }

  // CSLL: 9% sobre lucro real
  const csll = lucroReal > 0 ? Math.round((lucroReal * 900) / 10000) : 0;

  const totalTaxesOnSale = pisOnSale + cofinsOnSale + irpj + csll + icmsOnSale;
  const effectiveRate = sellingPriceCents > 0
    ? Math.round((totalTaxesOnSale / sellingPriceCents) * 10000)
    : 0;

  return {
    icmsOnSale,
    pisOnSale,
    cofinsOnSale,
    irpj,
    csll,
    totalTaxesOnSale,
    effectiveRate,
    pisCredito,
    cofinsCredito,
    icmsCredito,
  };
}

// ============================================================
// ANÁLISE DE PREÇO ALVO
// ============================================================

export interface TargetPriceAnalysis {
  targetPriceCents: number;
  isViable: boolean;
  grossMarginPercent: number;
  netMarginPercent: number;
  cmvPercent: number;
  taxesOnSaleCents: number;
  effectiveTaxRate: number;
  maxPurchasePriceCents: number;
  currentPurchasePriceCents: number;
  requiredReductionCents: number;
  requiredReductionPercent: number;
  grossProfitCents: number;
  netProfitCents: number;
}

export interface TargetPriceInput {
  targetPriceCents: number;
  totalCostCents: number;
  fobValueCents: number;
  taxRegime: TaxRegime;
  stateCode: string;
  desiredMarginPercent?: number; // basis points (20% = 2000)
  simplesAliquota?: number;
  icmsPagoImportacaoCents?: number;
}

/**
 * Analisa viabilidade de um preço alvo de venda
 */
export function calculateTargetPriceAnalysis(input: TargetPriceInput): TargetPriceAnalysis {
  const {
    targetPriceCents,
    totalCostCents,
    fobValueCents,
    taxRegime,
    stateCode,
    desiredMarginPercent = 2000,
    simplesAliquota,
    icmsPagoImportacaoCents = 0,
  } = input;

  // Calcular impostos sobre venda no preço alvo
  const saleTaxes = calculateSaleTaxes({
    sellingPriceCents: targetPriceCents,
    costCents: totalCostCents,
    stateCode,
    taxRegime,
    simplesAliquota,
    icmsPagoImportacaoCents,
  });

  // Margem bruta (antes de impostos sobre venda)
  const grossProfitCents = targetPriceCents - totalCostCents;
  const grossMarginPercent = targetPriceCents > 0
    ? Math.round((grossProfitCents / targetPriceCents) * 10000)
    : 0;

  // Lucro líquido (após impostos sobre venda)
  const netProfitCents = grossProfitCents - saleTaxes.totalTaxesOnSale;
  const netMarginPercent = targetPriceCents > 0
    ? Math.round((netProfitCents / targetPriceCents) * 10000)
    : 0;

  // CMV como % do preço
  const cmvPercent = targetPriceCents > 0
    ? Math.round((totalCostCents / targetPriceCents) * 10000)
    : 0;

  // Viabilidade
  const isViable = netProfitCents >= 0;

  // Custo máximo para atingir margem desejada
  const effectiveTaxRate = saleTaxes.effectiveRate;
  const maxCostPercent = 10000 - desiredMarginPercent - effectiveTaxRate;
  const maxTotalCostCents = Math.round((targetPriceCents * maxCostPercent) / 10000);

  // FOB máximo (proporção FOB/Custo Total)
  const fobToTotalRatio = fobValueCents > 0 && totalCostCents > 0
    ? fobValueCents / totalCostCents
    : 0.45;
  const maxPurchasePriceCents = Math.round(maxTotalCostCents * fobToTotalRatio);

  // Redução necessária no FOB
  const requiredReductionCents = Math.max(0, fobValueCents - maxPurchasePriceCents);
  const requiredReductionPercent = fobValueCents > 0
    ? Math.round((requiredReductionCents / fobValueCents) * 10000)
    : 0;

  return {
    targetPriceCents,
    isViable,
    grossMarginPercent,
    netMarginPercent,
    cmvPercent,
    taxesOnSaleCents: saleTaxes.totalTaxesOnSale,
    effectiveTaxRate,
    maxPurchasePriceCents,
    currentPurchasePriceCents: fobValueCents,
    requiredReductionCents,
    requiredReductionPercent,
    grossProfitCents,
    netProfitCents,
  };
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

/**
 * Retorna alíquota interna de ICMS por estado (para cálculo na venda)
 * Valores atualizados 2026
 */
function getIcmsInternalRateByState(stateCode: string): number {
  const rates: Record<string, number> = {
    "AC": 1900, "AL": 1900, "AP": 1800, "AM": 2000,
    "BA": 2050, "CE": 2000, "DF": 2000, "ES": 1700,
    "GO": 1900, "MA": 2200, "MT": 1700, "MS": 1700,
    "MG": 1800, "PA": 1900, "PB": 2000, "PR": 1950,
    "PE": 2000, "PI": 2100, "RJ": 2000, "RN": 2000,
    "RS": 1700, "RO": 1950, "RR": 2000, "SC": 1700,
    "SP": 1800, "SE": 1900, "TO": 2000,
  };
  return rates[stateCode.toUpperCase()] || DEFAULT_ICMS_INTERNAL_RATE;
}

/**
 * Calcula AFRMM separadamente (útil para cálculos parciais)
 */
export function calculateAFRMM(freightCents: number): number {
  return Math.round((freightCents * AFRMM_RATE) / 10000);
}

/**
 * Calcula taxa Siscomex
 */
export function calculateSiscomex(numItems: number): number {
  return SISCOMEX_BASE_CENTS + Math.max(0, (numItems - 1)) * SISCOMEX_ITEM_ADICIONAL_CENTS;
}

/**
 * Calcula alíquota efetiva do Simples Nacional pela faixa
 * Fórmula: (RBT12 × Aliq - PD) / RBT12
 * Onde: RBT12 = Receita Bruta 12 meses, Aliq = Alíquota nominal, PD = Parcela a deduzir
 */
export function calculateSimplesEffectiveRate(
  receitaBruta12MesesCents: number
): { faixa: number; aliquotaEfetiva: number; aliquotaNominal: number } {
  const bracket = SIMPLES_NACIONAL_BRACKETS.find(
    b => receitaBruta12MesesCents >= b.limiteInferior && receitaBruta12MesesCents < b.limiteSuperior
  ) || SIMPLES_NACIONAL_BRACKETS[0];

  if (receitaBruta12MesesCents <= 0) {
    return { faixa: 1, aliquotaEfetiva: 400, aliquotaNominal: 400 };
  }

  // Alíquota efetiva = (RBT12 × Aliq - PD) / RBT12
  const aliquotaEfetiva = Math.round(
    ((receitaBruta12MesesCents * bracket.aliquota / 10000) - bracket.deducao) /
    receitaBruta12MesesCents * 10000
  );

  return {
    faixa: bracket.faixa,
    aliquotaEfetiva: Math.max(aliquotaEfetiva, 0),
    aliquotaNominal: bracket.aliquota,
  };
}

/**
 * Calcula DIFAL (Diferencial de Alíquota) para vendas interestaduais
 * Aplicável quando vende produto importado para outro estado
 * 
 * DIFAL = (Alíquota Interna Destino - Alíquota Interestadual) × Base
 * Para produtos importados: interestadual = 4% (Res. Senado 13/2012)
 */
export function calculateDIFAL(
  valueCents: number,
  destinationState: string
): { difal: number; aliquotaInterna: number; aliquotaInterestadual: number } {
  const aliquotaInterna = getIcmsInternalRateByState(destinationState);
  const aliquotaInterestadual = ICMS_INTERESTADUAL_IMPORTADOS; // 4% para importados

  const difal = Math.round((valueCents * (aliquotaInterna - aliquotaInterestadual)) / 10000);

  return {
    difal: Math.max(0, difal),
    aliquotaInterna,
    aliquotaInterestadual,
  };
}
