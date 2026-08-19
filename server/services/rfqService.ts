/**
 * RFQ Service - Motor Inteligente de Solicitação de Cotação
 * 
 * Orquestra todo o fluxo: recebe RFQ → sugere NCM → gera mensagem
 * para fornecedores em múltiplos idiomas → analisa respostas →
 * calcula custo nacionalizado → otimiza porto/estado → gera cotação consolidada.
 * 
 * Excambia - A primeira plataforma agêntica de comércio exterior
 */

// ============================================================
// INTERFACES
// ============================================================

export interface RfqInput {
  title: string;
  importPurpose: "resale" | "own_use" | "industrialization" | "temporary";
  requesterType: "self" | "client";
  clientInfo?: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    cnpj?: string;
    state?: string;
  };
  items: RfqItemInput[];
  preferences: {
    preferredCountries?: string[];
    excludedCountries?: string[];
    preferredIncoterm?: string;
    destinationState: string;
    destinationPort?: string;
    urgency: "standard" | "fast" | "urgent";
    budgetMaxCents?: number;
    currency: string;
  };
  notes?: string;
}

export interface RfqItemInput {
  productName: string;
  description?: string;
  ncmCode?: string;
  specifications?: Record<string, string>;
  qualityStandard?: string;
  quantity: number;
  unit: string;
  targetUnitPriceCents?: number;
  weightKgPerUnit?: number;
  certifications?: string[];
  sampleRequired?: boolean;
}

export interface NcmSuggestion {
  ncmCode: string;
  description: string;
  iiRate: number;
  confidence: number; // 0-100
  alternativeNcms?: Array<{
    ncmCode: string;
    description: string;
    iiRate: number;
    note: string; // Ex: "Pode se enquadrar se o material for X"
  }>;
}

export interface SupplierMessage {
  language: string;
  subject: string;
  body: string;
  channel: "email" | "wechat" | "whatsapp";
}

export interface PortOptimization {
  port: string;
  state: string;
  totalCostCents: number;
  taxesCents: number;
  freightCostCents: number;
  transitDays: number;
  hasFiscalBenefit: boolean;
  benefitDescription?: string;
  savingsVsDefaultCents: number;
  rank: number;
  reasoning: string;
}

export interface ConsolidatedQuoteResult {
  rfqId: number;
  bestSupplier: {
    name: string;
    country: string;
    totalFobCents: number;
  };
  bestPort: PortOptimization;
  costs: {
    fobCents: number;
    freightCents: number;
    insuranceCents: number;
    cifCents: number;
    taxesCents: number;
    operationalCents: number;
    totalCostCents: number;
    platformFeeCents: number;
  };
  pricing: {
    unitCostCents: number;
    suggestedPriceCents: number;
    marginPercent: number;
  };
  timeline: {
    productionDays: number;
    transitDays: number;
    customsDays: number;
    totalDays: number;
    estimatedArrival: Date;
  };
  verdict: "GO" | "NEGOTIATE" | "NO_GO" | "WAIT";
  score: number;
}

// ============================================================
// GERAÇÃO DE NÚMERO RFQ
// ============================================================

export function generateRfqNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `RFQ-${year}-${random}`;
}

export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `CQ-${year}-${random}`;
}

// ============================================================
// SUGESTÃO INTELIGENTE DE NCM
// ============================================================

/**
 * Sugere NCM com base no nome do produto
 * Usa a tabela de NCMs do SISCOMEX + lógica de matching
 */
