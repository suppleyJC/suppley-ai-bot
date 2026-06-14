export const MERCOSUL_COUNTRIES = [
  { value: "Paraguai", label: "Paraguai" },
  { value: "Argentina", label: "Argentina" },
  { value: "Uruguai", label: "Uruguai" },
];

export const OTHER_COUNTRIES = [
  { value: "China", label: "China" },
  { value: "Estados Unidos", label: "Estados Unidos" },
  { value: "Alemanha", label: "Alemanha" },
  { value: "Itália", label: "Itália" },
  { value: "Japão", label: "Japão" },
  { value: "Coreia do Sul", label: "Coreia do Sul" },
  { value: "Índia", label: "Índia" },
  { value: "México", label: "México" },
];

export const BRAZILIAN_STATES = [
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "PR", label: "Paraná" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "BA", label: "Bahia" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "PE", label: "Pernambuco" },
];

export const UNITS = [
  { value: "UN", label: "UN" },
  { value: "KG", label: "KG" },
  { value: "TON", label: "TON" },
  { value: "CX", label: "CX" },
  { value: "PC", label: "PC" },
];

export interface ProductItem {
  id: string;
  productName: string;
  sku?: string;
  ncmCode: string;
  ncmConfirmed: boolean;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  targetPrice?: number;
  extractedFromPdf: boolean;
}

export interface CalculationResultItem {
  product: {
    name: string;
    sku?: string;
    ncmCode: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  };
  calculation: {
    exchangeRate: number;
    exchangeSource: string;
    fobBrl: number;
    freightBrl: number;
    insuranceBrl: number;
    cifBrl: number;
    taxes: {
      rates: { ii: number; ipi: number; pis: number; cofins: number; icms: number };
      values: { iiValueCents: number; ipiValueCents: number; pisValueCents: number; cofinsValueCents: number; icmsValueCents: number; totalTaxesCents: number };
      breakdown: { baseII: number; baseIPI: number; basePISCOFINS: number; baseICMS: number };
    };
    taxRegime: string;
    saleTaxes: {
      icmsOnSale: number;
      pisOnSale: number;
      cofinsOnSale: number;
      irpj: number;
      csll: number;
      simplesTotal?: number;
      totalTaxesOnSale: number;
      effectiveRate: number;
    };
    totalCostBrl: number;
    unitCostBrl: number;
    suggestedPriceBrl: number;
    suggestedUnitPriceBrl: number;
    grossProfitBrl: number;
    grossMarginPercent: number;
    isMercosul: boolean;
    calculationId?: number;
    targetAnalysis?: {
      targetPrice: number;
      isViable: boolean;
      maxPurchasePrice: number;
      priceDifference: number;
      requiredDiscount: number;
      grossMarginPercent?: number;
      netMarginPercent?: number;
      cmvPercent?: number;
      taxesOnSale?: number;
      effectiveTaxRate?: number;
      grossProfit?: number;
      netProfit?: number;
    };
  };
}

export interface CalculationResults {
  results: CalculationResultItem[];
  totals: {
    totalFobBrl: number;
    totalCifBrl: number;
    totalTaxesBrl: number;
    totalCostBrl: number;
    totalSuggestedPriceBrl: number;
    totalGrossProfitBrl: number;
    productCount: number;
  };
  currency: string;
  originCountry: string;
  destinationState: string;
}

export interface FormData {
  originCountry: string;
  destinationState: string;
  portCode: string;
  currency: string;
  freight: number;
  insurance: number;
  customsBrokerBrl: number;
  storageBrl: number;
  otherCostsBrl: number;
  siscomex: number;
  afrmm: number;
  thc: number;
  liberation: number;
  taxRegime: string;
  simplesFaixa: number;
  markupPercent: number;
}

export function formatCurrency(value: number, currency: string = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}
