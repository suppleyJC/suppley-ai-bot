import { getExchangeRate } from "./exchangeService";
import { calculateImportTaxes, calculateSellingPrice, isMercosulCountry, TaxCalculationResult, calculateSaleTaxes, calculateTargetPriceAnalysis, calculateFinancialCosts, calculateTTD409, calculateCustomsValueAdjustments, calculateAdjustedCustomsValue, type TaxRegime, type SaleTaxes, type TargetPriceAnalysis } from "./taxCalculationService";
import { createImportCalculation, getCompanySettings } from "../db";
import { InsertImportCalculation } from "../../drizzle/schema";

export interface ImportCalculationInput {
  userId: number;
  productId?: number;
  supplierId?: number;

  // Product info
  productName: string;
  ncmCode: string;
  quantity: number;
  unit?: string;

  // Origin info
  originCountry: string;
  destinationState?: string;

  // Values
  fobValue: number; // FOB value in original currency
  fobCurrency: string;
  freight?: number; // Freight cost in original currency
  insurance?: number; // Insurance cost in original currency

  // Additional costs (in BRL)
  customsBrokerBrl?: number;
  storageBrl?: number;
  otherCostsBrl?: number;

  // Markup
  markupPercent?: number; // In basis points (30% = 3000)

  // TTD 409 (Santa Catarina)
  isTTD409?: boolean; // Apply TTD 409 benefits
  ttdMonthsSinceGrant?: number; // Months since grant start

  // Financial costs
  spreadPercent?: number; // Spread cambial (basis points, e.g., 200 = 2%)
  iofRate?: number; // IOF rate (basis points, default 193 = 1,93%)

  // Customs value adjustments (ajustes de valor aduaneiro)
  royaltiesBrl?: number; // Royalties / Licenças (adicionado ao valor aduaneiro)
  assistsBrl?: number; // Assists / Insumos fornecidos
  commissionsBrl?: number; // Comissões de compra

  // Target price for analysis (optional)
  targetPriceBrl?: number;
}

export interface ImportCalculationOutput {
  // Exchange rate info
  exchangeRate: number;
  exchangeSource: string;

  // Values in original currency
  fobOriginal: number;
  freightOriginal: number;
  insuranceOriginal: number;
  cifOriginal: number;

  // Values in BRL
  fobBrl: number;
  freightBrl: number;
  insuranceBrl: number;
  cifBrl: number;

  // Tax calculation
  taxes: TaxCalculationResult;

  // Additional costs
  customsBrokerBrl: number;
  storageBrl: number;
  otherCostsBrl: number;

  // TTD SC (ICMS diferido/antecipado)
  icmsAntecipadoBrl: number;
  icmsDiferidoBrl: number;

  // Financial costs
  spreadBrl: number; // Spread cambial
  iofBrl: number; // IOF

  // Customs value adjustments
  royaltiesBrl: number; // Royalties / Licenças
  assistsBrl: number; // Assists / Insumos fornecidos
  commissionsBrl: number; // Comissões de compra
  adjustedCustomsValueBrl: number; // CIF + ajustes (base para impostos)

  // Final values
  totalCostBrl: number;
  unitCostBrl: number;

  // Pricing
  markupPercent: number;
  suggestedPriceBrl: number;
  suggestedUnitPriceBrl: number;

  // Profitability
  grossProfitBrl: number;
  grossMarginPercent: number;

  // Flags
  isMercosul: boolean;

  // Tax Regime Info
  taxRegime: TaxRegime;
  saleTaxes: SaleTaxes;

  // Target Price Analysis (if target price provided)
  targetAnalysis?: TargetPriceAnalysis;

  // Saved calculation ID (if saved)
  calculationId?: number;
}

/**
 * Perform complete import calculation
 */
