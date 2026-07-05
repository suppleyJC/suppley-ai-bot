/**
 * Estimativa Service — ponte entre a API (tRPC) e o importCostEngine.
 *
 * Responsabilidades:
 *  - Buscar alíquotas por NCM no banco (com fallback sinalizado por warning)
 *  - Montar a entrada do motor a partir do payload da tela
 *  - Aplicar defaults da legislação (TTD 409, Res. 13/2012, LC 224/2025)
 *    permitindo override de qualquer parâmetro
 */
import { getNcmTaxRate, getActiveNcmException, getActiveTaxParameters } from "../db";
import { resolvePortCosts } from "./portCostService";
import {
  calculateImportCost,
  type EngineGlobalInput,
  type EngineItemInput,
  type EngineResult,
  type RegimeTributario,
} from "./importCostEngine";
import { getStateIcmsInternalRate, getStateName } from "./statePricingService";
import { getStateImportBenefit } from "./stateBenefits";
import { isMercosulCountry } from "./taxCalculationService";

export interface EstimativaProductInput {
  productName: string;
  sku?: string;
  ncmCode: string;
  quantity: number;
  unit?: string;
  /** Preço unitário FOB na moeda da cotação */
  unitPrice: number;
  /** Peso bruto TOTAL do item em kg (T.G.W). Habilita custo por kg. */
  pesoTotalKg?: number;
  /** Override de alíquotas (fração: 12,6% = 0.126). Se ausente, busca por NCM. */
  iiRateOverride?: number;
  ipiRateOverride?: number;
  icmsStValue?: number;
}

/** Modal logístico — define a incidência de AFRMM (só marítimo). */
export type ModalLogistico = "maritimo" | "aereo" | "rodoviario" | "ferroviario";

export interface EstimativaInput {
  products: EstimativaProductInput[];
  exchangeRate: number;
  currency?: string;
  /** Frete e seguro internacionais na moeda da cotação */
  freight?: number;
  insurance?: number;

  /**
   * UF de destino do desembaraço/nacionalização (ex.: "SC", "SP").
   * - SC: aplica o benefício TTD 409 (ICMS antecipado 2,6%/1,0%) por padrão.
   * - Demais UFs: aplica ICMS importação CHEIO com a alíquota interna do estado,
   *   a menos que icmsFullRegime/icmsInternalRate sejam informados explicitamente.
   * Se ausente, assume SC (com aviso).
   */
  estadoDestino?: string;
  /**
   * País de origem da mercadoria. Se for país do Mercosul (Argentina, Paraguai,
   * Uruguai, Venezuela), aplica-se o II preferencial (mercosulIiRate do NCM,
   * em geral 0%) — mediante Certificado de Origem.
   */
  paisOrigem?: string;
  /**
   * Modal logístico. AFRMM (25% do frete) só incide no modal marítimo;
   * para aéreo/rodoviário/ferroviário o AFRMM é zerado automaticamente.
   */
  modal?: ModalLogistico;

  /** Terminal/porto de desembaraço (ex.: BRNAV). Se informado, as despesas
   *  portuárias (armazenagem/liberação/expediente) vêm da tabela do porto. */
  portoCode?: string;

  // Custos em BRL (todos opcionais)
  afrmmBrl?: number;            // default: 8% do frete em BRL (longo curso)
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

  // Finalidade da importação: revenda (com venda/margem) ou consumo próprio (só custo)
  finalidade?: "revenda" | "consumo_proprio";

  // Venda
  taxRegime: RegimeTributario;
  icmsVendaRate?: number;       // default 0.04 (interestadual p/ importados)
  pisVendaRate?: number;        // default por regime
  cofinsVendaRate?: number;     // default por regime
  lucroDesejado?: number;       // default 0.05
  irpjRate?: number;            // default 0.25
  csllRate?: number;            // default 0.09

