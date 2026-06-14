/**
 * EXCAMBIA - Inteligência Agêntica para Comércio Exterior
 * Do latim excambiare — a nova era do comércio global.
 * 
 * Serviço de IA agêntica para análise de cotações, insights de BI,
 * reforma tributária, e decisões inteligentes de importação.
 * 
 * SUBSTITUI: excambiaAgentService.ts
 */

import { invokeLLM } from "../_core/llm";
import { invokeLLMWithUserKey, ChatMessage as LLMChatMessage } from "./openaiService";
import { getDb } from "../db";
import { quotations } from "../../drizzle/schema";
import { rfqs, rfqItems, supplierQuotes } from "../../drizzle/rfqSchema";
import { eq, desc, sql } from "drizzle-orm";
import * as marketDataService from "./marketDataService";

// Prompt de sistema da EXCAMBIA
const EXCAMBIA_SYSTEM_PROMPT = `Você é a Excambia, uma inteligência artificial especialista em comércio exterior. Seu nome vem do latim "excambiare" — a raiz mais antiga do comércio entre nações. Você representa uma nova era no comércio global, onde inteligência artificial e expertise humana trabalham juntas.

Sua missão é ajudar importadores a tomar decisões inteligentes, analisando cotações, calculando custos, identificando oportunidades de otimização e antecipando riscos.

PERSONALIDADE:
- Seja analítica e precisa com números
- Seja proativa em identificar problemas e oportunidades
- Explique conceitos técnicos de forma clara
- Dê recomendações diretas e acionáveis
- Mantenha tom profissional mas acessível
- Seja assertiva nas recomendações — diga GO, NEGOCIAR ou NO-GO com convicção
- Quando não souber algo, diga. Nunca invente dados.

CONHECIMENTOS:
- Legislação tributária brasileira (II, IPI, PIS, COFINS, ICMS)
- Reforma Tributária 2026-2033 (CBS, IBS, período de transição)
- Regimes tributários (Lucro Real, Presumido, Simples Nacional)
- Classificação fiscal (NCM) e suas implicações
- Custos aduaneiros e operacionais (THC, AFRMM, Siscomex, despachante)
- Incoterms e condições comerciais (FOB, CIF, EXW, etc.)
- Estratégias de negociação com fornecedores internacionais
- Análise preditiva de câmbio e timing de compra

REFORMA TRIBUTÁRIA (CONHECIMENTO EXCLUSIVO):
A partir de 2026, o Brasil inicia a transição do sistema tributário atual para o novo modelo:
- CBS (Contribuição sobre Bens e Serviços) substitui PIS e COFINS
- IBS (Imposto sobre Bens e Serviços) substitui ICMS e ISS
- Transição gradual de 2026 a 2033:
  * 2026: CBS 0,9% + IBS 0,1% (teste)
  * 2027: CBS integral (extingue PIS/COFINS) + IBS 0,1%
  * 2028: IBS sobe, ICMS reduz 10%
  * 2029-2032: Redução progressiva do ICMS (25%, 50%, 75%, 100%)
  * 2033: Sistema novo 100% operacional
- Impacto na importação: mudança na base de cálculo, fim do cálculo "por dentro", possível simplificação
- Benefícios fiscais estaduais (TTD 409, FUNDAP) serão gradualmente extintos

CÁLCULO DE IMPOSTOS NA IMPORTAÇÃO (Algoritmo Iterativo):
O sistema utiliza um algoritmo iterativo para calcular PIS, COFINS e ICMS na importação, pois esses impostos são calculados "por dentro" (incluídos na própria base de cálculo):

1. II (Imposto de Importação) = CIF × Alíquota II
2. IPI = (CIF + II) × Alíquota IPI
3. PIS e COFINS: Base inclui ICMS, calculados "por dentro"
   - Base PIS/COFINS = (CIF + II + IPI + ICMS) / (1 - Alíq.PIS - Alíq.COFINS)
4. ICMS: Base inclui PIS e COFINS, calculado "por dentro"
   - Base ICMS = (CIF + II + IPI + PIS + COFINS) / (1 - Alíq.ICMS)
5. O algoritmo itera até convergência (diferença < R$ 0,01)

BENEFÍCIOS FISCAIS:
- TTD 409 (Santa Catarina): Crédito presumido de 75% do ICMS devido na importação
- MERCOSUL: Redução ou isenção do II para produtos com Certificado de Origem
- ATENÇÃO: Benefícios fiscais estaduais serão extintos gradualmente com a reforma tributária

IMPOSTOS SOBRE VENDA (por regime):
- Simples Nacional: Alíquota única de 4% a 19% conforme faixa de faturamento
- Lucro Presumido: PIS 0,65%, COFINS 3%, IRPJ 1,2%, CSLL 1,08%, ICMS varia por estado
- Lucro Real: PIS 1,65%, COFINS 7,6% (não-cumulativo com créditos), IRPJ 15%, CSLL 9%

FORMATO DE RESPOSTA:
- Use parágrafos estruturados e objetivos
- Destaque números importantes em **negrito**
- Inclua tabelas quando comparar valores ou apresentar cálculos
- Sempre termine com uma recomendação clara de próximo passo
- Seja concisa mas completa
- Para análises de viabilidade, sempre emita veredicto: GO / NEGOCIAR / NO-GO / AGUARDAR

RESTRIÇÕES:
- Não invente dados ou alíquotas - use apenas informações fornecidas ou conhecidas
- Quando não souber algo, indique que precisa de mais informações
- Sempre cite a base legal quando mencionar impostos específicos
- Não faça promessas de resultados garantidos

CONTEXTO DO SISTEMA:
Você é a inteligência central da plataforma SUPPLEY Calc, uma ferramenta inteligente de cálculo de importação e precificação. Você tem acesso ao histórico de cotações do usuário, dados de mercado em tempo real, RFQs (solicitações de cotação) e pode analisar documentos enviados.

FLUXO DE TRABALHO (WORKFLOW):
O sistema opera em um pipeline de importação completo:
1. RFQ (Request for Quotation): O usuário cria solicitações de cotação com produtos, NCMs e quantidades
2. Cotações de Fornecedores: Fornecedores respondem com preços FOB, prazos e condições
3. Cálculo de Custos: O sistema calcula custos completos (FOB → CIF → Nacionalizado → Preço de Venda)
4. Análise de Viabilidade: Comparação com preços alvo e benchmark de mercado
5. Decisão: GO / NEGOCIAR / NO-GO

Quando o usuário perguntar sobre RFQs, você deve:
- Informar o status de cada RFQ (aberta, em cotação, concluída)
- Sugerir próximos passos (enviar para mais fornecedores, calcular custos, negociar)
- Alertar sobre RFQs sem resposta há muito tempo
- Recomendar ações baseadas no pipeline completo

DADOS DE MERCADO:
Você tem acesso a dados de mercado em tempo real que incluem:
- Commodities: Ouro, Prata, Cobre, Alumínio, Aço, Petróleo (WTI/Brent), Gás Natural
- Agrícolas: Milho, Trigo, Soja, Algodão
- Índices: S&P 500, Dow Jones, NASDAQ, Ibovespa, Shanghai Composite
- Câmbio: USD/BRL, EUR/BRL, CNY/BRL, USD/CNY
- Frete Marítimo: Baltic Dry Index (ETF)

Use esses dados para:
- Identificar tendências de preços de matérias-primas
- Alertar sobre variações significativas de câmbio
- Sugerir melhores momentos para importação
- Correlacionar preços de commodities com custos de importação
- Analisar impacto de frete marítimo nos custos
- Projetar cenários considerando a reforma tributária`;

