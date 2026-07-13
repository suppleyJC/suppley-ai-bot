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
import { consultarTtce, ttceEnabled } from "./ttceService";
import { isMercosulCountry } from "./taxCalculationService";
import { converterItem, custoPorCanonica, type ConversaoItem } from "./unitConversionService";
import { detectarBarreiras, formatarBarreira, type BarreiraDetectada } from "./tradeBarrierService";

export interface EstimativaProductInput {
  productName: string;
  sku?: string;
  ncmCode: string;
  quantity: number;
  unit?: string;
  /** Itens por embalagem quando a unidade é pct/cx/fardo/rolo/saco (1 cx = N un). */
  itensPorEmbalagem?: number;
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
/** Insight de unidade por item: conversão p/ canônica + custo na canônica. */
export interface ItemUnidadeInsight {
  description: string;
  conversao: ConversaoItem;
  /** Custo líquido na unidade canônica (ex.: R$/kg p/ item cotado em ton). */
  custoCanonico: { valor: number; unidade: string } | null;
  /** FOB unitário na unidade canônica (USD). */
  fobCanonico: { valor: number; unidade: string } | null;
}

export interface EstimativaResult extends EngineResult {
  ncmWarnings: string[];
  despesasBreakdown?: DespesasBreakdown;
  /** Conversões de unidade por item (peso/volume/contagem → kg/L/un). */
  unidades?: ItemUnidadeInsight[];
  /** Barreiras comerciais detectadas por item (antidumping/CIDE/compensatórias). */
  barreiras?: { description: string; ncm: string; detectadas: BarreiraDetectada[] }[];
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
  const conversoes: ConversaoItem[] = [];
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

