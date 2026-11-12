/**
 * Import Intelligence Service - O Cérebro Agêntico da Excambia
 * 
 * Transforma a Excambia de chatbot em agente inteligente real.
 * Em vez de apenas responder perguntas, ela EXECUTA ações:
 * - Analisa cotações automaticamente e dá GO/NO-GO
 * - Detecta anomalias de preço
 * - Sugere timing ótimo de compra
 * - Compara com histórico proprietário
 * - Gera alertas proativos
 * - Simula cenários de reforma tributária
 * 
 * Excambia - Inteligência que nenhuma planilha ou ChatGPT genérico consegue replicar
 */

import { simulateReformImpact, generateReformTimeline, getReformPhase } from "./taxReformService";

// ============================================================
// INTERFACES
// ============================================================

export interface ImportOpportunity {
  id?: number;
  products: ProductAnalysis[];
  supplier: {
    name: string;
    country: string;
    reliabilityScore?: number; // 0-100
    previousOrders?: number;
  };
  logistics: {
    incoterm: string;
    originCountry: string;
    destinationState: string;
    port?: string;
    estimatedTransitDays?: number;
    freightCents: number;
    insuranceCents: number;
  };
  financial: {
    totalFobCents: number;
    totalCifCents: number;
    totalTaxesCents: number;
    totalCostCents: number;
    exchangeRate: number;
    currency: string;
  };
  metadata?: {
    quotationDate?: Date;
    validUntil?: Date;
    quotationNumber?: string;
  };
}

export interface ProductAnalysis {
  name: string;
  ncm: string;
  quantity: number;
  unit: string;
  unitPriceFobCents: number;
  unitCostNationalizedCents: number;
  targetPriceCents?: number;
  suggestedPriceCents: number;
  marketBenchmark?: {
    bestPriceCents: number;
    averagePriceCents: number;
    supplierRank: number;
    totalSuppliers: number;
    pricePosition: "best" | "competitive" | "above_average" | "expensive";
  };
}

export interface IntelligenceReport {
  // Overall verdict
  verdict: "GO" | "NEGOTIATE" | "NO_GO" | "WAIT";
  confidenceScore: number; // 0-100
  
  // Executive summary
  summary: string;
  
  // Detailed analysis sections
  priceAnalysis: PriceIntelligence;
  taxAnalysis: TaxIntelligence;
  timingAnalysis: TimingIntelligence;
  riskAnalysis: RiskIntelligence;
  negotiationStrategy: NegotiationIntelligence;
  reformImpact: ReformIntelligence;
  
  // Actionable recommendations
  actions: ActionItem[];
  
  // Score breakdown
  scores: {
    priceScore: number;    // 0-100
    timingScore: number;   // 0-100
    supplierScore: number; // 0-100
    marginScore: number;   // 0-100
    riskScore: number;     // 0-100 (higher = less risky)
    overallScore: number;  // 0-100
  };
}

export interface PriceIntelligence {
  isCompetitive: boolean;
  pricePosition: string;
  savingsOpportunity: number; // cents
  savingsPercent: number;
  anomalies: PriceAnomaly[];
  benchmarkComparison: string;
}

export interface PriceAnomaly {
  productName: string;
  type: "too_high" | "too_low" | "sudden_change" | "outlier";
  severity: "info" | "warning" | "critical";
  description: string;
  expectedRangeCents: [number, number];
  actualCents: number;
}

export interface TaxIntelligence {
  totalTaxBurden: number; // basis points
  optimizationOpportunities: TaxOptimization[];
  effectiveTaxRate: number;
  taxBreakdown: Record<string, number>;
}

export interface TaxOptimization {
  type: "ncm_reclassification" | "regime_change" | "state_benefit" | "mercosul" | "drawback" | "reform_timing";
  description: string;
  potentialSavingsCents: number;
  complexity: "easy" | "medium" | "hard";
  timeToImplement: string;
}

export interface TimingIntelligence {
  recommendation: "buy_now" | "wait" | "urgent";
  reasoning: string;
  exchangeRateTrend: "favorable" | "unfavorable" | "stable";
  commodityTrend: "falling" | "rising" | "stable";
  bestWindowEstimate: string;
  urgencyFactors: string[];
}

export interface RiskIntelligence {
  overallRisk: "low" | "medium" | "high";
  factors: RiskFactor[];
  mitigations: string[];
}