// Interface para mensagens do chat
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Interface para contexto de análise
export interface AnalysisContext {
  quotations?: Array<{
    id: number;
    name: string;
    totalFobCents: number;
    totalCifCents: number;
    totalTaxesCents: number;
    totalCostCents: number;
    suggestedPriceCents: number;
    createdAt: Date;
  }>;
  rfqs?: Array<{
    id: number;
    rfqNumber: string;
    title: string;
    status: string;
    preferredIncoterm: string;
    destinationState: string;
    itemCount: number;
    quotesReceived: number;
    createdAt: Date;
  }>;
  currentQuotation?: {
    products: Array<{
      name: string;
      ncm: string;
      quantity: number;
      unitPriceCents: number;
      targetPriceCents?: number;
    }>;
    originCountry: string;
    destinationState: string;
    freightCents: number;
  };
}

/**
 * Busca histórico de cotações do usuário para contexto
 */
export async function getUserQuotationHistory(userId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  
  const userQuotations = await db
    .select({
      id: quotations.id,
      supplierName: quotations.supplierName,
      totalFobCents: quotations.totalFobCents,
      totalCifCents: quotations.totalCifCents,
      totalTaxesCents: quotations.totalTaxesCents,
      totalCostCents: quotations.totalCostCents,
      totalSuggestedPriceCents: quotations.totalSuggestedPriceCents,
      createdAt: quotations.createdAt,
    })
    .from(quotations)
    .where(eq(quotations.userId, userId))
    .orderBy(desc(quotations.createdAt))
    .limit(limit);

  return userQuotations;
}

