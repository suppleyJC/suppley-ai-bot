/**
 * Estimativa Service — ponte entre a API (tRPC) e o importCostEngine.
 *
 * Responsabilidades:
 *  - Buscar alíquotas por NCM no banco (com fallback sinalizado por warning)
 *  - Montar a entrada do motor a partir do payload da tela
 *  - Aplicar defaults da legislação (TTD 409, Res. 13/2012, LC 224/2025)
 *    permitindo override de qualquer parâmetro
 */
import { getNcmTaxRate } from "../db";
import {
  calculateImportCost,
  type EngineGlobalInput,
  type EngineItemInput,
  type EngineResult,
  type RegimeTributario,
} from "./importCostEngine";

export interface EstimativaProductInput {
  productName: string;
  sku?: string;
  ncmCode: string;
  quantity: number;
  unit?: string;
  /** Preço unitário FOB na moeda da cotação */
  unitPrice: number;
  /** Override de alíquotas (fração: 12,6% = 0.126). Se ausente, busca por NCM. */
  iiRateOverride?: number;
  ipiRateOverride?: number;
  icmsStValue?: number;
}

export interface EstimativaInput {
  products: EstimativaProductInput[];
  exchangeRate: number;
  currency?: string;
  /** Frete e seguro internacionais na moeda da cotação */
  freight?: number;
  insurance?: number;

  // Custos em BRL (todos opcionais)
  afrmmBrl?: number;            // default: 25% do frete em BRL
  siscomexBrl?: number;         // default: R$ 154,23
  liberacaoBlBrl?: number;
  armazenagemBrl?: number;
  freteInternoBrl?: number;
  despachoAduaneiroBrl?: number;
  taxaExpedienteBrl?: number;
  pacoteLogisticoBrl?: number;
  royaltiesBrl?: number;
  assessoriaRate?: number;      // fração

  // ICMS importação — defaults da legislação (TTD 409/SC)
  ttdPhase?: "primeiros_36m" | "apos_36m"; // 2,6% | 1,0%
  icmsAntecipadoRateOverride?: number;
  icmsGrossUpRateOverride?: number;        // default 4% (Res. Senado 13/2012)
  /** Repasse do benefício: alíquota cobrada do cliente (ex.: 0.04). */
  icmsNegociadoClienteRate?: number;
  icmsFullRegime?: boolean;
  icmsInternalRate?: number;

  // PIS/COFINS importação
  applyCofinsLc224?: boolean;   // default true (legislação 2026); false p/ paridade c/ planilhas antigas
  pisImportRateOverride?: number;
  cofinsImportRateOverride?: number;

  // Venda
  taxRegime: RegimeTributario;
  icmsVendaRate?: number;       // default 0.04 (interestadual p/ importados)
  pisVendaRate?: number;        // default por regime
  cofinsVendaRate?: number;     // default por regime
  lucroDesejado?: number;       // default 0.05
  irpjRate?: number;            // default 0.25
  csllRate?: number;            // default 0.09
}

export interface EstimativaResult extends EngineResult {
  ncmWarnings: string[];
}

/** Defaults de PIS/COFINS de venda por regime */
const SALE_TAX_DEFAULTS: Record<RegimeTributario, { pis: number; cofins: number }> = {
  lucro_real: { pis: 0.0165, cofins: 0.076 },
  lucro_presumido: { pis: 0.0065, cofins: 0.03 },
  simples_nacional: { pis: 0, cofins: 0 }, // embutidos no DAS
};

const DEFAULT_II_FALLBACK = 0.14; // média TEC quando NCM não encontrado

export async function calculateEstimativa(input: EstimativaInput): Promise<EstimativaResult> {
  const ncmWarnings: string[] = [];

  // ---- Resolver alíquotas por NCM ----
  const items: EngineItemInput[] = [];
  for (const p of input.products) {
    let iiRate = p.iiRateOverride;
    let ipiRate = p.ipiRateOverride;

    if (iiRate === undefined || ipiRate === undefined) {
      const ncmClean = p.ncmCode.replace(/\D/g, "");
      const rates = await getNcmTaxRate(ncmClean);
      if (rates) {
        iiRate ??= rates.iiRate / 10000;   // bp → fração
        ipiRate ??= rates.ipiRate / 10000;
      } else {
        iiRate ??= DEFAULT_II_FALLBACK;
        ipiRate ??= 0;
        ncmWarnings.push(
          `NCM ${p.ncmCode} (${p.productName}) não encontrado na base — ` +
          `usando II ${(DEFAULT_II_FALLBACK * 100).toFixed(0)}% e IPI 0% ESTIMADOS. ` +
          `Confirme as alíquotas na TEC/TIPI antes de fechar a operação.`
        );
      }
    }

    items.push({
      description: p.productName,
      ncm: p.ncmCode,
      sku: p.sku,
      quantity: p.quantity,
      unit: p.unit,
      unitPriceFob: p.unitPrice,
      iiRate: iiRate!,
      ipiRate: ipiRate!,
      icmsStValue: p.icmsStValue,
    });
  }

  // ---- Montar globais ----
  const saleDefaults = SALE_TAX_DEFAULTS[input.taxRegime];
  const demaisDespesas =
    (input.liberacaoBlBrl ?? 0) +
    (input.armazenagemBrl ?? 0) +
    (input.freteInternoBrl ?? 0) +
    (input.despachoAduaneiroBrl ?? 0) +
    (input.taxaExpedienteBrl ?? 0);

  const icmsAntecipado =
    input.icmsAntecipadoRateOverride ??
    (input.ttdPhase === "apos_36m" ? 0.01 : 0.026);

  const globals: EngineGlobalInput = {
    exchangeRate: input.exchangeRate,
    freightTotalFob: input.freight ?? 0,
    insuranceTotalFob: input.insurance ?? 0,
    afrmmTotalBrl: input.afrmmBrl,
    siscomexTotalBrl: input.siscomexBrl,
    demaisDespesasBrl: demaisDespesas,
    pacoteLogisticoBrl: input.pacoteLogisticoBrl,
    royaltiesBrl: input.royaltiesBrl,
    assessoriaRate: input.assessoriaRate,

    icmsGrossUpRate: input.icmsGrossUpRateOverride,
    icmsAntecipadoRate: icmsAntecipado,
    icmsNegociadoClienteRate: input.icmsNegociadoClienteRate,
    icmsFullRegime: input.icmsFullRegime,
    icmsInternalRate: input.icmsInternalRate,

    pisImportRate: input.pisImportRateOverride,
    cofinsImportRate: input.cofinsImportRateOverride,
    // Legislação vigente em 2026 por default; desativável p/ comparar
    // com planilhas anteriores à LC 224/2025
    applyCofinsLc224: input.applyCofinsLc224 ?? true,

    regime: input.taxRegime,
    icmsVendaRate: input.icmsVendaRate ?? 0.04,
    pisVendaRate: input.pisVendaRate ?? saleDefaults.pis,
    cofinsVendaRate: input.cofinsVendaRate ?? saleDefaults.cofins,
    lucroDesejado: input.lucroDesejado ?? 0.05,
    irpjRate: input.irpjRate,
    csllRate: input.csllRate,
  };

  const result = calculateImportCost(globals, items);
  return { ...result, ncmWarnings };
}