export interface RiskFactor {
  name: string;
  level: "low" | "medium" | "high";
  description: string;
  impact: string;
}

export interface NegotiationIntelligence {
  targetDiscount: number; // percentage
  arguments: string[];
  counterArguments: string[];
  walkAwayPrice: number; // cents
  bestAlternative: string;
}

export interface ReformIntelligence {
  currentYearImpact: string;
  futureImpact: string;
  recommendation: string;
  yearlyProjection: Array<{
    year: number;
    taxDifferenceCents: number;
    differencePercent: number;
  }>;
}

export interface ActionItem {
  priority: "high" | "medium" | "low";
  action: string;
  deadline?: string;
  expectedImpact: string;
  category: "negotiation" | "tax" | "timing" | "logistics" | "risk";
}

// ============================================================
// MOTOR DE INTELIGÊNCIA
// ============================================================

/**
 * Generate a complete intelligence report for an import opportunity
 * This is the MAIN function that makes Excambia an agent, not just a chatbot
 */
export async function generateIntelligenceReport(
  opportunity: ImportOpportunity,
  historicalData?: {
    previousImports: number;
    averageCostPerUnit: Record<string, number>;
    bestPrices: Record<string, { cents: number; supplier: string }>;
    exchangeRateHistory: Array<{ date: Date; rate: number }>;
  }
): Promise<IntelligenceReport> {
  
  // 1. Price Analysis
  const priceAnalysis = analyzePrices(opportunity, historicalData);
  
  // 2. Tax Analysis
  const taxAnalysis = analyzeTaxes(opportunity);
  
  // 3. Timing Analysis
  const timingAnalysis = analyzeTiming(opportunity, historicalData);
  
  // 4. Risk Analysis
  const riskAnalysis = analyzeRisks(opportunity);
  
  // 5. Negotiation Strategy
  const negotiationStrategy = generateNegotiationStrategy(opportunity, priceAnalysis, historicalData);
  
  // 6. Reform Impact
  const reformImpact = await analyzeReformImpact(opportunity);
  
  // 7. Calculate scores
  const scores = calculateScores(priceAnalysis, taxAnalysis, timingAnalysis, riskAnalysis, opportunity);
  
  // 8. Determine verdict
  const verdict = determineVerdict(scores, riskAnalysis, priceAnalysis);
  
  // 9. Generate actions
  const actions = generateActions(priceAnalysis, taxAnalysis, timingAnalysis, riskAnalysis, negotiationStrategy, reformImpact);
  
  // 10. Generate summary
  const summary = generateSummary(verdict, scores, opportunity, priceAnalysis, reformImpact);
  
  return {
    verdict,
    confidenceScore: scores.overallScore,
    summary,
    priceAnalysis,
    taxAnalysis,
    timingAnalysis,
    riskAnalysis,
    negotiationStrategy,
    reformImpact,
    actions,
    scores,
  };
}

// ============================================================
// ANÁLISE DE PREÇOS
// ============================================================

