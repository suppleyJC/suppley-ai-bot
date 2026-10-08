/**
 * Import Cost Engine — Modelo "Estimativa de Custo" (paridade com planilha do contador)
 *
 * Implementa fielmente a metodologia da planilha de referência
 * "Escoras - Trade Lucro Real x Lucro Presumido", incluindo:
 *
 *  - Rateio de custos por produto proporcional ao VALOR FOB (% VALOR)
 *  - II sobre o Valor Aduaneiro (VA = FOB + Frete + Seguro)
 *  - IPI sobre (VA + II)
 *  - PIS/COFINS-Importação sobre o VA (Lei 10.865/2004, art. 7º)
 *  - COFINS adicional de 0,6% (LC 224/2025) OPCIONAL via flag
 *  - ICMS Antecipado (TTD 409/SC):
 *      Base = (VA + AFRMM + Siscomex + II + IPI + PIS + COFINS) / (1 − alíq. interestadual)
 *      Valor = Base × alíquota antecipada (2,6% ou 1,0%)
 *  - Custo Total = VA + AFRMM + Siscomex + Demais Despesas + tributos
 *  - Assessoria = (Royalties rateado + Custo Total) × taxa%
 *  - Custo Líquido = Custo Total − créditos recuperáveis conforme regime
 *  - Preço de venda por FATOR DIVISOR:
 *      margemBruta = lucroDesejado / (1 − (IRPJ + CSLL))
 *      fator = 1 − (ICMSvenda + PISvenda + COFINSvenda + margemBruta)
 *      preço = custoLíquidoTotal / fator
 *  - NF-e de Nacionalização e consolidação
 *
 * CONVENÇÕES:
 *  - Valores monetários em NÚMEROS DECIMAIS DE BRL/USD (não centavos),
 *    espelhando a aritmética de ponto flutuante do Excel para garantir
 *    paridade numérica com a planilha. Arredondar APENAS na apresentação.
 *  - Alíquotas em frações decimais (12,6% = 0.126), como na planilha.
 *
 * A conversão de/para centavos e basis points usados no restante do
 * sistema é feita pelos adaptadores em importCalculationService.
 */

// ============================================================
// TIPOS
// ============================================================

export type RegimeTributario = "lucro_real" | "lucro_presumido" | "simples_nacional";

export interface EngineItemInput {
  description: string;
  ncm: string;
  sku?: string;
  quantity: number;
  unit?: string;
  /** Preço unitário FOB na moeda de origem (ex.: USD) */
  unitPriceFob: number;
  /** Peso bruto unitário (kg) — informativo */
  unitWeightKg?: number;
  /** Alíquota II (fração: 12,6% = 0.126) */
  iiRate: number;
  /** Alíquota IPI (fração) */
  ipiRate: number;
  /** ICMS ST na venda, valor absoluto em BRL (0 se não houver) */
  icmsStValue?: number;
}

export interface EngineGlobalInput {
  /** Taxa de câmbio moeda de origem → BRL (ex.: 5.80) */
  exchangeRate: number;
  /** Frete internacional total, na moeda de ORIGEM */
  freightTotalFob: number;
  /** Seguro internacional total, na moeda de ORIGEM */
  insuranceTotalFob?: number;
  /**
   * AFRMM total em BRL. Se undefined, calcula 25% do frete em BRL
   * (apenas modal marítimo — informar 0 para aéreo/rodoviário).
   */
  afrmmTotalBrl?: number;
  /** Taxa Siscomex total em BRL (default R$ 154,23 — 1 adição/1 item) */
  siscomexTotalBrl?: number;
  /**
   * Demais despesas aduaneiras em BRL (liberação de BL, armazenagem,
   * frete interno, despacho aduaneiro, taxa de expediente).
   * Rateadas por % valor; NÃO compõem a base do ICMS antecipado.
   */
  demaisDespesasBrl?: number;
  /** Pacote logístico em BRL — soma ao custo líquido, sem crédito */
  pacoteLogisticoBrl?: number;
  /** Royalties totais em BRL (pagos à parte do FOB declarado) */
  royaltiesBrl?: number;
  /** Taxa de assessoria sobre (royalties + custo total). Fração. */
  assessoriaRate?: number;