export async function performImportCalculation(
  input: ImportCalculationInput
): Promise<ImportCalculationOutput> {
  // Get company settings for defaults
  const settings = await getCompanySettings(input.userId);
  
  // Set defaults
  const destinationState = input.destinationState || settings?.stateCode || "SC";
  const markupPercent = input.markupPercent ?? settings?.defaultMarkupPercent ?? 3000;
  const customsBrokerBrl = input.customsBrokerBrl ?? (settings?.defaultCustomsBrokerCents ? settings.defaultCustomsBrokerCents / 100 : 1500);
  const storageBrl = input.storageBrl ?? (settings?.defaultStorageCents ? settings.defaultStorageCents / 100 : 500);
  const otherCostsBrl = input.otherCostsBrl ?? 0;
  
  // Determine if Mercosul
  const isMercosul = isMercosulCountry(input.originCountry);
  
  // Get exchange rate
  const { rate: exchangeRate, source: exchangeSource } = await getExchangeRate(
    input.fobCurrency,
    "BRL"
  );
  
  // Calculate CIF in original currency
  const fobOriginal = input.fobValue;
  const freightOriginal = input.freight ?? 0;
  const insuranceOriginal = input.insurance ?? 0;
  const cifOriginal = fobOriginal + freightOriginal + insuranceOriginal;
  
  // Convert to BRL
  const fobBrl = fobOriginal * exchangeRate;
  const freightBrl = freightOriginal * exchangeRate;
  const insuranceBrl = insuranceOriginal * exchangeRate;
  const cifBrl = cifOriginal * exchangeRate;
  
  // Calculate taxes
  const cifCents = Math.round(cifBrl * 100);
  const freightBrlCents = Math.round(freightBrl * 100);
  const taxes = await calculateImportTaxes({
    cifValueCents: cifCents,
    ncmCode: input.ncmCode,
    originCountry: input.originCountry,
    destinationState,
    isMercosul,
    freightCents: freightBrlCents,
    numItems: 1,
    ttdPhase: input.isTTD409 ? (input.ttdMonthsSinceGrant ?? 0 < 36 * 12 ? "primeiros_36m" : "apos_36m") : undefined,
  });

  // Calculate TTD 409 (Santa Catarina) - if eligible
  let icmsAntecipadoBrl = 0;
  let icmsDiferidoBrl = 0;
  if (input.isTTD409 && destinationState.toUpperCase() === "SC") {
    const ttd409Result = calculateTTD409({
      cifValueCents: cifCents,
      months: input.ttdMonthsSinceGrant,
    });
    icmsAntecipadoBrl = ttd409Result.icmsAntecipadoCents / 100;
    icmsDiferidoBrl = ttd409Result.icmsDiferidoCents / 100;
  }

  // Calculate financial costs (IOF + Spread)
  const financialCosts = calculateFinancialCosts({
    fobValueOriginalCurrency: fobOriginal * 100, // Convert to cents
    exchangeRate: Math.round(exchangeRate * 1000000), // * 1.000.000 for precision
    spreadPercent: input.spreadPercent,
    iofRate: input.iofRate,
  });
  const spreadBrl = financialCosts.spreadCents / 100;
  const iofBrl = financialCosts.iofCents / 100;

  // Calculate customs value adjustments
  const royaltiesBrl = input.royaltiesBrl ?? 0;
  const assistsBrl = input.assistsBrl ?? 0;
  const commissionsBrl = input.commissionsBrl ?? 0;
  const customsAdjustments = calculateCustomsValueAdjustments({
    royaltiesCents: Math.round(royaltiesBrl * 100),
    assistsCents: Math.round(assistsBrl * 100),
    commissionsCents: Math.round(commissionsBrl * 100),
  });
  const adjustedCustomsValueBrl = calculateAdjustedCustomsValue(
    Math.round(cifBrl * 100),
    customsAdjustments
  ) / 100;

  // Calculate total cost
  const totalTaxesBrl = taxes.values.totalTaxesCents / 100;
  const totalCostBrl = adjustedCustomsValueBrl + totalTaxesBrl + customsBrokerBrl + storageBrl + otherCostsBrl + spreadBrl + iofBrl;
  const unitCostBrl = totalCostBrl / input.quantity;
  
  // Calculate suggested price
  const totalCostCents = Math.round(totalCostBrl * 100);
  const suggestedPriceCents = calculateSellingPrice(totalCostCents, markupPercent);
  const suggestedPriceBrl = suggestedPriceCents / 100;
  const suggestedUnitPriceBrl = suggestedPriceBrl / input.quantity;
  
  // Calculate profitability
  const grossProfitBrl = suggestedPriceBrl - totalCostBrl;
  const grossMarginPercent = (grossProfitBrl / suggestedPriceBrl) * 100;
  
  // Get tax regime from settings
  const taxRegime: TaxRegime = (settings?.taxRegime as TaxRegime) || "lucro_presumido";
  const simplesAliquota = settings?.simplesAliquota || 1000;
  
  // Calculate sale taxes based on regime
  // Passar ICMS pago na importação como crédito para a venda
  const icmsPagoImportacao = taxes.values.icmsValueCents;
  const saleTaxes = calculateSaleTaxes({
    sellingPriceCents: suggestedPriceCents,
    costCents: totalCostCents,
    stateCode: destinationState,
    taxRegime,
    simplesAliquota,
    icmsPagoImportacaoCents: icmsPagoImportacao,
  });
  
  // Calculate target price analysis if target provided
  let targetAnalysis: TargetPriceAnalysis | undefined;
  if (input.targetPriceBrl && input.targetPriceBrl > 0) {
    targetAnalysis = calculateTargetPriceAnalysis({
      targetPriceCents: Math.round(input.targetPriceBrl * 100),
      totalCostCents,
      fobValueCents: Math.round(fobBrl * 100),
      taxRegime,
      stateCode: destinationState,
      simplesAliquota,
      icmsPagoImportacaoCents: icmsPagoImportacao,
    });
  }
  
  return {
    exchangeRate,
    exchangeSource,

    fobOriginal,
    freightOriginal,
    insuranceOriginal,
    cifOriginal,

    fobBrl,
    freightBrl,
    insuranceBrl,
    cifBrl,

    taxes,

    customsBrokerBrl,
    storageBrl,
    otherCostsBrl,

    icmsAntecipadoBrl,
    icmsDiferidoBrl,

    spreadBrl,
    iofBrl,

    royaltiesBrl,
    assistsBrl,
    commissionsBrl,
    adjustedCustomsValueBrl,

    totalCostBrl,
    unitCostBrl,

    markupPercent,
    suggestedPriceBrl,
    suggestedUnitPriceBrl,

    grossProfitBrl,
    grossMarginPercent,

    isMercosul,

    taxRegime,
    saleTaxes,
    targetAnalysis,
  };
}