function analyzePrices(
  opportunity: ImportOpportunity,
  historicalData?: any
): PriceIntelligence {
  const anomalies: PriceAnomaly[] = [];
  let totalSavingsOpportunity = 0;
  
  for (const product of opportunity.products) {
    // Check against market benchmark
    if (product.marketBenchmark) {
      const benchmark = product.marketBenchmark;
      const priceDiff = product.unitPriceFobCents - benchmark.bestPriceCents;
      
      if (priceDiff > 0) {
        totalSavingsOpportunity += priceDiff * product.quantity;
      }
      
      // Detect anomalies
      if (product.unitPriceFobCents > benchmark.averagePriceCents * 1.3) {
        anomalies.push({
          productName: product.name,
          type: "too_high",
          severity: "warning",
          description: `Preço ${((product.unitPriceFobCents / benchmark.averagePriceCents - 1) * 100).toFixed(0)}% acima da média do mercado`,
          expectedRangeCents: [benchmark.bestPriceCents, Math.round(benchmark.averagePriceCents * 1.1)],
          actualCents: product.unitPriceFobCents,
        });
      }
      
      if (product.unitPriceFobCents < benchmark.bestPriceCents * 0.7) {
        anomalies.push({
          productName: product.name,
          type: "too_low",
          severity: "critical",
          description: `Preço suspeitamente baixo — ${((1 - product.unitPriceFobCents / benchmark.bestPriceCents) * 100).toFixed(0)}% abaixo do melhor preço registrado. Verificar qualidade.`,
          expectedRangeCents: [benchmark.bestPriceCents, benchmark.averagePriceCents],
          actualCents: product.unitPriceFobCents,
        });
      }
    }
    
    // Check target price viability
    if (product.targetPriceCents && product.unitCostNationalizedCents > product.targetPriceCents) {
      anomalies.push({
        productName: product.name,
        type: "too_high",
        severity: "critical",
        description: `Custo nacionalizado (R$ ${(product.unitCostNationalizedCents / 100).toFixed(2)}) excede preço alvo (R$ ${(product.targetPriceCents / 100).toFixed(2)})`,
        expectedRangeCents: [0, product.targetPriceCents],
        actualCents: product.unitCostNationalizedCents,
      });
    }
  }
  
  const savingsPercent = opportunity.financial.totalFobCents > 0
    ? (totalSavingsOpportunity / opportunity.financial.totalFobCents) * 100
    : 0;
  
  const hasCompetitivePrices = anomalies.filter(a => a.type === "too_high" && a.severity !== "info").length === 0;
  
  return {
    isCompetitive: hasCompetitivePrices,
    pricePosition: hasCompetitivePrices ? "Competitivo" : "Acima do mercado",
    savingsOpportunity: totalSavingsOpportunity,
    savingsPercent,
    anomalies,
    benchmarkComparison: totalSavingsOpportunity > 0
      ? `Oportunidade de economia de R$ ${(totalSavingsOpportunity / 100).toFixed(2)} (${savingsPercent.toFixed(1)}%) negociando com fornecedores alternativos.`
      : "Preços dentro da faixa competitiva do mercado.",
  };
}

// ============================================================
// ANÁLISE TRIBUTÁRIA
// ============================================================

function analyzeTaxes(opportunity: ImportOpportunity): TaxIntelligence {
  const optimizations: TaxOptimization[] = [];
  
  const totalTaxBurden = opportunity.financial.totalCifCents > 0
    ? Math.round((opportunity.financial.totalTaxesCents / opportunity.financial.totalCifCents) * 10000)
    : 0;
  
  // Check for state benefits
  if (opportunity.logistics.destinationState === "SC") {
    optimizations.push({
      type: "state_benefit",
      description: "TTD 409 (SC): Crédito presumido de 75% do ICMS na importação. Verificar se a empresa possui o benefício.",
      potentialSavingsCents: Math.round(opportunity.financial.totalTaxesCents * 0.15),
      complexity: "medium",
      timeToImplement: "30-60 dias para habilitação",
    });
  }
  
  // Check Mercosul opportunity
  if (!opportunity.supplier.country?.toLowerCase().includes("china") && !opportunity.logistics.originCountry?.toLowerCase().includes("china")) {
    if (["argentina", "paraguai", "uruguai", "brasil"].some(c => 
      opportunity.logistics.originCountry?.toLowerCase().includes(c) || 
      opportunity.supplier.country?.toLowerCase().includes(c)
    )) {
      optimizations.push({
        type: "mercosul",
        description: "Origem Mercosul: Possível redução/isenção do Imposto de Importação com Certificado de Origem.",
        potentialSavingsCents: Math.round(opportunity.financial.totalTaxesCents * 0.3),
        complexity: "easy",
        timeToImplement: "Imediato com certificado",
      });
    }
  }
  
  // Drawback opportunity
  if (opportunity.financial.totalFobCents > 500000) { // > USD 5,000
    optimizations.push({
      type: "drawback",
      description: "Regime de Drawback: Se os produtos importados forem usados na fabricação de bens para exportação, é possível suspender/isentar tributos.",
      potentialSavingsCents: Math.round(opportunity.financial.totalTaxesCents * 0.8),
      complexity: "hard",
      timeToImplement: "60-90 dias para habilitação",
    });
  }
  
  // Reform timing optimization
  const currentYear = new Date().getFullYear();
  const currentPhase = getReformPhase(currentYear);
  const nextPhase = getReformPhase(currentYear + 1);
  
  if (currentPhase.isTestPhase) {
    optimizations.push({
      type: "reform_timing",
      description: `${currentYear} é fase de teste da reforma. Aproveite para simular o impacto e se preparar para ${currentYear + 1} quando a CBS entra em vigor.`,
      potentialSavingsCents: 0,
      complexity: "easy",
      timeToImplement: "Planejamento imediato",
    });
  }
  
  return {
    totalTaxBurden,
    optimizationOpportunities: optimizations,
    effectiveTaxRate: totalTaxBurden,
    taxBreakdown: {
      "II": Math.round(totalTaxBurden * 0.3),
      "IPI": Math.round(totalTaxBurden * 0.05),
      "PIS/COFINS": Math.round(totalTaxBurden * 0.25),
      "ICMS": Math.round(totalTaxBurden * 0.4),
    },
  };
}