  // ---- ICMS importação (TTD 409/SC ou regime equivalente) ----
  /** Alíquota usada no gross-up da base ("por dentro"). Padrão 4% (Res. Senado 13/2012). */
  icmsGrossUpRate?: number;
  /** Alíquota do ICMS antecipado: 0.026 (TTD fase 1) ou 0.01 (após 36m). */
  icmsAntecipadoRate?: number;
  /**
   * REPASSE DO BENEFÍCIO TTD (negociação comercial da trading):
   * Alíquota de ICMS COBRADA DO CLIENTE na composição do custo.
   * - undefined → repasse integral (cliente paga o mesmo que a trading: 2,6%/1%)
   * - 0.04      → sem repasse (cliente paga como alíquota interestadual cheia;
   *               o spread vira receita do benefício para a trading)
   * - qualquer valor intermediário → repasse parcial negociado
   * O motor calcula `ganhoBeneficioIcms` = (negociado − efetivo) × base.
   */
  icmsNegociadoClienteRate?: number;
  /**
   * true = ICMS importação cheio (sem benefício): base por dentro com a
   * alíquota interna e cobrança integral. false (default) = antecipado TTD.
   */
  icmsFullRegime?: boolean;
  /** Alíquota interna do estado p/ regime cheio (ex.: 0.17) */
  icmsInternalRate?: number;

  // ---- PIS/COFINS importação ----
  /** PIS-Importação (default 2,1%) */
  pisImportRate?: number;
  /** COFINS-Importação base (default 9,65%) */
  cofinsImportRate?: number;
  /** Aplicar adicional de 0,6% da LC 224/2025 (default false = paridade contador) */
  applyCofinsLc224?: boolean;

  // ---- Finalidade da importação ----
  /**
   * Define a NATUREZA do cálculo:
   *  - "revenda" (padrão): o importador revende. Monta o CMV com impostos de
   *    saída (ICMS/PIS/COFINS venda) e margem desejada → preço de venda.
   *    Créditos recuperáveis conforme o regime.
   *  - "consumo_proprio": o importador é o consumidor final (uso/consumo). NÃO
   *    há revenda: sem markup, sem impostos de saída, sem margem. O entregável é
   *    o CUSTO NACIONALIZADO cheio (os tributos viram custo, sem crédito).
   */
  finalidade?: "revenda" | "consumo_proprio";

  // ---- Venda / precificação ----
  regime: RegimeTributario;
  /** ICMS na venda (fração — ex.: 0.04 interestadual p/ importados) */
  icmsVendaRate: number;
  /** PIS na venda (Lucro Real 0.0165 / Presumido 0.0065) */
  pisVendaRate: number;
  /** COFINS na venda (Lucro Real 0.076 / Presumido 0.03) */
  cofinsVendaRate: number;
  /** Lucro líquido desejado sobre a venda (fração, ex.: 0.05) */
  lucroDesejado: number;
  /** IRPJ (default 0.25 — 15% + adicional 10%) */
  irpjRate?: number;
  /** CSLL (default 0.09) */
  csllRate?: number;

  /**
   * 2º CENÁRIO — REVENDA DO COMPRADOR (Lucro Real).
   * Quando presente, o motor calcula a estimativa de custo líquido e venda do
   * COMPRADOR (cliente da trading que revende). Espelha o bloco
   * "ESTIMATIVA DE VENDA DO COMPRADOR - LUCRO REAL" da planilha de referência:
   *   custo líquido do comprador = NF de venda do importador − créditos
   *   recuperáveis do comprador (ICMS, PIS, COFINS, IPI) + royalties;
   *   preço = custo líquido / (1 − (ICMS + PIS + COFINS + margem)).
   */
  buyer?: {
    /** ICMS na revenda do comprador (fração — ex.: 0.12 interna). */
    icmsVendaRate: number;
    /** PIS na revenda (Lucro Real 0.0165). */
    pisVendaRate?: number;
    /** COFINS na revenda (Lucro Real 0.076). */
    cofinsVendaRate?: number;
    /** Lucro líquido desejado do comprador sobre a venda (ex.: 0.15). */
    lucroDesejado: number;
    /** IRPJ (default 0.25). */
    irpjRate?: number;
    /** CSLL (default 0.09). */
    csllRate?: number;
  };
}

export interface EngineItemResult {
  description: string;
  ncm: string;
  quantity: number;
  unit: string;
  unitPriceFob: number;
  totalFob: number;
  /** Rateio: participação do item no FOB total (fração) */
  shareOfValue: number;

  // Valores em BRL
  fobBrl: number;
  freightBrl: number;
  insuranceBrl: number;
  customsValueBrl: number; // VA = Valor Aduaneiro
  afrmmBrl: number;
  siscomexBrl: number;
  demaisDespesasBrl: number;