  /**
   * 2º CENÁRIO — revenda do COMPRADOR (Lucro Real). Quando informado, o motor
   * calcula também a estimativa de custo líquido e venda do comprador (cliente
   * da trading que revende). Espelha o "x Lucro Real" do modelo de referência.
   * Se `incluirComprador` for true sem detalhes, usa defaults (ICMS 12%, lucro 15%).
   */
  incluirComprador?: boolean;
  comprador?: {
    icmsVendaRate?: number;     // default 0.12 (interna)
    pisVendaRate?: number;      // default 0.0165
    cofinsVendaRate?: number;   // default 0.076
    lucroDesejado?: number;     // default 0.15
    irpjRate?: number;          // default 0.25
    csllRate?: number;          // default 0.09
  };
}

export interface DespesasBreakdown {
  liberacaoBl: number;
  armazenagem: number;
  freteInterno: number;
  despacho: number;
  expediente: number;
  portoCode: string | null;
}
export interface EstimativaResult extends EngineResult {
  ncmWarnings: string[];
  despesasBreakdown?: DespesasBreakdown;
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

  // Origem Mercosul → II preferencial (mediante Certificado de Origem).
  const isMercosul = input.paisOrigem ? isMercosulCountry(input.paisOrigem) : false;

  // ---- Resolver alíquotas por NCM ----
  const items: EngineItemInput[] = [];
  for (const p of input.products) {
    let iiRate = p.iiRateOverride;
    let ipiRate = p.ipiRateOverride;

    if (iiRate === undefined || ipiRate === undefined) {
      const ncmClean = p.ncmCode.replace(/\D/g, "");
      const rates = await getNcmTaxRate(ncmClean);
      if (rates) {
        // Mercosul: usa a alíquota preferencial do NCM (em geral 0%).
        if (isMercosul && p.iiRateOverride === undefined) {
          iiRate = (rates.mercosulIiRate ?? 0) / 10000;
          ncmWarnings.push(
            `NCM ${p.ncmCode}: origem ${input.paisOrigem} (Mercosul) — II preferencial ` +
            `${(iiRate * 100).toFixed(1)}% aplicado. Exige Certificado de Origem Mercosul.`,
          );
        }
        iiRate ??= rates.iiRate / 10000;   // bp → fração
        ipiRate ??= rates.ipiRate / 10000;

        // Ex-Tarifário vigente: reduz II/IPI (aplica a menor alíquota).
        const ex = await getActiveNcmException(ncmClean);
        if (ex) {
          if (ex.reducedIiRate != null && iiRate !== undefined) {
            iiRate = Math.min(iiRate, ex.reducedIiRate / 10000);
          }
          if (ex.reducedIpiRate != null && ipiRate !== undefined) {
            ipiRate = Math.min(ipiRate, ex.reducedIpiRate / 10000);
          }
          ncmWarnings.push(
            `NCM ${p.ncmCode}: Ex-Tarifário ${ex.exCode ?? ""} aplicado ` +
            `(${ex.legalBasis ?? "base legal a confirmar"}). Confirme a vigência.`,
          );
        }
        // A II vem do seed oficial MDIC (notes registra a origem). Só alertamos
        // quando a alíquota é uma estimativa por capítulo (fonte não cobriu o NCM)
        // ou quando há uma elevação temporária (DCC) prestes a expirar.
        const notes = rates.notes ?? "";
        if (/estimad/i.test(notes)) {
          ncmWarnings.push(
            `NCM ${p.ncmCode} (${p.productName}): II ${(iiRate * 100).toFixed(1)}% ESTIMADA ` +
            `por capítulo (não consta na TEC/aplicada). Confirme na TEC antes de fechar.`
          );
        } else if (/DCC|elevac|elevaç/i.test(notes)) {
          ncmWarnings.push(
            `NCM ${p.ncmCode} (${p.productName}): II ${(iiRate * 100).toFixed(1)}% é elevação ` +
            `temporária (DCC). ${notes}. Reconfirme a vigência antes de fechar.`
          );
        }
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
      // Peso TOTAL → peso unitário (o motor trabalha com peso por unidade).
      unitWeightKg: p.pesoTotalKg != null && p.quantity > 0 ? p.pesoTotalKg / p.quantity : undefined,
      iiRate: iiRate!,
      ipiRate: ipiRate!,
      icmsStValue: p.icmsStValue,
    });
  }