        // TTCE (Portal Único Siscomex) — fonte oficial do tratamento aplicado
        // (ex-tarifário/GECEX, preferências). Opt-in via TTCE_ENABLED; fail-closed
        // (null → segue com as tabelas locais). Só REDUZ alíquota, nunca eleva.
        if (ttceEnabled()) {
          const ttce = await consultarTtce({ ncm: ncmClean, paisOrigem: input.paisOrigem });
          if (ttce) {
            const antesIi = iiRate;
            if (ttce.iiRate != null && iiRate !== undefined && ttce.iiRate < iiRate) {
              iiRate = ttce.iiRate;
            }
            if (ttce.ipiRate != null && ipiRate !== undefined && ttce.ipiRate < ipiRate) {
              ipiRate = ttce.ipiRate;
            }
            if (antesIi !== iiRate || ttce.exTarifario) {
              const fund = ttce.exTarifario?.fundamento ?? ttce.fundamentos[0] ?? "TTCE/Portal Único";
              ncmWarnings.push(
                `NCM ${p.ncmCode}: tratamento oficial TTCE aplicado` +
                (ttce.exTarifario?.codigo ? ` (Ex ${ttce.exTarifario.codigo})` : "") +
                ` — II ${(iiRate! * 100).toFixed(1)}%. Fonte: ${fund}.`,
              );
            }
          }
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

    // INTELIGÊNCIA DE UNIDADES: reconhece a unidade em linguagem natural e
    // deriva o peso total quando a própria unidade é de peso (2 ton → 2000 kg)
    // — habilita o custo/kg sem o usuário repetir o peso. A quantidade/preço
    // originais seguem intactos para o motor (paridade de planilha).
    const conv = converterItem({
      quantity: p.quantity,
      unit: p.unit,
      itensPorEmbalagem: p.itensPorEmbalagem,
    });
    conversoes.push(conv);
    const pesoTotalKg = p.pesoTotalKg ?? conv.pesoTotalKgDerivado ?? undefined;

    items.push({
      description: p.productName,
      ncm: p.ncmCode,
      sku: p.sku,
      quantity: p.quantity,
      unit: p.unit,
      unitPriceFob: p.unitPrice,
      // Peso TOTAL → peso unitário (o motor trabalha com peso por unidade).
      unitWeightKg: pesoTotalKg != null && p.quantity > 0 ? pesoTotalKg / p.quantity : undefined,
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

  // BARREIRAS COMERCIAIS (Pilar 2): detecção estruturada por NCM+origem em
  // TODO cálculo — antidumping, medidas compensatórias, salvaguardas e CIDE.
  // Evidencia com impacto estimado quando o valor é parametrizado; o valor da
  // medida NÃO entra no custo do motor (paridade de planilha) — o aviso deixa
  // isso explícito para o agente somar/na apresentação.
  const barreiras: NonNullable<EstimativaResult["barreiras"]> = [];
  for (let i = 0; i < result.items.length; i++) {
    const it = result.items[i];
    try {
      const detectadas = await detectarBarreiras({
        ncm: it.ncm ?? "",
        paisOrigem: input.paisOrigem,
        valorAduaneiroBrl: it.customsValueBrl,
        pesoTotalKg: it.weightKgTotal || undefined,
        quantidade: it.quantity,
        cambio: input.exchangeRate,
      });
      if (detectadas.length) {
        barreiras.push({ description: it.description, ncm: it.ncm ?? "", detectadas });
        for (const b of detectadas) {
          ncmWarnings.push(`🛑 ${formatarBarreira(b, it.ncm ?? "")}`);
        }
      }
    } catch {
      /* detecção é best-effort — nunca derruba o cálculo */
    }
  }

  // Insights de unidade por item: custo líquido e FOB na unidade CANÔNICA
  // (kg/L/un) quando a unidade original é conversível — o total nunca muda,
  // só a leitura (2 ton a R$10.000 ⇒ R$5,00/kg).
  const unidades: ItemUnidadeInsight[] = result.items.map((it, i) => {
    const conv = conversoes[i];
    return {
      description: it.description,
      conversao: conv,
      custoCanonico: custoPorCanonica(it.netTotalCost, conv),
      fobCanonico: custoPorCanonica(it.totalFob, conv),
    };
  });

  return { ...result, ncmWarnings, despesasBreakdown, unidades, barreiras };
}

// ============================================================
// ANÁLISE DE PREÇO-ALVO (solve reverso p/ negociação com fornecedor)
// ============================================================

export interface PrecoAlvoAnalise {
  /** Preço de venda alvo informado (total, em BRL). */
  precoVendaAlvo: number;
  /** Preço de venda sugerido pelo motor no FOB atual (já com a margem desejada). */
  precoVendaSugerido: number;
  /** Custo nacionalizado total no FOB atual. */
  custoNacionalizado: number;
  /** true = no FOB atual já dá para vender ao alvo mantendo a margem. */
  viavel: boolean;
  /** Folga (alvo − sugerido); negativo quando inviável. */
  folga: number;
  /** FOB total atual na moeda da cotação (Σ quantidade × preço FOB). */
  fobAtualTotal: number;
  /** FOB total necessário para bater o alvo com a margem (ou null). */
  fobAlvoTotal: number | null;
  /** Fator FOB alvo/atual (ex.: 0.85 = precisa 15% mais barato). */
  fatorFob: number | null;
  /** Redução necessária no FOB, em % (ou null). */
  reducaoNecessariaPct: number | null;
  /**
   * Custo nacionalizado total RECALCULADO NO FOB-ALVO (não no FOB atual!).
   * É este o "custo posto" a apresentar ao lado do FOB-alvo — misturar o
   * custo do FOB atual com o FOB-alvo gera números incoerentes na tela.
   */
  custoNacionalizadoNoAlvo: number | null;
  /** Preço de venda que o motor devolve no FOB-alvo (autovalidação do reverso). */
  precoVendaNoAlvo: number | null;
  /** true quando |precoVendaNoAlvo − alvo| ≤ 1% — o solve reverso CONFERE. */
  reversoConfere: boolean | null;
}

/**
 * Solve REVERSO: dado um preço de venda ALVO, descobre se o FOB atual permite
 * atingi-lo mantendo a margem desejada e, se não, qual o FOB-alvo a negociar.
 *
 * O motor é AFIM no FOB (impostos escalam com o valor aduaneiro; frete/seguro e
 * despesas fixas formam o intercepto). Por isso 2 amostras (FOB atual e FOB×0,5)
 * determinam a reta preço-de-venda × FOB exatamente — sem iteração.
 *
 * Só se aplica a REVENDA (consumo próprio não tem preço de venda).
 */
export async function analisarPrecoAlvo(
  input: EstimativaInput,
  precoVendaAlvoBrl: number,
  base?: EstimativaResult,
): Promise<PrecoAlvoAnalise> {
  const r1 = base ?? (await calculateEstimativa(input));
  const sp1 = r1.summary.salePriceTotal;
  const landed = r1.summary.netCostTotal;
  const fobTotal1 = input.products.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

  // Segunda amostra com FOB reduzido à metade (frete/seguro/despesas ficam fixos).
  const input2: EstimativaInput = {
    ...input,
    products: input.products.map((p) => ({ ...p, unitPrice: p.unitPrice * 0.5 })),
  };
  const r2 = await calculateEstimativa(input2);
  const sp2 = r2.summary.salePriceTotal;
  const fobTotal2 = fobTotal1 * 0.5;

  const a = fobTotal1 !== fobTotal2 ? (sp1 - sp2) / (fobTotal1 - fobTotal2) : 0;
  const b = sp1 - a * fobTotal1;

  let fobAlvoTotal: number | null = null;
  let fatorFob: number | null = null;
  let reducaoNecessariaPct: number | null = null;
  if (a > 0) {
    fobAlvoTotal = Math.max(0, (precoVendaAlvoBrl - b) / a);
    if (fobTotal1 > 0) {
      fatorFob = fobAlvoTotal / fobTotal1;
      reducaoNecessariaPct = Math.round(((fobTotal1 - fobAlvoTotal) / fobTotal1) * 1000) / 10;
    }
  }

  // 3ª amostra: roda o motor NO FOB-ALVO. Duas funções: (a) devolver o custo
  // posto coerente com o FOB-alvo (o custo do FOB atual NÃO vale para a linha
  // do alvo); (b) AUTOVALIDAR o solve — o preço de venda no FOB-alvo tem que
  // bater com o alvo (tolerância 1%), senão o resultado não sai como "certo".
  let custoNacionalizadoNoAlvo: number | null = null;
  let precoVendaNoAlvo: number | null = null;
  let reversoConfere: boolean | null = null;
  if (fobAlvoTotal != null && fatorFob != null && fatorFob > 0) {
    try {
      const inputAlvo: EstimativaInput = {
        ...input,
        products: input.products.map((p) => ({ ...p, unitPrice: p.unitPrice * fatorFob! })),
      };
      const rAlvo = await calculateEstimativa(inputAlvo);
      custoNacionalizadoNoAlvo = rAlvo.summary.netCostTotal;
      precoVendaNoAlvo = rAlvo.summary.salePriceTotal;
      reversoConfere =
        precoVendaAlvoBrl > 0 &&
        Math.abs(precoVendaNoAlvo - precoVendaAlvoBrl) / precoVendaAlvoBrl <= 0.01;
    } catch { /* validação é best-effort; os campos ficam null */ }
  }

  return {
    precoVendaAlvo: precoVendaAlvoBrl,
    precoVendaSugerido: sp1,
    custoNacionalizado: landed,
    viavel: sp1 <= precoVendaAlvoBrl,
    folga: precoVendaAlvoBrl - sp1,
    fobAtualTotal: fobTotal1,
    fobAlvoTotal,
    fatorFob,
    reducaoNecessariaPct,
    custoNacionalizadoNoAlvo,
    precoVendaNoAlvo,
    reversoConfere,
  };
}