export function suggestNcm(productName: string, description?: string): NcmSuggestion {
  const name = productName.toLowerCase();
  
  // Base de conhecimento para produtos de construção civil (expandível)
  const ncmDatabase: Record<string, NcmSuggestion> = {
    "prego": {
      ncmCode: "7317.00.90",
      description: "Tachas, pregos, percevejos, escápulas e artefatos semelhantes, de ferro fundido, ferro ou aço",
      iiRate: 1400,
      confidence: 90,
      alternativeNcms: [
        { ncmCode: "7317.00.10", description: "Tachas e pregos para calçados", iiRate: 1400, note: "Se for prego específico para calçados" },
        { ncmCode: "7317.00.20", description: "Percevejos", iiRate: 1400, note: "Se for percevejo/tacha" },
      ],
    },
    "arame": {
      ncmCode: "7217.10.90",
      description: "Fios de ferro ou aço não ligado, não revestidos",
      iiRate: 1200,
      confidence: 85,
      alternativeNcms: [
        { ncmCode: "7217.20.90", description: "Fios de ferro ou aço, zincados", iiRate: 1200, note: "Se for arame galvanizado" },
        { ncmCode: "7217.30.90", description: "Fios de ferro ou aço, revestidos de outros metais", iiRate: 1200, note: "Se tiver outro revestimento" },
      ],
    },
    "escora": {
      ncmCode: "7308.90.90",
      description: "Construções e suas partes, de ferro fundido, ferro ou aço",
      iiRate: 1400,
      confidence: 80,
      alternativeNcms: [
        { ncmCode: "7308.40.00", description: "Material de andaimes, armações e escoras", iiRate: 1400, note: "Classificação mais específica para escoras" },
      ],
    },
    "parafuso": {
      ncmCode: "7318.15.00",
      description: "Parafusos e pinos ou pernos, roscados, de ferro fundido, ferro ou aço",
      iiRate: 1600,
      confidence: 85,
    },
    "tubo": {
      ncmCode: "7306.30.00",
      description: "Outros tubos e perfis ocos, soldados, de seção circular, de ferro ou aço não ligado",
      iiRate: 1400,
      confidence: 75,
    },
    "chapa": {
      ncmCode: "7208.51.00",
      description: "Produtos laminados planos, de ferro ou aço não ligado, de largura >= 600mm",
      iiRate: 1200,
      confidence: 70,
    },
    "cimento": {
      ncmCode: "2523.29.10",
      description: "Cimento Portland comum",
      iiRate: 400,
      confidence: 85,
    },
    "tinta": {
      ncmCode: "3208.10.10",
      description: "Tintas e vernizes à base de poliésteres",
      iiRate: 1400,
      confidence: 70,
    },
    "porcelanato": {
      ncmCode: "6907.21.00",
      description: "Ladrilhos e placas de cerâmica, com coeficiente de absorção de água <= 0,5%",
      iiRate: 3500,
      confidence: 85,
    },
    "led": {
      ncmCode: "9405.42.00",
      description: "Aparelhos de iluminação LED",
      iiRate: 1800,
      confidence: 80,
    },
  };
  
  // Busca por match parcial
  for (const [keyword, suggestion] of Object.entries(ncmDatabase)) {
    if (name.includes(keyword)) {
      return suggestion;
    }
  }
  
  // Fallback genérico
  return {
    ncmCode: "",
    description: "NCM não identificado automaticamente. Necessário classificação manual.",
    iiRate: 0,
    confidence: 0,
  };
}

// ============================================================
// GERAÇÃO DE MENSAGEM PARA FORNECEDORES
// ============================================================

/**
 * Gera mensagem profissional para enviar ao fornecedor
 * em múltiplos idiomas
 */