/**
 * Save calculation to database
 */
export async function saveImportCalculation(
  input: ImportCalculationInput,
  result: ImportCalculationOutput
): Promise<number | null> {
  const settings = await getCompanySettings(input.userId);
  const destinationState = input.destinationState || settings?.stateCode || "SC";
  
  const data: InsertImportCalculation = {
    userId: input.userId,
    productId: input.productId,
    supplierId: input.supplierId,
    
    productName: input.productName,
    ncmCode: input.ncmCode,
    quantity: input.quantity,
    unit: input.unit || "UN",
    
    originCountry: input.originCountry,
    isMercosul: result.isMercosul,
    destinationState,
    
    fobValueCents: Math.round(input.fobValue * 100),
    fobCurrency: input.fobCurrency,
    freightCents: Math.round((input.freight ?? 0) * 100),
    insuranceCents: Math.round((input.insurance ?? 0) * 100),
    
    exchangeRate: Math.round(result.exchangeRate * 1000000),
    
    cifBrlCents: Math.round(result.cifBrl * 100),
    iiValueCents: result.taxes.values.iiValueCents,
    ipiValueCents: result.taxes.values.ipiValueCents,
    pisValueCents: result.taxes.values.pisValueCents,
    cofinsValueCents: result.taxes.values.cofinsValueCents,
    icmsValueCents: result.taxes.values.icmsValueCents,
    
    customsBrokerCents: Math.round(result.customsBrokerBrl * 100),
    storageCents: Math.round(result.storageBrl * 100),
    otherCostsCents: Math.round(result.otherCostsBrl * 100),

    icmsAntecipadoCents: Math.round(result.icmsAntecipadoBrl * 100),
    icmsDiferidoCents: Math.round(result.icmsDiferidoBrl * 100),

    iofCents: Math.round(result.iofBrl * 100),
    spreadCents: Math.round(result.spreadBrl * 100),

    royaltiesCents: Math.round(result.royaltiesBrl * 100),
    assistsCents: Math.round(result.assistsBrl * 100),
    commissionsCents: Math.round(result.commissionsBrl * 100),

    totalCostCents: Math.round(result.totalCostBrl * 100),
    unitCostCents: Math.round(result.unitCostBrl * 100),

    markupPercent: result.markupPercent,
    suggestedPriceCents: Math.round(result.suggestedPriceBrl * 100),

    status: "completed",
  };
  
  const saved = await createImportCalculation(data);
  return saved?.id ?? null;
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number, currency: string = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Format basis points as percentage
 */
export function basisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}

