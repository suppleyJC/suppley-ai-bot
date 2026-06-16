/**
 * Motor V2 Adapter — usa Motor V2 como motor principal
 * Simples: retorna Motor V2, fallback para legado se falhar
 * Não tenta mapeamento perfeito de tipos - deixa o legado lidar com saleTaxes
 */

import { calculateEstimativa } from "./estimativaService";
import { getCompanySettings } from "../db";
import { isMercosulCountry } from "./taxCalculationService";
import type { ImportCalculationOutput } from "./importCalculationService";

export interface LegacyInput {
  userId: number;
  productName: string;
  ncmCode: string;
  quantity: number;
  unit?: string;
  originCountry: string;
  destinationState?: string;
  fobValue: number;
  fobCurrency: string;
  freight?: number;
  insurance?: number;
  customsBrokerBrl?: number;
  storageBrl?: number;
  otherCostsBrl?: number;
  markupPercent?: number;
}

/**
 * Calcula usando Motor V2 e retorna no formato legado
 * Se Motor V2 falhar, lança exceção (será capturado no router)
 */
export async function calculateWithMotorV2(
  input: LegacyInput
): Promise<ImportCalculationOutput> {
  const settings = await getCompanySettings(input.userId);
  const taxRegime = (settings?.taxRegime as "lucro_real" | "lucro_presumido" | "simples_nacional") || "lucro_presumido";

  // Obter taxa de câmbio real
  const { rate: exchangeRate } = await import("./exchangeService").then((m) =>
    m.getExchangeRate(input.fobCurrency, "BRL")
  );

  // Calcular com Motor V2
  const motorResult = await calculateEstimativa({
    products: [
      {
        productName: input.productName,
        ncmCode: input.ncmCode,
        quantity: input.quantity,
        unit: input.unit || "UN",
        unitPrice: input.fobValue / input.quantity,
      },
    ],
    exchangeRate,
    currency: input.fobCurrency,
    freight: input.freight || 0,
    insurance: input.insurance || 0,
    armazenagemBrl: input.storageBrl,
    despachoAduaneiroBrl: input.customsBrokerBrl,
    freteInternoBrl: input.otherCostsBrl,
    taxRegime,
  });

  const item = motorResult.items[0];
  if (!item) throw new Error("Motor V2: nenhum item retornado");

  const markupPercent = input.markupPercent || 3000;
  const totalCostBrl = item.totalCost;
  const suggestedPriceBrl = totalCostBrl * (1 + markupPercent / 10000);

  // Montar resultado no formato legado
  // Note: taxes precisa de breakdown e isMercosulPreferential
  // Vamos usar valores de Motor V2 diretamente
  const result: ImportCalculationOutput = {
    exchangeRate,
    exchangeSource: "Motor V2",

    fobOriginal: input.fobValue,
    freightOriginal: input.freight || 0,
    insuranceOriginal: input.insurance || 0,
    cifOriginal: input.fobValue + (input.freight || 0) + (input.insurance || 0),

    fobBrl: item.fobBrl,
    freightBrl: item.freightBrl,
    insuranceBrl: item.insuranceBrl,
    cifBrl: item.customsValueBrl,

    taxes: {
      rates: {
        ii: item.iiRate,
        ipi: item.ipiRate,
        pis: item.pisRate,
        cofins: item.cofinsRate,
        icms: item.icmsRate,
      },
      values: {
        iiValueCents: Math.round(item.iiValue * 100),
        ipiValueCents: Math.round(item.ipiValue * 100),
        pisValueCents: Math.round(item.pisValue * 100),
        cofinsValueCents: Math.round(item.cofinsValue * 100),
        icmsValueCents: Math.round(item.icmsValue * 100),
        afrmmValueCents: Math.round(item.afrmmBrl * 100),
        siscomexValueCents: Math.round(item.siscomexBrl * 100),
        totalTaxesCents: Math.round(
          (item.iiValue + item.ipiValue + item.pisValue + item.cofinsValue + item.icmsValue) * 100
        ),
      },
      breakdown: {
        baseII: item.customsValueBrl,
        baseIPI: item.customsValueBrl + item.iiValue,
        basePISCOFINS: item.customsValueBrl,
        baseICMS: item.customsValueBrl + item.iiValue,
      },
      isMercosulPreferential: isMercosulCountry(input.originCountry) && item.iiRate === 0,
    },

    customsBrokerBrl: input.customsBrokerBrl || 0,
    storageBrl: input.storageBrl || 0,
    otherCostsBrl: input.otherCostsBrl || 0,

    totalCostBrl,
    unitCostBrl: totalCostBrl / input.quantity,

    markupPercent,
    suggestedPriceBrl,
    suggestedUnitPriceBrl: suggestedPriceBrl / input.quantity,

    grossProfitBrl: suggestedPriceBrl - totalCostBrl,
    grossMarginPercent: totalCostBrl > 0 ? ((suggestedPriceBrl - totalCostBrl) / suggestedPriceBrl) * 100 : 0,

    isMercosul: isMercosulCountry(input.originCountry),

    taxRegime,
    saleTaxes: {
      icmsOnSale: item.icmsVendaValue,
      pisOnSale: item.ipiVendaValue || 0,
      cofinsOnSale: 0,
      irpj: 0,
      csll: 0,
      totalTaxesOnSale: item.icmsVendaValue + (item.ipiVendaValue || 0),
      effectiveRate: Math.round(((item.icmsVendaValue + (item.ipiVendaValue || 0)) / suggestedPriceBrl) * 10000),
    },
  };

  return result;
}