export function generateSupplierMessage(
  rfqNumber: string,
  items: RfqItemInput[],
  preferences: RfqInput["preferences"],
  language: "en" | "zh" | "pt" = "en"
): SupplierMessage {
  
  const itemsList = items.map((item, i) => {
    const specs = item.specifications 
      ? Object.entries(item.specifications).map(([k, v]) => `${k}: ${v}`).join(", ")
      : "";
    return {
      index: i + 1,
      name: item.productName,
      qty: item.quantity,
      unit: item.unit,
      specs,
      standard: item.qualityStandard || "",
      certs: item.certifications?.join(", ") || "",
    };
  });
  
  if (language === "en") {
    const itemsText = itemsList.map(item => 
      `${item.index}. ${item.name}\n   Quantity: ${item.qty.toLocaleString()} ${item.unit}\n   ${item.specs ? `Specifications: ${item.specs}\n   ` : ""}${item.standard ? `Standard: ${item.standard}\n   ` : ""}${item.certs ? `Certifications required: ${item.certs}` : ""}`
    ).join("\n\n");
    
    return {
      language: "en",
      subject: `RFQ ${rfqNumber} - Request for Quotation`,
      body: `Dear Sir/Madam,

We are a Brazilian import company specializing in construction materials and industrial products. We are interested in sourcing the following items and would like to request your best quotation.

PRODUCTS REQUIRED:

${itemsText}

QUOTATION REQUIREMENTS:
- Price terms: ${preferences.preferredIncoterm || "FOB"} (${preferences.preferredIncoterm || "FOB"} price preferred)
- Currency: ${preferences.currency}
- Destination: Brazil (Port of ${preferences.destinationPort || "Itajaí/Navegantes"})
- Delivery urgency: ${preferences.urgency === "urgent" ? "URGENT - ASAP" : preferences.urgency === "fast" ? "Fast delivery preferred (30-45 days)" : "Standard (60-90 days)"}

PLEASE INCLUDE IN YOUR QUOTATION:
1. Unit price and total price per item
2. Minimum Order Quantity (MOQ)
3. Payment terms
4. Production lead time
5. Packaging details
6. Available certifications
7. Price breaks for larger volumes (if applicable)

${items.some(i => i.sampleRequired) ? "SAMPLES: We would like to receive samples before placing the order. Please advise on sample cost and shipping.\n" : ""}
We look forward to your prompt reply. Please feel free to contact us for any clarification.

Best regards,
Excambia Import Team
RFQ Reference: ${rfqNumber}`,
      channel: "email",
    };
  }
  
  if (language === "zh") {
    const itemsText = itemsList.map(item =>
      `${item.index}. ${item.name}\n   数量: ${item.qty.toLocaleString()} ${item.unit}\n   ${item.specs ? `规格: ${item.specs}\n   ` : ""}${item.standard ? `标准: ${item.standard}\n   ` : ""}${item.certs ? `需要认证: ${item.certs}` : ""}`
    ).join("\n\n");
    
    return {
      language: "zh",
      subject: `询价单 ${rfqNumber} - 报价请求`,
      body: `您好，

我们是一家巴西进口公司，专注于建筑材料和工业产品。我们有兴趣采购以下产品，希望获得您的最优报价。

所需产品：

${itemsText}

报价要求：
- 价格条款：${preferences.preferredIncoterm || "FOB"}
- 货币：${preferences.currency}
- 目的地：巴西（${preferences.destinationPort || "Itajaí/Navegantes"}港）
- 交货紧急程度：${preferences.urgency === "urgent" ? "紧急 - 尽快" : preferences.urgency === "fast" ? "快速交货（30-45天）" : "标准（60-90天）"}

请在报价中包含：
1. 单价和总价
2. 最小起订量（MOQ）
3. 付款条件
4. 生产交期
5. 包装详情
6. 可提供的认证
7. 大批量价格优惠（如适用）

${items.some(i => i.sampleRequired) ? "样品：我们希望在下单前收到样品。请告知样品费用和运费。\n" : ""}
期待您的及时回复。如有任何疑问，请随时联系我们。

此致敬礼，
Excambia 进口团队
询价单编号：${rfqNumber}`,
      channel: "wechat",
    };
  }
  
  // Portuguese
  const itemsText = itemsList.map(item =>
    `${item.index}. ${item.name}\n   Quantidade: ${item.qty.toLocaleString()} ${item.unit}\n   ${item.specs ? `Especificações: ${item.specs}\n   ` : ""}${item.standard ? `Norma: ${item.standard}\n   ` : ""}${item.certs ? `Certificações necessárias: ${item.certs}` : ""}`
  ).join("\n\n");
  
  return {
    language: "pt",
    subject: `RFQ ${rfqNumber} - Solicitação de Cotação`,
    body: `Prezado(a),

Somos uma empresa brasileira de importação especializada em materiais de construção e produtos industriais. Gostaríamos de solicitar sua melhor cotação para os seguintes itens.

PRODUTOS SOLICITADOS:

${itemsText}

REQUISITOS DA COTAÇÃO:
- Termos de preço: ${preferences.preferredIncoterm || "FOB"}
- Moeda: ${preferences.currency}
- Destino: Brasil (Porto de ${preferences.destinationPort || "Itajaí/Navegantes"})
- Urgência: ${preferences.urgency === "urgent" ? "URGENTE" : preferences.urgency === "fast" ? "Entrega rápida (30-45 dias)" : "Padrão (60-90 dias)"}

POR FAVOR INCLUIR NA COTAÇÃO:
1. Preço unitário e total por item
2. Quantidade mínima de pedido (MOQ)
3. Condições de pagamento
4. Prazo de produção
5. Detalhes de embalagem
6. Certificações disponíveis
7. Descontos por volume (se aplicável)

Aguardamos seu retorno.

Atenciosamente,
Excambia Import Team
Referência: ${rfqNumber}`,
    channel: "email",
  };
}