// ============================================================
// ANÁLISE DE TIMING
// ============================================================

function analyzeTiming(
  opportunity: ImportOpportunity,
  historicalData?: any
): TimingIntelligence {
  const urgencyFactors: string[] = [];
  let recommendation: "buy_now" | "wait" | "urgent" = "buy_now";
  
  // Check quotation validity
  if (opportunity.metadata?.validUntil) {
    const daysUntilExpiry = Math.ceil(
      (new Date(opportunity.metadata.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry <= 7) {
      urgencyFactors.push(`Cotação expira em ${daysUntilExpiry} dias`);
      recommendation = "urgent";
    } else if (daysUntilExpiry <= 15) {
      urgencyFactors.push(`Cotação válida por mais ${daysUntilExpiry} dias`);
    }
  }
  
  // Exchange rate analysis
  let exchangeRateTrend: "favorable" | "unfavorable" | "stable" = "stable";
  if (historicalData?.exchangeRateHistory?.length > 5) {
    const recent = historicalData.exchangeRateHistory.slice(-5);
    const older = historicalData.exchangeRateHistory.slice(-10, -5);
    const recentAvg = recent.reduce((s: number, r: any) => s + r.rate, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((s: number, r: any) => s + r.rate, 0) / older.length : recentAvg;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (change < -2) {
      exchangeRateTrend = "favorable";
      urgencyFactors.push("Câmbio em tendência favorável (real valorizando)");
      recommendation = "buy_now";
    } else if (change > 2) {
      exchangeRateTrend = "unfavorable";
      urgencyFactors.push("Câmbio em tendência desfavorável (real desvalorizando)");
      if (recommendation !== "urgent") recommendation = "wait";
    }
  }
  
  const reasoning = urgencyFactors.length > 0
    ? `Fatores considerados: ${urgencyFactors.join("; ")}.`
    : "Sem fatores urgentes identificados. Momento neutro para compra.";
  
  return {
    recommendation,
    reasoning,
    exchangeRateTrend,
    commodityTrend: "stable",
    bestWindowEstimate: recommendation === "urgent" 
      ? "Agir imediatamente" 
      : recommendation === "buy_now" 
        ? "Próximos 15 dias" 
        : "Aguardar 30 dias e reavaliar",
    urgencyFactors,
  };
}

// ============================================================
// ANÁLISE DE RISCOS
// ============================================================

function analyzeRisks(opportunity: ImportOpportunity): RiskIntelligence {
  const factors: RiskFactor[] = [];
  const mitigations: string[] = [];
  
  // Supplier risk
  if (!opportunity.supplier.previousOrders || opportunity.supplier.previousOrders === 0) {
    factors.push({
      name: "Fornecedor novo",
      level: "high",
      description: "Primeira operação com este fornecedor. Sem histórico de confiabilidade.",
      impact: "Risco de qualidade, atraso ou não conformidade.",
    });
    mitigations.push("Solicitar amostras antes do pedido completo.");
    mitigations.push("Usar carta de crédito (L/C) como forma de pagamento.");
    mitigations.push("Contratar inspeção pré-embarque (SGS, Bureau Veritas).");
  } else if (opportunity.supplier.previousOrders < 3) {
    factors.push({
      name: "Fornecedor com pouco histórico",
      level: "medium",
      description: `Apenas ${opportunity.supplier.previousOrders} operação(ões) anterior(es).`,
      impact: "Risco moderado. Relação ainda em construção.",
    });
  }
  
  // Country risk
  const highRiskCountries = ["china", "india", "vietnam", "bangladesh"];
  if (highRiskCountries.some(c => opportunity.logistics.originCountry?.toLowerCase().includes(c))) {
    factors.push({
      name: "Risco de origem",
      level: "medium",
      description: `Importação de ${opportunity.logistics.originCountry}. Lead time longo e possíveis barreiras.`,
      impact: "Tempo de trânsito de 30-45 dias. Risco de atraso portuário.",
    });
    mitigations.push("Planejar estoque de segurança para cobrir lead time.");
  }
  
  // Volume risk
  if (opportunity.financial.totalFobCents > 5000000) { // > USD 50,000
    factors.push({
      name: "Volume alto",
      level: "medium",
      description: "Operação de alto valor. Impacto significativo no fluxo de caixa.",
      impact: `Investimento de R$ ${(opportunity.financial.totalCostCents / 100).toFixed(2)} com retorno estimado em 60-90 dias.`,
    });
    mitigations.push("Considerar financiamento de importação (ACC/ACE).");
    mitigations.push("Negociar pagamento parcelado com fornecedor.");
  }
  
  // Exchange rate risk
  factors.push({
    name: "Risco cambial",
    level: "medium",
    description: "Variação cambial entre fechamento e pagamento pode impactar o custo.",
    impact: "Uma variação de 5% no câmbio altera o custo total em proporção equivalente.",
  });
  mitigations.push("Considerar hedge cambial (NDF) para operações acima de USD 20.000.");
  
  const highRiskCount = factors.filter(f => f.level === "high").length;
  const mediumRiskCount = factors.filter(f => f.level === "medium").length;
  
  const overallRisk: "low" | "medium" | "high" = 
    highRiskCount >= 2 ? "high" :
    highRiskCount >= 1 || mediumRiskCount >= 3 ? "medium" : "low";
  
  return { overallRisk, factors, mitigations };
}

// ============================================================
// ESTRATÉGIA DE NEGOCIAÇÃO
// ============================================================

function generateNegotiationStrategy(
  opportunity: ImportOpportunity,
  priceAnalysis: PriceIntelligence,
  historicalData?: any
): NegotiationIntelligence {
  const args: string[] = [];
  const counterArgs: string[] = [];
  let targetDiscount = 0;
  
  // Base discount target on price analysis
  if (priceAnalysis.savingsPercent > 0) {
    targetDiscount = Math.min(priceAnalysis.savingsPercent, 15);
    args.push(`Temos cotações de fornecedores alternativos com preços ${priceAnalysis.savingsPercent.toFixed(0)}% menores.`);
  } else {
    targetDiscount = 5; // Always try for at least 5%
  }
  
  // Volume argument
  if (opportunity.products.some(p => p.quantity > 1000)) {
    args.push("Volume significativo justifica desconto por escala.");
    targetDiscount += 2;
  }
  
  // Recurring business argument
  if (opportunity.supplier.previousOrders && opportunity.supplier.previousOrders > 0) {
    args.push(`Parceria estabelecida com ${opportunity.supplier.previousOrders} pedido(s) anterior(es). Buscamos condições de cliente recorrente.`);
    targetDiscount += 1;
  }
  
  // Payment terms argument
  args.push("Dispostos a negociar condições de pagamento favoráveis (antecipação) em troca de desconto.");
  
  // Counter-arguments to prepare for
  counterArgs.push("Fornecedor pode alegar custos de matéria-prima em alta.");
  counterArgs.push("Pode argumentar que preço já inclui desconto por volume.");
  counterArgs.push("Possível resistência se for primeira compra (sem histórico).");
  
  // Walk-away price
  const walkAwayPrice = Math.round(opportunity.financial.totalFobCents * (1 - targetDiscount / 100));
  
  return {
    targetDiscount: Math.min(targetDiscount, 20),
    arguments: args,
    counterArguments: counterArgs,
    walkAwayPrice,
    bestAlternative: priceAnalysis.savingsOpportunity > 0
      ? "Fornecedor alternativo com preço mais competitivo identificado no histórico."
      : "Buscar novas cotações em plataformas como Alibaba, Made-in-China ou Global Sources.",
  };
}

// ============================================================
// IMPACTO DA REFORMA TRIBUTÁRIA
// ============================================================

async function analyzeReformImpact(opportunity: ImportOpportunity): Promise<ReformIntelligence> {
  const currentYear = new Date().getFullYear();
  
  // Get first product's NCM for simulation (or use the most representative)
  const mainNcm = opportunity.products[0]?.ncm || "73170090";
  
  const reformResult = await simulateReformImpact({
    cifValueCents: opportunity.financial.totalCifCents,
    ncmCode: mainNcm,
    originCountry: opportunity.logistics.originCountry,
    destinationState: opportunity.logistics.destinationState,
    isMercosul: opportunity.logistics.originCountry?.toLowerCase().includes("paraguai") ||
                opportunity.logistics.originCountry?.toLowerCase().includes("argentina") ||
                opportunity.logistics.originCountry?.toLowerCase().includes("uruguai"),
    referenceYear: currentYear,
  });
  
  // Generate yearly projection
  const timeline = generateReformTimeline(
    opportunity.financial.totalCifCents,
    mainNcm,
    {
      iiRate: 1400,
      ipiRate: 0,
      pisRate: 216,
      cofinsRate: 1000,
      icmsRate: 100,
    }
  );
  
  const yearlyProjection = timeline.map(y => ({
    year: y.year,
    taxDifferenceCents: y.totalTaxCents - timeline[0].totalTaxCents,
    differencePercent: y.comparedToCurrentPercent,
  }));
  
  const currentYearPhase = getReformPhase(currentYear);
  
  return {
    currentYearImpact: reformResult.insights.join(" "),
    futureImpact: reformResult.comparison.impact === "cheaper"
      ? `A reforma tributária tende a REDUZIR o custo desta importação em ${Math.abs(reformResult.comparison.differencePercent).toFixed(1)}% quando totalmente implementada (2033).`
      : reformResult.comparison.impact === "more_expensive"
        ? `A reforma tributária tende a AUMENTAR o custo desta importação em ${reformResult.comparison.differencePercent.toFixed(1)}% quando totalmente implementada (2033).`
        : "O impacto da reforma tributária nesta operação será neutro.",
    recommendation: currentYearPhase.isTestPhase
      ? "Use este período de teste para adaptar seus sistemas e processos. A CBS entra em vigor em 2027."
      : "Monitore a transição e ajuste suas margens conforme as alíquotas mudam ano a ano.",
    yearlyProjection,
  };
}

// ============================================================
// CÁLCULO DE SCORES
// ============================================================

function calculateScores(
  priceAnalysis: PriceIntelligence,
  taxAnalysis: TaxIntelligence,
  timingAnalysis: TimingIntelligence,
  riskAnalysis: RiskIntelligence,
  opportunity: ImportOpportunity
): IntelligenceReport["scores"] {
  // Price score
  const criticalAnomalies = priceAnalysis.anomalies.filter(a => a.severity === "critical").length;
  const warningAnomalies = priceAnalysis.anomalies.filter(a => a.severity === "warning").length;
  const priceScore = Math.max(0, 100 - criticalAnomalies * 30 - warningAnomalies * 15);
  
  // Timing score
  const timingScore = timingAnalysis.recommendation === "buy_now" ? 85 :
    timingAnalysis.recommendation === "urgent" ? 60 : 40;
  
  // Supplier score
  const prevOrders = opportunity.supplier.previousOrders || 0;
  const supplierScore = Math.min(100, 30 + prevOrders * 15 + (opportunity.supplier.reliabilityScore || 0));
  
  // Margin score
  let marginScore = 70;
  for (const product of opportunity.products) {
    if (product.targetPriceCents) {
      const margin = (product.targetPriceCents - product.unitCostNationalizedCents) / product.targetPriceCents;
      if (margin < 0) marginScore -= 30;
      else if (margin < 0.1) marginScore -= 15;
      else if (margin > 0.3) marginScore += 10;
    }
  }
  marginScore = Math.max(0, Math.min(100, marginScore));
  
  // Risk score (inverted - higher is better/less risky)
  const riskScore = riskAnalysis.overallRisk === "low" ? 90 :
    riskAnalysis.overallRisk === "medium" ? 60 : 30;
  
  // Overall
  const overallScore = Math.round(
    priceScore * 0.30 +
    timingScore * 0.15 +
    supplierScore * 0.20 +
    marginScore * 0.25 +
    riskScore * 0.10
  );
  
  return { priceScore, timingScore, supplierScore, marginScore, riskScore, overallScore };
}

// ============================================================
// VEREDICTO
// ============================================================

function determineVerdict(
  scores: IntelligenceReport["scores"],
  riskAnalysis: RiskIntelligence,
  priceAnalysis: PriceIntelligence
): "GO" | "NEGOTIATE" | "NO_GO" | "WAIT" {
  if (scores.overallScore >= 75 && riskAnalysis.overallRisk !== "high") {
    return "GO";
  }
  
  if (scores.overallScore >= 50 || priceAnalysis.savingsPercent > 5) {
    return "NEGOTIATE";
  }
  
  if (scores.overallScore < 30 || priceAnalysis.anomalies.filter(a => a.severity === "critical").length >= 3) {
    return "NO_GO";
  }
  
  return "WAIT";
}

// ============================================================
// AÇÕES RECOMENDADAS
// ============================================================

function generateActions(
  priceAnalysis: PriceIntelligence,
  taxAnalysis: TaxIntelligence,
  timingAnalysis: TimingIntelligence,
  riskAnalysis: RiskIntelligence,
  negotiation: NegotiationIntelligence,
  reform: ReformIntelligence
): ActionItem[] {
  const actions: ActionItem[] = [];
  
  // Price actions
  if (priceAnalysis.savingsOpportunity > 0) {
    actions.push({
      priority: "high",
      action: `Negociar desconto de ${negotiation.targetDiscount.toFixed(0)}% com fornecedor. Economia potencial: R$ ${(priceAnalysis.savingsOpportunity / 100).toFixed(2)}.`,
      deadline: "Antes do vencimento da cotação",
      expectedImpact: `Redução de R$ ${(priceAnalysis.savingsOpportunity / 100).toFixed(2)} no custo total`,
      category: "negotiation",
    });
  }
  
  // Tax optimization actions
  for (const opt of taxAnalysis.optimizationOpportunities) {
    actions.push({
      priority: opt.complexity === "easy" ? "high" : "medium",
      action: opt.description,
      deadline: opt.timeToImplement,
      expectedImpact: `Economia potencial de R$ ${(opt.potentialSavingsCents / 100).toFixed(2)}`,
      category: "tax",
    });
  }
  
  // Timing actions
  if (timingAnalysis.recommendation === "urgent") {
    actions.push({
      priority: "high",
      action: "Fechar negociação imediatamente. Fatores de urgência identificados.",
      deadline: "Imediato",
      expectedImpact: "Evitar perda da oportunidade ou aumento de custos",
      category: "timing",
    });
  }
  
  // Risk mitigation actions
  for (const mitigation of riskAnalysis.mitigations.slice(0, 3)) {
    actions.push({
      priority: riskAnalysis.overallRisk === "high" ? "high" : "medium",
      action: mitigation,
      expectedImpact: "Redução de risco operacional",
      category: "risk",
    });
  }
  
  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return actions;
}

// ============================================================
// RESUMO EXECUTIVO
// ============================================================

function generateSummary(
  verdict: string,
  scores: IntelligenceReport["scores"],
  opportunity: ImportOpportunity,
  priceAnalysis: PriceIntelligence,
  reformImpact: ReformIntelligence
): string {
  const verdictText = {
    "GO": "APROVADA",
    "NEGOTIATE": "NEGOCIAR",
    "NO_GO": "REJEITAR",
    "WAIT": "AGUARDAR",
  }[verdict] || verdict;
  
  const totalFobUSD = (opportunity.financial.totalFobCents / 100).toFixed(2);
  const totalCostBRL = (opportunity.financial.totalCostCents / 100).toFixed(2);
  const productCount = opportunity.products.length;
  
  let summary = `VEREDICTO: ${verdictText} (Score: ${scores.overallScore}/100)\n\n`;
  summary += `Operação com ${productCount} produto(s) de ${opportunity.supplier.name} (${opportunity.supplier.country}). `;
  summary += `Valor FOB: USD ${totalFobUSD} | Custo nacionalizado: R$ ${totalCostBRL}.\n\n`;
  
  if (priceAnalysis.savingsOpportunity > 0) {
    summary += `Oportunidade de economia: R$ ${(priceAnalysis.savingsOpportunity / 100).toFixed(2)} via negociação ou fornecedor alternativo. `;
  }
  
  if (priceAnalysis.anomalies.length > 0) {
    const criticals = priceAnalysis.anomalies.filter(a => a.severity === "critical").length;
    if (criticals > 0) {
      summary += `ATENÇÃO: ${criticals} alerta(s) crítico(s) identificado(s). `;
    }
  }
  
  summary += `\n\n${reformImpact.futureImpact}`;
  
  return summary;
}