  // ---- Demais Despesas (itemizadas; puxam do porto quando informado) ----
  // CIF em BRL p/ a armazenagem (% do CIF com piso). FOB dos itens × câmbio + frete/seguro.
  const fobBrlTotal = items.reduce((a, it) => a + it.unitPriceFob * it.quantity, 0) * input.exchangeRate;
  const cifBrl = fobBrlTotal + (input.freight ?? 0) * input.exchangeRate + (input.insurance ?? 0) * input.exchangeRate;

  let armazenagemBrl = input.armazenagemBrl ?? 0;
  let liberacaoBlBrl = input.liberacaoBlBrl ?? 0;
  let taxaExpedienteBrl = input.taxaExpedienteBrl ?? 0;
  if (input.portoCode) {
    const pc = await resolvePortCosts(input.portoCode, Math.round(cifBrl * 100));
    armazenagemBrl = input.armazenagemBrl ?? pc.storageCents / 100;
    liberacaoBlBrl = input.liberacaoBlBrl ?? pc.liberationCents / 100;
    taxaExpedienteBrl = input.taxaExpedienteBrl ?? pc.otherCents / 100;
  }
  // Despachante: valor fixo (parâmetro CUSTOMS_BROKER) quando não informado.
  let despachoAduaneiroBrl = input.despachoAduaneiroBrl ?? 0;
  if (input.despachoAduaneiroBrl == null) {
    const params = await getActiveTaxParameters();
    if (params["CUSTOMS_BROKER"]?.valueCents != null) despachoAduaneiroBrl = params["CUSTOMS_BROKER"]!.valueCents! / 100;
  }
  const freteInternoBrl = input.freteInternoBrl ?? 0;

  const despesasBreakdown = {
    liberacaoBl: liberacaoBlBrl,
    armazenagem: armazenagemBrl,
    freteInterno: freteInternoBrl,
    despacho: despachoAduaneiroBrl,
    expediente: taxaExpedienteBrl,
    portoCode: input.portoCode ?? null,
  };

  // ---- Montar globais ----
  const saleDefaults = SALE_TAX_DEFAULTS[input.taxRegime];
  const demaisDespesas =
    liberacaoBlBrl + armazenagemBrl + freteInternoBrl + despachoAduaneiroBrl + taxaExpedienteBrl;

  // SC aplica SEMPRE o TTD máximo por padrão (fase após 36 meses, ICMS
  // antecipado efetivo de 1,0%) — sem exigir ajuste manual. Só cai para os
  // 2,6% da fase inicial se a operação DECLARAR explicitamente 'primeiros_36m'.
  const icmsAntecipado =
    input.icmsAntecipadoRateOverride ??
    (input.ttdPhase === "primeiros_36m" ? 0.026 : 0.01);
  // Pode ser sobrescrito por um benefício estadual CONFIRMADO (fora de SC).
  let icmsAntecipadoEfetivo = icmsAntecipado;

  // ---- ESTADO DE DESTINO: define o regime de ICMS importação ----
  // SC tem o benefício TTD 409 (antecipado 2,6%/1,0%). Demais UFs recolhem o
  // ICMS importação CHEIO com a alíquota interna do estado. O usuário ainda pode
  // sobrescrever via icmsFullRegime/icmsInternalRate explícitos.
  const estadoUf = (input.estadoDestino ?? "").toUpperCase().slice(0, 2);
  let icmsFullRegime = input.icmsFullRegime;
  let icmsInternalRate = input.icmsInternalRate;