  // Tributos de nacionalização
  iiRate: number;
  iiValue: number;
  merchandiseValue: number;     // VA + II (valor de mercadoria p/ NF entrada)
  merchandiseUnitValue: number;
  ipiBase: number;              // VA + II
  ipiRate: number;
  ipiValue: number;
  pisRate: number;
  pisValue: number;
  cofinsRate: number;
  cofinsValue: number;
  icmsBase: number;
  icmsRate: number;             // alíquota EFETIVA (desembolso da trading)
  icmsValue: number;            // ICMS efetivamente recolhido
  icmsClienteRate: number;      // alíquota NEGOCIADA cobrada do cliente
  icmsClienteValue: number;     // ICMS na composição de custo do cliente
  ganhoBeneficioIcms: number;   // receita da trading = cliente − efetivo

  // Custos
  totalCostBeforeAssessoria: number;
  assessoriaValue: number;
  totalCost: number;
  unitCost: number;

  // Créditos e custo líquido
  recoverableCredits: number;   // conforme regime
  netImportCost: number;        // custo total − créditos
  netTotalCost: number;         // + pacote logístico rateado
  netUnitCost: number;          // custo líquido por unidade de medida do item (PC/kg/milheiro/…)

  // Peso e custo por kg (quando o peso é informado)
  weightKgTotal: number;        // peso bruto total do item (kg)
  netCostPerKg: number;         // custo líquido por kg (0 se sem peso)

  // Venda
  markupFactor: number;         // fator divisor
  salePrice: number;            // valor dos produtos
  saleUnitPrice: number;
  icmsVendaValue: number;
  ipiVendaValue: number;
  icmsStValue: number;
  totalInvoiceValue: number;    // preço + IPI + ICMS ST
  unitInvoiceValue: number;
  royaltiesAllocated: number;   // royalties (+ margem) rateados
  totalWithRoyalties: number;
  unitWithRoyalties: number;

  // ---- 2º cenário: revenda do COMPRADOR (Lucro Real) ----
  // Preenchidos apenas quando globals.buyer está presente.
  /** Custo líquido do comprador (NF venda importador − créditos + royalties). */
  buyerNetCost?: number;
  buyerNetUnitCost?: number;
  buyerMarkupFactor?: number;
  /** Valor dos produtos (venda do comprador). */
  buyerSalePrice?: number;
  buyerSaleUnitPrice?: number;
  buyerIcmsVendaValue?: number;
  buyerIpiVendaValue?: number;
  buyerIcmsStValue?: number;
  /** Total da NF de venda do comprador (preço + IPI + ICMS ST). */
  buyerTotalInvoiceValue?: number;
  buyerUnitInvoiceValue?: number;
}

export interface EngineSummary {
  /** Natureza do cálculo: revenda (com venda/margem) ou consumo próprio (só custo). */
  finalidade: "revenda" | "consumo_proprio";
  exchangeRate: number;
  fobTotalFob: number;
  fobTotalBrl: number;
  freightTotalBrl: number;
  insuranceTotalBrl: number;
  cifTotalBrl: number;

  // Tributos consolidados
  iiTotal: number;
  ipiTotal: number;
  pisTotal: number;
  cofinsTotal: number;
  icmsTotal: number;           // desembolso efetivo (legislação TTD)
  icmsClienteTotal: number;    // ICMS cobrado do cliente (negociado)
  ganhoBeneficioIcmsTotal: number; // spread do benefício retido pela trading
  siscomexTotal: number;
  taxesTotal: number;           // tributos de nacionalização (sem AFRMM)

  // Custos aduaneiros
  afrmmTotal: number;
  demaisDespesasTotal: number;
  customsCostsTotal: number;    // demais despesas + AFRMM

  // NF-e de Nacionalização
  nfeProduto: number;           // CIF
  nfeIi: number;
  nfeIpi: number;
  nfeOutrasDespesas: number;    // PIS + COFINS + ICMS + Siscomex + AFRMM
  nfeNacionalizacao: number;

  // Outras despesas operacionais
  pacoteLogistico: number;
  assessoriaTotal: number;
  royaltiesTotal: number;

  // Custo líquido consolidado
  recoverableCreditsTotal: number;
  netCostTotal: number;

  // Precificação
  margemBruta: number;          // lucroDesejado / (1 − (IRPJ + CSLL))
  markupFactor: number;
  salePriceTotal: number;
  icmsVendaTotal: number;
  pisVendaTotal: number;
  cofinsVendaTotal: number;
  ipiVendaTotal: number;
  icmsStTotal: number;
  totalSaleInvoice: number;     // valor total da venda (produtos + IPI + ST)
  lucroDesejadoValor: number;
  irpjValor: number;
  csllValor: number;
  royaltiesComMargem: number;
  totalOperacaoComRoyalties: number;

