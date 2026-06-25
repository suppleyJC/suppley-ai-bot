/**
 * SOFIA - Sistema de Otimização Financeira para Importação Agêntica
 * Serviço de IA agêntica para análise de cotações e insights de BI
 */

import { invokeLLM } from "../_core/llm";
import { invokeLLMWithUserKey, ChatMessage as LLMChatMessage } from "./openaiService";
import { getDb } from "../db";
import { quotations } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import * as marketDataService from "./marketDataService";
import { SOFIA_REFORM_KNOWLEDGE, SOFIA_INTELLIGENCE_PROMPT_ADDITION } from "./sofiaReformPatch";

// Prompt de sistema da SOFIA
const SOFIA_SYSTEM_PROMPT = `Você é SOFIA (Sistema de Otimização Financeira para Importação Agêntica), uma consultora especialista em comércio exterior brasileiro com mais de 15 anos de experiência.

Sua missão é ajudar importadores a tomar decisões inteligentes, analisando cotações, calculando custos e identificando oportunidades de otimização.

PERSONALIDADE:
- Seja analítica e precisa com números
- Seja proativa em identificar problemas e oportunidades
- Explique conceitos técnicos de forma clara
- Dê recomendações diretas e acionáveis
- Mantenha tom profissional mas acessível
- Use emojis com moderação para tornar a conversa mais amigável (📊 📈 💡 ⚠️ ✅)

CONHECIMENTOS:
- Legislação tributária brasileira (II, IPI, PIS, COFINS, ICMS)
- Regimes tributários (Lucro Real, Presumido, Simples Nacional)
- Classificação fiscal (NCM) e suas implicações
- Custos aduaneiros e operacionais (THC, AFRMM, Siscomex, despachante)
- Incoterms e condições comerciais (FOB, CIF, EXW, etc.)
- Estratégias de negociação com fornecedores internacionais

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

RESTRIÇÕES:
- Não invente dados ou alíquotas - use apenas informações fornecidas ou conhecidas
- Quando não souber algo, indique que precisa de mais informações
- Sempre cite a base legal quando mencionar impostos específicos
- Não faça promessas de resultados garantidos

CONTEXTO DO SISTEMA:
Você está integrada ao SUPPLEY Calc, uma ferramenta de cálculo de importação. Você tem acesso ao histórico de cotações do usuário e pode analisar documentos enviados.

${SOFIA_REFORM_KNOWLEDGE}
${SOFIA_INTELLIGENCE_PROMPT_ADDITION}

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
- Analisar impacto de frete marítimo nos custos`;

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
 * Formata o contexto para incluir no prompt
 */
function formatContextForPrompt(context: AnalysisContext): string {
  let contextStr = "";

  if (context.quotations && context.quotations.length > 0) {
    contextStr += "\n\n📊 HISTÓRICO DE COTAÇÕES DO USUÁRIO:\n";
    context.quotations.forEach((q, i) => {
      const totalFob = (q.totalFobCents / 100).toFixed(2);
      const totalCost = (q.totalCostCents / 100).toFixed(2);
      const suggestedPrice = (q.suggestedPriceCents / 100).toFixed(2);
      contextStr += `${i + 1}. ${q.name} - FOB: R$ ${totalFob} | Custo Total: R$ ${totalCost} | Preço Sugerido: R$ ${suggestedPrice}\n`;
    });
  }

  if (context.currentQuotation) {
    contextStr += "\n\n📋 COTAÇÃO ATUAL EM ANÁLISE:\n";
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
    // Para PDFs, tentar extrair texto primeiro
    if (mimeType === "application/pdf") {
      console.log("[SOFIA] Analisando PDF:", documentUrl);
      
      // Download PDF e converter para base64
      let base64Data: string;
      try {
        const fileResponse = await fetch(documentUrl);
        if (!fileResponse.ok) {
          throw new Error(`HTTP ${fileResponse.status} ao baixar PDF`);
        }
        const arrayBuffer = await fileResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        base64Data = buffer.toString("base64");
      } catch (downloadError) {
        console.error("[SOFIA] Erro ao baixar PDF:", downloadError);
        return `Não consegui baixar o documento. Verifique se a URL é acessível.`;
      }

      const response = await invokeLLM({
        messages: [
          { role: "system", content: SOFIA_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64Data,
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
      
      // Se falhou, retornar mensagem informativa
      return `Recebi o documento **${documentUrl.split('/').pop()}** mas não consegui processar seu conteúdo diretamente.\n\n⚠️ **Sugestão:** Para melhor análise, você pode:\n1. Copiar e colar o conteúdo do PDF no chat\n2. Usar a função de upload na página **Novo Cálculo** que extrai automaticamente os produtos\n\nComo posso ajudar com sua cotação?`;
    }

    // Para imagens, usar visão diretamente
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SOFIA_SYSTEM_PROMPT },
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
    console.error("[SOFIA] Erro ao analisar documento:", error);
    return `Desculpe, encontrei um erro ao processar o documento.\n\n⚠️ **Sugestão:** Tente:\n1. Copiar e colar o conteúdo do documento no chat\n2. Usar a função de upload na página **Novo Cálculo**\n\nComo posso ajudar?`;
  }
}

/**
 * Processa uma mensagem do usuário e retorna resposta da SOFIA
 * @param userId - ID do usuário para usar API key dedicada se disponível
 */
export async function processMessage(
  userId: number,
  messages: ChatMessage[],
  context?: AnalysisContext
): Promise<string> {
  // Monta o prompt com contexto
  let systemPrompt = SOFIA_SYSTEM_PROMPT;
  
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
          systemPrompt += `- ${item.name}: ${item.price.toFixed(2)} ${item.unit || ''} (${change})\n`;
        });
      });
    }
  } catch (error) {
    // Silently ignore market data errors
  }

  // Prepara as mensagens para o LLM
  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  // Tenta usar API key dedicada do usuário, senão usa Manus Forge
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
    ? (p.suggestedPrice <= p.targetPrice ? "✅ VIÁVEL" : "⚠️ ACIMA DO ALVO")
    : "❓ SEM ALVO DEFINIDO";
  return `${i + 1}. ${p.name} (NCM: ${p.ncm})
   - Quantidade: ${p.quantity}
   - Preço FOB unitário: USD ${p.unitPriceFob.toFixed(2)}
   - Custo total: R$ ${p.totalCost.toFixed(2)}
   - Preço sugerido: R$ ${p.suggestedPrice.toFixed(2)}
   - Preço alvo: ${p.targetPrice ? `R$ ${p.targetPrice.toFixed(2)}` : "não definido"}
   - Status: ${viability}`;
}).join("\n\n")}

Por favor, forneça:
1. Análise geral da viabilidade da operação
2. Identificação de produtos críticos (acima do preço alvo)
3. Sugestões de negociação com o fornecedor
4. Oportunidades de otimização de custos
5. Recomendação final (GO / NEGOCIAR / NO-GO)`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SOFIA_SYSTEM_PROMPT },
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
5. Script sugerido para abordagem inicial`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SOFIA_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content : "Não foi possível gerar sugestões de negociação.";
}