// ============================================================
// OTIMIZAÇÃO DE PORTO/ESTADO
// ============================================================

/**
 * Analisa os melhores portos e estados para nacionalização
 * considerando: custo de frete, benefícios fiscais, proximidade do cliente
 */
export function optimizePortAndState(
  cifValueCents: number,
  ncmCode: string,
  clientState: string,
  importPurpose: string
): PortOptimization[] {
  
  // Base de dados de portos e custos estimados
  const ports = [
    {
      port: "Itajaí/Navegantes",
      state: "SC",
      baseFreightMultiplier: 1.0, // Referência
      transitDaysFromChina: 35,
      hasFiscalBenefit: true,
      benefitDescription: "TTD/SC: ICMS antecipado efetivo de 1,0% (TTD máximo, após 36 meses)",
      icmsRate: 100, // 1,0% — alinhado ao motor certificado (TTD máximo)
    },
    {
      port: "Santos",
      state: "SP",
      baseFreightMultiplier: 0.95, // Ligeiramente mais barato (maior volume)
      transitDaysFromChina: 33,
      hasFiscalBenefit: false,
      benefitDescription: undefined,
      icmsRate: 1800, // 18% padrão SP
    },
    {
      port: "Paranaguá",
      state: "PR",
      baseFreightMultiplier: 1.05,
      transitDaysFromChina: 36,
      hasFiscalBenefit: false,
      benefitDescription: undefined,
      icmsRate: 1900, // 19% PR
    },
    {
      port: "Vitória",
      state: "ES",
      baseFreightMultiplier: 1.1,
      transitDaysFromChina: 38,
      hasFiscalBenefit: true,
      benefitDescription: "FUNDAP: Financiamento de até 20 anos para ICMS na importação",
      icmsRate: 400, // Efetivo com FUNDAP
    },
    {
      port: "Rio Grande",
      state: "RS",
      baseFreightMultiplier: 1.15,
      transitDaysFromChina: 38,
      hasFiscalBenefit: false,
      benefitDescription: undefined,
      icmsRate: 1700, // 17% RS
    },
  ];
  
  // Custo base de frete (estimativa por CIF)
  const baseFreightCents = Math.round(cifValueCents * 0.08); // ~8% do CIF como frete interno
  
  // Custo de frete terrestre entre estados (simplificado)
  const internalFreightMatrix: Record<string, Record<string, number>> = {
    "SC": { "SC": 0, "SP": 3000, "PR": 1500, "RS": 2000, "ES": 5000, "MG": 4000, "RJ": 5000 },
    "SP": { "SC": 3000, "SP": 0, "PR": 2500, "RS": 4000, "ES": 4000, "MG": 2000, "RJ": 2500 },
    "PR": { "SC": 1500, "SP": 2500, "PR": 0, "RS": 3000, "ES": 5500, "MG": 3500, "RJ": 5000 },
    "ES": { "SC": 5000, "SP": 4000, "PR": 5500, "RS": 6000, "ES": 0, "MG": 2000, "RJ": 2500 },
    "RS": { "SC": 2000, "SP": 4000, "PR": 3000, "RS": 0, "ES": 6000, "MG": 5000, "RJ": 5500 },
  };
  
  const results: PortOptimization[] = ports.map(port => {
    // Frete marítimo
    const freightCostCents = Math.round(baseFreightCents * port.baseFreightMultiplier);
    
    // Frete interno (do porto ao cliente)
    const internalFreightCents = (internalFreightMatrix[port.state]?.[clientState] || 3000) * 100;
    
    // Impostos
    const taxesCents = Math.round(cifValueCents * (port.icmsRate / 10000));
    
    // Custo total
    const totalCostCents = cifValueCents + freightCostCents + internalFreightCents + taxesCents;
    
    return {
      port: port.port,
      state: port.state,
      totalCostCents,
      taxesCents,
      freightCostCents: freightCostCents + internalFreightCents,
      transitDays: port.transitDaysFromChina,
      hasFiscalBenefit: port.hasFiscalBenefit,
      benefitDescription: port.benefitDescription,
      savingsVsDefaultCents: 0, // Calculado depois
      rank: 0,
      reasoning: "",
    };
  });
  
  // Ordenar por custo total
  results.sort((a, b) => a.totalCostCents - b.totalCostCents);
  
  // Calcular savings e rank
  const defaultCost = results.find(r => r.state === "SP")?.totalCostCents || results[0].totalCostCents;
  results.forEach((r, i) => {
    r.rank = i + 1;
    r.savingsVsDefaultCents = defaultCost - r.totalCostCents;
    r.reasoning = r.rank === 1
      ? `Melhor opção: ${r.hasFiscalBenefit ? r.benefitDescription + ". " : ""}Custo total mais baixo considerando frete + impostos + transporte interno.`
      : `${r.hasFiscalBenefit ? "Possui benefício fiscal: " + r.benefitDescription + ". " : ""}${r.savingsVsDefaultCents > 0 ? `Economia de R$ ${(r.savingsVsDefaultCents / 100).toFixed(2)} vs Santos.` : `Custo R$ ${(Math.abs(r.savingsVsDefaultCents) / 100).toFixed(2)} acima de Santos.`}`;
  });
  
  return results;
}