  // ---- 2º cenário: revenda do COMPRADOR (Lucro Real) ----
  // Preenchidos apenas quando globals.buyer está presente.
  buyer?: {
    /** Custo líquido total do comprador. */
    netCostTotal: number;
    margemBruta: number;
    markupFactor: number;
    /** Valor dos produtos (venda do comprador). */
    salePriceTotal: number;
    icmsVendaTotal: number;
    pisVendaTotal: number;
    cofinsVendaTotal: number;
    ipiVendaTotal: number;
    icmsStTotal: number;
    /** Total da venda do comprador (produtos + IPI + ST). */
    totalSaleInvoice: number;
    lucroDesejadoValor: number;
    irpjValor: number;
    csllValor: number;
  };

  // ---- GANHO DA OPERAÇÃO (visão trading) ----
  ganho: {
    /** Margem da venda (lucro desejado do importador em R$). */
    margemVenda: number;
    /** Margem dos royalties retida. */
    margemRoyalties: number;
    /** Ganho do benefício de ICMS (spread TTD). */
    ganhoIcms: number;
    /** Soma dos ganhos da operação. */
    total: number;
  };
}

export interface EngineResult {
  items: EngineItemResult[];
  summary: EngineSummary;
  warnings: string[];
}

// ============================================================
// CONSTANTES (paridade com a planilha de referência)
// ============================================================

const DEFAULT_PIS_IMPORT = 0.021;       // Lei 10.865/2004, art. 8º, I
const DEFAULT_COFINS_IMPORT = 0.0965;   // idem
const COFINS_LC224_ADDON = 0.006;       // LC 224/2025 (vigência 2026)
const DEFAULT_SISCOMEX = 154.23;
// AFRMM longo curso = 8% (Lei 14.301/2022 — programa BR do Mar; reduziu de 25% p/ 8%).
const DEFAULT_AFRMM_RATE = 0.08;        // sobre frete marítimo em BRL
const DEFAULT_ICMS_GROSSUP = 0.04;      // Res. Senado 13/2012 (importados)
const DEFAULT_ICMS_ANTECIPADO = 0.026;  // fallback bruto do motor (TTD SC, primeiros 36m). A regra de negócio "TTD máximo" (1,0%) é aplicada no estimativaService.
const DEFAULT_IRPJ = 0.25;              // 15% + adicional 10%
const DEFAULT_CSLL = 0.09;

// ============================================================
// MOTOR
// ============================================================