/**
 * Get calculation summary for display
 */
export function getCalculationSummary(result: ImportCalculationOutput) {
  return {
    // Cost breakdown
    costs: [
      { label: "FOB", value: result.fobBrl, percent: (result.fobBrl / result.totalCostBrl) * 100 },
      { label: "Frete", value: result.freightBrl, percent: (result.freightBrl / result.totalCostBrl) * 100 },
      { label: "Seguro", value: result.insuranceBrl, percent: (result.insuranceBrl / result.totalCostBrl) * 100 },
      { label: "II", value: result.taxes.values.iiValueCents / 100, percent: (result.taxes.values.iiValueCents / 100 / result.totalCostBrl) * 100 },
      { label: "IPI", value: result.taxes.values.ipiValueCents / 100, percent: (result.taxes.values.ipiValueCents / 100 / result.totalCostBrl) * 100 },
      { label: "PIS", value: result.taxes.values.pisValueCents / 100, percent: (result.taxes.values.pisValueCents / 100 / result.totalCostBrl) * 100 },
      { label: "COFINS", value: result.taxes.values.cofinsValueCents / 100, percent: (result.taxes.values.cofinsValueCents / 100 / result.totalCostBrl) * 100 },
      { label: "ICMS", value: result.taxes.values.icmsValueCents / 100, percent: (result.taxes.values.icmsValueCents / 100 / result.totalCostBrl) * 100 },
      { label: "ICMS Antecipado", value: result.icmsAntecipadoBrl, percent: (result.icmsAntecipadoBrl / result.totalCostBrl) * 100 },
      { label: "IOF", value: result.iofBrl, percent: (result.iofBrl / result.totalCostBrl) * 100 },
      { label: "Spread", value: result.spreadBrl, percent: (result.spreadBrl / result.totalCostBrl) * 100 },
      { label: "Despachante", value: result.customsBrokerBrl, percent: (result.customsBrokerBrl / result.totalCostBrl) * 100 },
      { label: "Armazenagem", value: result.storageBrl, percent: (result.storageBrl / result.totalCostBrl) * 100 },
      { label: "Outros", value: result.otherCostsBrl, percent: (result.otherCostsBrl / result.totalCostBrl) * 100 },
    ].filter(c => c.value > 0),

    // Key metrics
    metrics: {
      totalCost: result.totalCostBrl,
      unitCost: result.unitCostBrl,
      suggestedPrice: result.suggestedPriceBrl,
      grossProfit: result.grossProfitBrl,
      grossMargin: result.grossMarginPercent,
      taxBurden: (result.taxes.values.totalTaxesCents / 100 / result.cifBrl) * 100,
      icmsAntecipadoTTD409: result.icmsAntecipadoBrl,
      icmsDiferidoTTD409: result.icmsDiferidoBrl,
    },
  };
}