  if (!input.estadoDestino) {
    ncmWarnings.push(
      "Estado de destino não informado — cálculo assumiu SC com TTD máximo " +
      "(ICMS antecipado efetivo 1,0%). Informe a UF de destino para precisão do ICMS importação.",
    );
  } else if (estadoUf !== "SC" && icmsFullRegime === undefined && icmsInternalRate === undefined) {
    const beneficio = getStateImportBenefit(estadoUf);
    if (beneficio?.aplicarAutomatico && beneficio.icmsEfetivo != null) {
      // Benefício estadual CONFIRMADO: aplica como ICMS importação efetivo
      // (mesma mecânica do TTD/SC — antecipado com gross-up de 4%).
      icmsFullRegime = false;
      icmsAntecipadoEfetivo = beneficio.icmsEfetivo;
      ncmWarnings.push(
        `Estado ${estadoUf}: aplicado o benefício ${beneficio.programa} — ICMS importação ` +
        `efetivo ${(beneficio.icmsEfetivo * 100).toFixed(1)}% (${beneficio.baseLegal}). ` +
        `Confirme o enquadramento da empresa no programa.`,
      );
    } else {
      const stateRate = getStateIcmsInternalRate(estadoUf);
      if (stateRate) {
        icmsFullRegime = true;
        icmsInternalRate = stateRate;
        const extra = beneficio
          ? ` OBS: ${estadoUf} tem o programa ${beneficio.programa} (${beneficio.baseLegal}) — ` +
            `para considerar o benefício, confirme a alíquota efetiva do seu enquadramento e eu recalculo.`
          : ` O benefício TTD (antecipado) é exclusivo de Santa Catarina.`;
        ncmWarnings.push(
          `Estado ${estadoUf} (${getStateName(estadoUf) ?? estadoUf}): aplicado ICMS importação ` +
          `CHEIO a ${(stateRate * 100).toFixed(1)}% (alíquota interna).${extra}`,
        );
      } else {
        ncmWarnings.push(
          `Estado "${input.estadoDestino}" não reconhecido — mantido o regime padrão (SC/TTD). ` +
          `Confira a UF de destino.`,
        );
      }
    }
  }

  // ---- MODAL: AFRMM só incide no marítimo ----
  let afrmmBrl = input.afrmmBrl;
  if (afrmmBrl === undefined && input.modal && input.modal !== "maritimo") {
    afrmmBrl = 0;
    ncmWarnings.push(
      `Modal ${input.modal}: AFRMM zerado (o Adicional ao Frete para Renovação da ` +
      `Marinha Mercante incide apenas sobre frete marítimo).`,
    );
  }

  const globals: EngineGlobalInput = {
    exchangeRate: input.exchangeRate,
    freightTotalFob: input.freight ?? 0,
    insuranceTotalFob: input.insurance ?? 0,
    afrmmTotalBrl: afrmmBrl,
    siscomexTotalBrl: input.siscomexBrl,
    demaisDespesasBrl: demaisDespesas,
    pacoteLogisticoBrl: input.pacoteLogisticoBrl,
    royaltiesBrl: input.royaltiesBrl,
    assessoriaRate: input.assessoriaRate,

    icmsGrossUpRate: input.icmsGrossUpRateOverride,
    icmsAntecipadoRate: icmsAntecipadoEfetivo,
    icmsNegociadoClienteRate: input.icmsNegociadoClienteRate,
    icmsFullRegime,
    icmsInternalRate,

    pisImportRate: input.pisImportRateOverride,
    cofinsImportRate: input.cofinsImportRateOverride,
    // Legislação vigente em 2026 por default; desativável p/ comparar
    // com planilhas anteriores à LC 224/2025
    applyCofinsLc224: input.applyCofinsLc224 ?? true,

    finalidade: input.finalidade ?? "revenda",
    regime: input.taxRegime,
    icmsVendaRate: input.icmsVendaRate ?? 0.04,
    pisVendaRate: input.pisVendaRate ?? saleDefaults.pis,
    cofinsVendaRate: input.cofinsVendaRate ?? saleDefaults.cofins,
    lucroDesejado: input.lucroDesejado ?? 0.05,
    irpjRate: input.irpjRate,
    csllRate: input.csllRate,

    // 2º cenário: revenda do comprador (Lucro Real)
    buyer: (input.incluirComprador || input.comprador)
      ? {
          icmsVendaRate: input.comprador?.icmsVendaRate ?? 0.12,
          pisVendaRate: input.comprador?.pisVendaRate ?? 0.0165,
          cofinsVendaRate: input.comprador?.cofinsVendaRate ?? 0.076,
          lucroDesejado: input.comprador?.lucroDesejado ?? 0.15,
          irpjRate: input.comprador?.irpjRate,
          csllRate: input.comprador?.csllRate,
        }
      : undefined,
  };

  const result = calculateImportCost(globals, items);
  return { ...result, ncmWarnings, despesasBreakdown };
}