export function calculateImportCost(
  globals: EngineGlobalInput,
  items: EngineItemInput[]
): EngineResult {
  const warnings: string[] = [];
  if (items.length === 0) throw new Error("Nenhum item informado");

  const fx = globals.exchangeRate;
  if (!fx || fx <= 0) throw new Error("Taxa de câmbio inválida");

  // ---- Totais globais ----
  const fobTotalFob = items.reduce((s, i) => s + i.quantity * i.unitPriceFob, 0);
  if (fobTotalFob <= 0) throw new Error("Valor FOB total deve ser positivo");

  const freightTotalBrl = (globals.freightTotalFob ?? 0) * fx;
  const insuranceTotalBrl = (globals.insuranceTotalFob ?? 0) * fx;
  const fobTotalBrl = fobTotalFob * fx;

  const afrmmTotal = globals.afrmmTotalBrl ?? freightTotalBrl * DEFAULT_AFRMM_RATE;
  if (globals.afrmmTotalBrl === undefined) {
    warnings.push(
      `AFRMM calculado automaticamente como ${(DEFAULT_AFRMM_RATE * 100).toFixed(0)}% do ` +
      `frete (R$ ${afrmmTotal.toFixed(2)} — Lei 14.301/2022, longo curso). ` +
      `Aplicável apenas ao modal marítimo — informe 0 para outros modais.`
    );
  }
  const siscomexTotal = globals.siscomexTotalBrl ?? DEFAULT_SISCOMEX;
  const demaisDespesasTotal = globals.demaisDespesasBrl ?? 0;
  const pacoteLogistico = globals.pacoteLogisticoBrl ?? 0;
  const royaltiesTotal = globals.royaltiesBrl ?? 0;
  const assessoriaRate = globals.assessoriaRate ?? 0;

  // ---- Alíquotas de importação ----
  const pisRate = globals.pisImportRate ?? DEFAULT_PIS_IMPORT;
  let cofinsRate = globals.cofinsImportRate ?? DEFAULT_COFINS_IMPORT;
  if (globals.applyCofinsLc224) cofinsRate += COFINS_LC224_ADDON;

  // ---- ICMS importação ----
  const icmsFull = globals.icmsFullRegime ?? false;
  const grossUpRate = icmsFull
    ? (globals.icmsInternalRate ?? 0.17)
    : (globals.icmsGrossUpRate ?? DEFAULT_ICMS_GROSSUP);
  const icmsRate = icmsFull
    ? (globals.icmsInternalRate ?? 0.17)
    : (globals.icmsAntecipadoRate ?? DEFAULT_ICMS_ANTECIPADO);
  if (grossUpRate >= 1) throw new Error("Alíquota de gross-up do ICMS inválida");

  // ---- Finalidade: revenda (com venda) ou consumo próprio (só custo) ----
  const isConsumo = globals.finalidade === "consumo_proprio";

  // ---- Fator de precificação (markup divisor) — só para REVENDA ----
  const irpj = globals.irpjRate ?? DEFAULT_IRPJ;
  const csll = globals.csllRate ?? DEFAULT_CSLL;
  const margemBruta = isConsumo ? 0 : globals.lucroDesejado / (1 - (irpj + csll));
  const markupFactor = isConsumo
    ? 1
    : 1 - (globals.icmsVendaRate + globals.pisVendaRate + globals.cofinsVendaRate + margemBruta);
  if (!isConsumo && markupFactor <= 0) {
    throw new Error(
      "Fator de markup ≤ 0: a soma de impostos de venda + margem bruta excede 100%. " +
      "Reduza o lucro desejado ou revise as alíquotas."
    );
  }

  // ---- 2º cenário: fator de markup do COMPRADOR (revenda Lucro Real) ----
  // Só se aplica em revenda; em consumo próprio não há cadeia de revenda.
  const buyer = isConsumo ? undefined : globals.buyer;
  let buyerMargemBruta = 0;
  let buyerMarkupFactor = 0;
  let buyerPisVendaRate = 0;
  let buyerCofinsVendaRate = 0;
  if (buyer) {
    buyerPisVendaRate = buyer.pisVendaRate ?? 0.0165;
    buyerCofinsVendaRate = buyer.cofinsVendaRate ?? 0.076;
    const buyerIrpj = buyer.irpjRate ?? DEFAULT_IRPJ;
    const buyerCsll = buyer.csllRate ?? DEFAULT_CSLL;
    buyerMargemBruta = buyer.lucroDesejado / (1 - (buyerIrpj + buyerCsll));
    buyerMarkupFactor =
      1 - (buyer.icmsVendaRate + buyerPisVendaRate + buyerCofinsVendaRate + buyerMargemBruta);
    if (buyerMarkupFactor <= 0) {
      throw new Error(
        "Fator de markup do COMPRADOR ≤ 0: impostos de revenda + margem excedem 100%. " +
        "Reduza o lucro desejado do comprador ou revise as alíquotas."
      );
    }
  }

  // ---- Cálculo por item ----
  const results: EngineItemResult[] = items.map((it) => {
    const totalFob = it.quantity * it.unitPriceFob;
    const share = totalFob / fobTotalFob; // % VALOR — rateio por valor FOB

    const fobBrl = totalFob * fx;
    const freightBrl = freightTotalBrl * share;
    const insuranceBrl = insuranceTotalBrl * share;
    const customsValueBrl = fobBrl + freightBrl + insuranceBrl; // VA

    const afrmmBrl = afrmmTotal * share;
    const siscomexBrl = siscomexTotal * share;
    const despesasBrl = demaisDespesasTotal * share;

    // II
    const iiValue = customsValueBrl * it.iiRate;
    const merchandiseValue = customsValueBrl + iiValue;

    // IPI
    const ipiBase = customsValueBrl + iiValue;
    const ipiValue = ipiBase * it.ipiRate;

    // PIS / COFINS importação — base: VA (Lei 10.865/2004)
    const pisValue = customsValueBrl * pisRate;
    const cofinsValue = customsValueBrl * cofinsRate;

    // ICMS — base por dentro: inclui AFRMM e Siscomex (despesas aduaneiras
    // que integram a base, conforme prática da DI), MAS NÃO as demais despesas.
    const icmsBaseNumerator =
      customsValueBrl + afrmmBrl + siscomexBrl + iiValue + ipiValue + pisValue + cofinsValue;
    const icmsBase = icmsBaseNumerator / (1 - grossUpRate);
    // Desembolso REAL da trading (antecipado TTD ou cheio)
    const icmsValue = icmsBase * icmsRate;
    // ICMS NEGOCIADO cobrado do cliente (repasse do benefício)
    const icmsClienteRate = globals.icmsNegociadoClienteRate ?? icmsRate;
    const icmsClienteValue = icmsBase * icmsClienteRate;
    // Spread do benefício retido pela trading
    const ganhoBeneficioIcms = icmsClienteValue - icmsValue;

    // Custo total — composto com o ICMS NEGOCIADO (é o que o cliente paga)
    const totalCostBefore =
      customsValueBrl + afrmmBrl + siscomexBrl + despesasBrl +
      iiValue + ipiValue + pisValue + cofinsValue + icmsClienteValue;

    const assessoriaValue = (royaltiesTotal * share + totalCostBefore) * assessoriaRate;
    const totalCost = totalCostBefore + assessoriaValue;

    // Créditos recuperáveis por regime. Em CONSUMO PRÓPRIO (uso final) não há
    // revenda: os tributos viram CUSTO e não geram crédito.
    let credits = 0;
    if (isConsumo) {
      credits = 0;
    } else
    switch (globals.regime) {
      case "lucro_real":
        // PIS, COFINS (não-cumulativo), IPI e ICMS são recuperáveis.
        // O crédito de ICMS do adquirente é o valor destacado/cobrado (negociado).
        credits = pisValue + cofinsValue + ipiValue + icmsClienteValue;
        break;
      case "lucro_presumido":
        // PIS/COFINS cumulativos NÃO geram crédito; IPI (se equiparado
        // a industrial) e ICMS sim
        credits = ipiValue + icmsClienteValue;
        break;
      case "simples_nacional":
        credits = 0;
        break;
    }

    const netImportCost = totalCost - credits;
    const netTotalCost = netImportCost + pacoteLogistico * share;

    // Venda — só para REVENDA. Em consumo próprio o "preço" é o próprio custo
    // nacionalizado (sem markup, sem impostos de saída).
    const salePrice = isConsumo ? netTotalCost : netTotalCost / markupFactor;
    const icmsVendaValue = isConsumo ? 0 : salePrice * globals.icmsVendaRate;
    const ipiVendaValue = isConsumo ? 0 : salePrice * it.ipiRate;
    const icmsStValue = isConsumo ? 0 : (it.icmsStValue ?? 0);
    const totalInvoiceValue = isConsumo ? netTotalCost : salePrice + ipiVendaValue + icmsStValue;

    // Royalties na venda: total + margem sobre royalties, rateado
    const royaltiesComMargemTotal = royaltiesTotal * (1 + globals.lucroDesejado);
    const royaltiesAllocated = royaltiesComMargemTotal * share;

    // ---- 2º cenário: revenda do COMPRADOR (Lucro Real) ----
    // Espelha a coluna BA da planilha: o comprador parte da NF de venda do
    // importador e recupera, como crédito (Lucro Real), o ICMS, PIS, COFINS e
    // IPI destacados na compra; soma royalties (+ margem) rateados.
    let buyerNetCost: number | undefined;
    let buyerSalePrice: number | undefined;
    let buyerIcmsVendaValue: number | undefined;
    let buyerIpiVendaValue: number | undefined;
    let buyerIcmsStValueOut: number | undefined;
    let buyerTotalInvoiceValue: number | undefined;
    if (buyer) {
      buyerNetCost =
        totalInvoiceValue            // NF de venda do importador (preço + IPI + ST)
        - ipiVendaValue              // crédito de IPI
        - icmsVendaValue             // crédito de ICMS (destacado na venda do importador)
        - salePrice * buyerPisVendaRate    // crédito de PIS sobre o valor dos produtos
        - salePrice * buyerCofinsVendaRate // crédito de COFINS
        + royaltiesAllocated;        // royalties (+ margem) rateados (zerados por padrão)
      buyerSalePrice = buyerNetCost / buyerMarkupFactor;
      buyerIcmsVendaValue = buyerSalePrice * buyer.icmsVendaRate;
      buyerIpiVendaValue = buyerSalePrice * it.ipiRate;
      buyerIcmsStValueOut = it.icmsStValue ?? 0;
      buyerTotalInvoiceValue = buyerSalePrice + buyerIpiVendaValue + buyerIcmsStValueOut;
    }

    return {
      description: it.description,
      ncm: it.ncm,
      quantity: it.quantity,
      unit: it.unit ?? "UN",
      unitPriceFob: it.unitPriceFob,
      totalFob,
      shareOfValue: share,
      fobBrl, freightBrl, insuranceBrl, customsValueBrl,
      afrmmBrl, siscomexBrl, demaisDespesasBrl: despesasBrl,
      iiRate: it.iiRate, iiValue,
      merchandiseValue,
      merchandiseUnitValue: it.quantity > 0 ? merchandiseValue / it.quantity : 0,
      ipiBase, ipiRate: it.ipiRate, ipiValue,
      pisRate, pisValue, cofinsRate, cofinsValue,
      icmsBase, icmsRate, icmsValue,
      icmsClienteRate, icmsClienteValue, ganhoBeneficioIcms,
      totalCostBeforeAssessoria: totalCostBefore,
      assessoriaValue, totalCost,
      unitCost: it.quantity > 0 ? totalCost / it.quantity : 0,
      recoverableCredits: credits,
      netImportCost, netTotalCost,
      netUnitCost: it.quantity > 0 ? netTotalCost / it.quantity : 0,
      weightKgTotal: (it.unitWeightKg ?? 0) * it.quantity,
      netCostPerKg: (it.unitWeightKg ?? 0) * it.quantity > 0
        ? netTotalCost / ((it.unitWeightKg ?? 0) * it.quantity)
        : 0,
      markupFactor,
      salePrice,
      saleUnitPrice: it.quantity > 0 ? salePrice / it.quantity : 0,
      icmsVendaValue, ipiVendaValue, icmsStValue,
      totalInvoiceValue,
      unitInvoiceValue: it.quantity > 0 ? totalInvoiceValue / it.quantity : 0,
      royaltiesAllocated,
      totalWithRoyalties: totalInvoiceValue + royaltiesAllocated,
      unitWithRoyalties: it.quantity > 0
        ? (totalInvoiceValue + royaltiesAllocated) / it.quantity
        : 0,
      buyerNetCost,
      buyerNetUnitCost: buyerNetCost != null && it.quantity > 0 ? buyerNetCost / it.quantity : undefined,
      buyerMarkupFactor: buyer ? buyerMarkupFactor : undefined,
      buyerSalePrice,
      buyerSaleUnitPrice: buyerSalePrice != null && it.quantity > 0 ? buyerSalePrice / it.quantity : undefined,
      buyerIcmsVendaValue,
      buyerIpiVendaValue,
      buyerIcmsStValue: buyerIcmsStValueOut,
      buyerTotalInvoiceValue,
      buyerUnitInvoiceValue: buyerTotalInvoiceValue != null && it.quantity > 0
        ? buyerTotalInvoiceValue / it.quantity
        : undefined,
    };
  });

  // ---- Consolidação ----
  const sum = (f: (r: EngineItemResult) => number) => results.reduce((s, r) => s + f(r), 0);

  const cifTotalBrl = fobTotalBrl + freightTotalBrl + insuranceTotalBrl;
  const iiTotal = sum(r => r.iiValue);
  const ipiTotal = sum(r => r.ipiValue);
  const pisTotal = sum(r => r.pisValue);
  const cofinsTotal = sum(r => r.cofinsValue);
  const icmsTotal = sum(r => r.icmsValue);
  const icmsClienteTotal = sum(r => r.icmsClienteValue);
  const ganhoBeneficioIcmsTotal = sum(r => r.ganhoBeneficioIcms);
  const assessoriaTotal = sum(r => r.assessoriaValue);
  const creditsTotal = sum(r => r.recoverableCredits);
  const netCostTotal = sum(r => r.netTotalCost);
  const salePriceTotal = sum(r => r.salePrice);
  const ipiVendaTotal = sum(r => r.ipiVendaValue);
  const icmsStTotal = sum(r => r.icmsStValue);
  const totalSaleInvoice = salePriceTotal + ipiVendaTotal + icmsStTotal;

  const nfeOutrasDespesas = pisTotal + cofinsTotal + icmsClienteTotal + siscomexTotal + afrmmTotal;
  const lucroDesejadoValor = salePriceTotal * globals.lucroDesejado;
  const margemBrutaValor = salePriceTotal * margemBruta;

  // ---- 2º cenário: consolidação do COMPRADOR ----
  let buyerSummary: EngineSummary["buyer"];
  if (buyer) {
    const buyerNetCostTotal = sum(r => r.buyerNetCost ?? 0);
    const buyerSalePriceTotal = sum(r => r.buyerSalePrice ?? 0);
    const buyerIpiVendaTotal = sum(r => r.buyerIpiVendaValue ?? 0);
    const buyerIcmsStTotal = sum(r => r.buyerIcmsStValue ?? 0);
    const buyerIrpj = buyer.irpjRate ?? DEFAULT_IRPJ;
    const buyerCsll = buyer.csllRate ?? DEFAULT_CSLL;
    const buyerMargemBrutaValor = buyerSalePriceTotal * buyerMargemBruta;
    buyerSummary = {
      netCostTotal: buyerNetCostTotal,
      margemBruta: buyerMargemBruta,
      markupFactor: buyerMarkupFactor,
      salePriceTotal: buyerSalePriceTotal,
      icmsVendaTotal: buyerSalePriceTotal * buyer.icmsVendaRate,
      pisVendaTotal: buyerSalePriceTotal * buyerPisVendaRate,
      cofinsVendaTotal: buyerSalePriceTotal * buyerCofinsVendaRate,
      ipiVendaTotal: buyerIpiVendaTotal,
      icmsStTotal: buyerIcmsStTotal,
      totalSaleInvoice: buyerSalePriceTotal + buyerIpiVendaTotal + buyerIcmsStTotal,
      lucroDesejadoValor: buyerSalePriceTotal * buyer.lucroDesejado,
      irpjValor: buyerMargemBrutaValor * buyerIrpj,
      csllValor: buyerMargemBrutaValor * buyerCsll,
    };
  }

  // ---- GANHO DA OPERAÇÃO (visão trading) ----
  // margemVenda = lucro desejado do importador; margemRoyalties = margem retida
  // sobre royalties; ganhoIcms = spread do benefício TTD repassado/retido.
  const ganhoMargemRoyalties = royaltiesTotal * globals.lucroDesejado;
  const ganho = {
    margemVenda: lucroDesejadoValor,
    margemRoyalties: ganhoMargemRoyalties,
    ganhoIcms: ganhoBeneficioIcmsTotal,
    total: lucroDesejadoValor + ganhoMargemRoyalties + ganhoBeneficioIcmsTotal,
  };

  const summary: EngineSummary = {
    finalidade: isConsumo ? "consumo_proprio" : "revenda",
    exchangeRate: fx,
    fobTotalFob, fobTotalBrl, freightTotalBrl, insuranceTotalBrl, cifTotalBrl,
    iiTotal, ipiTotal, pisTotal, cofinsTotal, icmsTotal,
    icmsClienteTotal, ganhoBeneficioIcmsTotal,
    siscomexTotal,
    taxesTotal: iiTotal + ipiTotal + pisTotal + cofinsTotal + icmsClienteTotal + siscomexTotal,
    afrmmTotal, demaisDespesasTotal,
    customsCostsTotal: demaisDespesasTotal + afrmmTotal,
    nfeProduto: cifTotalBrl,
    nfeIi: iiTotal,
    nfeIpi: ipiTotal,
    nfeOutrasDespesas,
    nfeNacionalizacao: cifTotalBrl + iiTotal + ipiTotal + nfeOutrasDespesas,
    pacoteLogistico, assessoriaTotal, royaltiesTotal,
    recoverableCreditsTotal: creditsTotal,
    netCostTotal,
    margemBruta, markupFactor,
    salePriceTotal,
    icmsVendaTotal: salePriceTotal * globals.icmsVendaRate,
    pisVendaTotal: salePriceTotal * globals.pisVendaRate,
    cofinsVendaTotal: salePriceTotal * globals.cofinsVendaRate,
    ipiVendaTotal, icmsStTotal,
    totalSaleInvoice,
    lucroDesejadoValor,
    irpjValor: margemBrutaValor * irpj,
    csllValor: margemBrutaValor * csll,
    royaltiesComMargem: royaltiesTotal * (1 + globals.lucroDesejado),
    totalOperacaoComRoyalties: totalSaleInvoice + royaltiesTotal * (1 + globals.lucroDesejado),
    buyer: buyerSummary,
    ganho,
  };

  if (
    globals.icmsNegociadoClienteRate !== undefined &&
    Math.abs(globals.icmsNegociadoClienteRate - icmsRate) > 1e-9
  ) {
    warnings.push(
      `ICMS negociado com o cliente (${(globals.icmsNegociadoClienteRate * 100).toFixed(2)}%) ` +
      `difere do desembolso efetivo da trading (${(icmsRate * 100).toFixed(2)}% — TTD 409). ` +
      `Ganho do benefício retido: R$ ${ganhoBeneficioIcmsTotal.toFixed(2)}.`
    );
  }
  if (globals.regime === "lucro_presumido") {
    warnings.push(
      "Lucro Presumido: PIS/COFINS-Importação não geram crédito (regime cumulativo). " +
      "Confirme alíquotas de venda: PIS 0,65% e COFINS 3%."
    );
  }
  if (!globals.applyCofinsLc224) {
    warnings.push(
      "COFINS-Importação calculada a 9,65% (sem o adicional de 0,6% da LC 224/2025). " +
      "Ative applyCofinsLc224 para operações registradas a partir de 2026, conforme orientação do seu contador."
    );
  }

  return { items: results, summary, warnings };
}