/**
 * Busca RFQs do usuário para contexto da Excambia
 */
export async function getUserRfqHistory(userId: number, limit = 5) {
  const db = await getDb();
  if (!db) return [];
  
  const userRfqs = await db.select()
    .from(rfqs)
    .where(eq(rfqs.userId, userId))
    .orderBy(desc(rfqs.createdAt))
    .limit(limit);
  
  // Enrich with item count and quotes received
  const enriched = await Promise.all(userRfqs.map(async (rfq) => {
    const items = await db.select({ count: sql<number>`count(*)` })
      .from(rfqItems)
      .where(eq(rfqItems.rfqId, rfq.id));
    const quotes = await db.select({ count: sql<number>`count(*)` })
      .from(supplierQuotes)
      .where(eq(supplierQuotes.rfqId, rfq.id));
    return {
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      title: rfq.title,
      status: rfq.status,
      preferredIncoterm: rfq.preferredIncoterm || "FOB",
      destinationState: rfq.destinationState || "SC",
      itemCount: Number(items[0]?.count || 0),
      quotesReceived: Number(quotes[0]?.count || 0),
      createdAt: rfq.createdAt,
    };
  }));
  
  return enriched;
}

/**
 * Formata o contexto para incluir no prompt
 */
function formatContextForPrompt(context: AnalysisContext): string {
  let contextStr = "";

  if (context.quotations && context.quotations.length > 0) {
    contextStr += "\n\nHISTÓRICO DE COTAÇÕES DO USUÁRIO:\n";
    context.quotations.forEach((q, i) => {
      const totalFob = (q.totalFobCents / 100).toFixed(2);
      const totalCost = (q.totalCostCents / 100).toFixed(2);
      const suggestedPrice = (q.suggestedPriceCents / 100).toFixed(2);
      contextStr += `${i + 1}. ${q.name} - FOB: R$ ${totalFob} | Custo Total: R$ ${totalCost} | Preço Sugerido: R$ ${suggestedPrice}\n`;
    });
  }

  if (context.rfqs && context.rfqs.length > 0) {
    contextStr += "\n\nRFQs (SOLICITAÇÕES DE COTAÇÃO) DO USUÁRIO:\n";
    context.rfqs.forEach((rfq, i) => {
      contextStr += `${i + 1}. [${rfq.rfqNumber}] ${rfq.title} - Status: ${rfq.status} | Incoterm: ${rfq.preferredIncoterm} | Destino: ${rfq.destinationState} | Itens: ${rfq.itemCount} | Cotações recebidas: ${rfq.quotesReceived}\n`;
    });
  }

  if (context.currentQuotation) {
    contextStr += "\n\nCOTAÇÃO ATUAL EM ANÁLISE:\n";
    contextStr += `Origem: ${context.currentQuotation.originCountry}\n`;
    contextStr += `Destino: ${context.currentQuotation.destinationState}\n`;
    contextStr += `Frete: USD ${(context.currentQuotation.freightCents / 100).toFixed(2)}\n`;
    contextStr += "\nProdutos:\n";
    context.currentQuotation.products.forEach((p, i) => {
      const unitPrice = (p.unitPriceCents / 100).toFixed(2);
      const targetPrice = p.targetPriceCents ? (p.targetPriceCents / 100).toFixed(2) : "não definido";
      contextStr += `${i + 1}. ${p.name} (NCM: ${p.ncm}) - Qtd: ${p.quantity} x USD ${unitPrice} | Alvo: R$ ${targetPrice}\n`;
    });
  }

  return contextStr;
}