// ============================================================
// ESTIMATIVA DE TIMELINE
// ============================================================

export function estimateTimeline(
  urgency: "standard" | "fast" | "urgent",
  originCountry: string,
  port: string
): {
  productionDays: number;
  transitDays: number;
  customsDays: number;
  totalDays: number;
  estimatedArrival: Date;
} {
  const isChina = originCountry.toLowerCase().includes("china") || originCountry.toLowerCase().includes("cn");
  
  const productionDays = urgency === "urgent" ? 15 : urgency === "fast" ? 25 : 35;
  const transitDays = isChina ? 35 : 20;
  const customsDays = urgency === "urgent" ? 5 : 10;
  const totalDays = productionDays + transitDays + customsDays;
  
  const estimatedArrival = new Date();
  estimatedArrival.setDate(estimatedArrival.getDate() + totalDays);
  
  return { productionDays, transitDays, customsDays, totalDays, estimatedArrival };
}

// ============================================================
// CÁLCULO DE FEE DA PLATAFORMA
// ============================================================

export function calculatePlatformFee(
  totalCostCents: number,
  feePercent: number = 150 // 1.5% = 150 basis points
): { feeCents: number; feePercent: number } {
  const feeCents = Math.round(totalCostCents * feePercent / 10000);
  return { feeCents, feePercent };
}

// ============================================================
// VALIDAÇÃO DE RFQ
// ============================================================

export function validateRfqInput(input: RfqInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!input.title || input.title.trim().length < 3) {
    errors.push("Título da RFQ deve ter pelo menos 3 caracteres.");
  }
  
  if (!input.items || input.items.length === 0) {
    errors.push("A RFQ deve conter pelo menos um item/produto.");
  }
  
  for (let i = 0; i < (input.items?.length || 0); i++) {
    const item = input.items[i];
    if (!item.productName || item.productName.trim().length < 2) {
      errors.push(`Item ${i + 1}: Nome do produto é obrigatório.`);
    }
    if (!item.quantity || item.quantity <= 0) {
      errors.push(`Item ${i + 1}: Quantidade deve ser maior que zero.`);
    }
  }
  
  if (input.requesterType === "client") {
    if (!input.clientInfo?.name) {
      errors.push("Nome do cliente é obrigatório quando o tipo é 'cliente'.");
    }
  }
  
  if (!input.preferences?.destinationState) {
    errors.push("Estado de destino é obrigatório.");
  }
  
  return { valid: errors.length === 0, errors };
}