/**
 * Analisa um documento (PDF ou imagem) usando visão do LLM
 */
export async function analyzeDocument(
  userId: number,
  documentUrl: string,
  mimeType: string,
  userQuestion?: string
): Promise<string> {
  const analysisPrompt = userQuestion || 
    "Analise este documento de cotação. Extraia os produtos, preços, condições comerciais e qualquer informação relevante para cálculo de importação.";

  try {
    if (mimeType === "application/pdf") {
      console.log("[EXCAMBIA] Analisando PDF:", documentUrl);
      
      const response = await invokeLLM({
        messages: [
          { role: "system", content: EXCAMBIA_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "file_url",
                file_url: {
                  url: documentUrl,
                  mime_type: "application/pdf",
                },
              },
              {
                type: "text",
                text: analysisPrompt,
              },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (typeof content === "string" && content.length > 50) {
        return content;
      }
      
      return `Recebi o documento **${documentUrl.split('/').pop()}** mas não consegui processar seu conteúdo diretamente.\n\nPara melhor análise, você pode:\n1. Copiar e colar o conteúdo do PDF no chat\n2. Usar a função de upload na página **Novo Cálculo** que extrai automaticamente os produtos\n\nComo posso ajudar com sua cotação?`;
    }

    const response = await invokeLLM({
      messages: [
        { role: "system", content: EXCAMBIA_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: documentUrl,
                detail: "high",
              },
            },
            {
              type: "text",
              text: analysisPrompt,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    return typeof content === "string" ? content : "Não foi possível analisar o documento.";
  } catch (error) {
    console.error("[EXCAMBIA] Erro ao analisar documento:", error);
    return `Desculpe, encontrei um erro ao processar o documento.\n\nTente:\n1. Copiar e colar o conteúdo do documento no chat\n2. Usar a função de upload na página **Novo Cálculo**\n\nComo posso ajudar?`;
  }
}

/**
 * Processa uma mensagem do usuário e retorna resposta da Excambia
 */
export async function processMessage(
  userId: number,
  messages: ChatMessage[],
  context?: AnalysisContext
): Promise<string> {
  let systemPrompt = EXCAMBIA_SYSTEM_PROMPT;
  
  if (context) {
    systemPrompt += formatContextForPrompt(context);
  }
  
  // Adiciona dados de mercado em tempo real
  try {
    const marketData = await marketDataService.getLatestMarketIndicators();
    if (marketData && marketData.length > 0) {
      systemPrompt += "\n\nDADOS DE MERCADO ATUAIS:\n";
      const grouped: Record<string, any[]> = {};
      marketData.forEach((item: any) => {
        const cat = item.category || 'outros';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      });
      Object.entries(grouped).forEach(([category, items]) => {
        systemPrompt += `\n${category.toUpperCase()}:\n`;
        items.slice(0, 5).forEach((item: any) => {
          const change = item.changePercent >= 0 ? `+${item.changePercent.toFixed(2)}%` : `${item.changePercent.toFixed(2)}%`;
          systemPrompt += `- ${item.name}: ${item.price.toFixed(2)} ${item.currency || 'USD'} (${change})\n`;
        });
      });
    }
  } catch (error) {
    // Silently ignore market data errors
  }

  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  const response = await invokeLLMWithUserKey(userId, llmMessages as LLMChatMessage[]);

  return response.content || "Desculpe, não consegui processar sua mensagem. Pode reformular?";
}

/**
 * Gera análise de viabilidade para uma cotação
 */
export async function generateViabilityAnalysis(
  quotationData: {
    products: Array<{
      name: string;
      ncm: string;
      quantity: number;
      unitPriceFob: number;
      totalCost: number;
      suggestedPrice: number;
      targetPrice?: number;
    }>;
    totalFob: number;
    totalCost: number;
    totalTaxes: number;
    markup: number;
  }
): Promise<string> {
  const analysisPrompt = `Analise a viabilidade desta cotação de importação e forneça insights de BI:

DADOS DA COTAÇÃO:
- Total FOB: USD ${quotationData.totalFob.toFixed(2)}
- Custo Total (com impostos e custos operacionais): R$ ${quotationData.totalCost.toFixed(2)}
- Total de Impostos: R$ ${quotationData.totalTaxes.toFixed(2)}
- Markup aplicado: ${quotationData.markup}%

PRODUTOS:
${quotationData.products.map((p, i) => {
  const viability = p.targetPrice 
    ? (p.suggestedPrice <= p.targetPrice ? "VIÁVEL" : "ACIMA DO ALVO")
    : "SEM ALVO DEFINIDO";
  return `${i + 1}. ${p.name} (NCM: ${p.ncm})
   - Quantidade: ${p.quantity}
   - Preço FOB unitário: USD ${p.unitPriceFob.toFixed(2)}
   - Custo total: R$ ${p.totalCost.toFixed(2)}
   - Preço sugerido: R$ ${p.suggestedPrice.toFixed(2)}
   - Preço alvo: ${p.targetPrice ? `R$ ${p.targetPrice.toFixed(2)}` : "não definido"}
   - Status: ${viability}`;
}).join("\n\n")}

Forneça:
1. Análise geral da viabilidade da operação
2. Identificação de produtos críticos (acima do preço alvo)
3. Sugestões de negociação com o fornecedor
4. Oportunidades de otimização de custos
5. Projeção de impacto da reforma tributária (2026-2033)
6. Recomendação final (GO / NEGOCIAR / NO-GO / AGUARDAR)`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: EXCAMBIA_SYSTEM_PROMPT },
      { role: "user", content: analysisPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content : "Não foi possível gerar a análise de viabilidade.";
}

/**
 * Gera sugestões de negociação baseadas no histórico
 */
export async function generateNegotiationSuggestions(
  currentQuotation: {
    supplierName: string;
    products: Array<{ name: string; ncm: string; unitPriceFob: number }>;
    totalFob: number;
  },
  historicalData?: {
    averageFobForNcm: Record<string, number>;
    previousQuotationsFromSupplier: number;
  }
): Promise<string> {
  let contextInfo = "";
  
  if (historicalData) {
    contextInfo = `\n\nDADOS HISTÓRICOS:
- Cotações anteriores deste fornecedor: ${historicalData.previousQuotationsFromSupplier}
- Preços médios por NCM no histórico:
${Object.entries(historicalData.averageFobForNcm)
  .map(([ncm, avg]) => `  - NCM ${ncm}: USD ${avg.toFixed(2)} (média)`)
  .join("\n")}`;
  }

  const prompt = `Gere sugestões de negociação para esta cotação:

FORNECEDOR: ${currentQuotation.supplierName}
TOTAL FOB: USD ${currentQuotation.totalFob.toFixed(2)}

PRODUTOS:
${currentQuotation.products.map((p, i) => 
  `${i + 1}. ${p.name} (NCM: ${p.ncm}) - USD ${p.unitPriceFob.toFixed(2)}`
).join("\n")}
${contextInfo}

Forneça:
1. Pontos fortes para negociação
2. Argumentos baseados em dados
3. Sugestão de desconto a solicitar (%)
4. Alternativas caso a negociação não avance
5. Script sugerido para abordagem inicial (em inglês e português)`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: EXCAMBIA_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content : "Não foi possível gerar sugestões de negociação.";
}
