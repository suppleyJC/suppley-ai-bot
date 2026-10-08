/**
 * LangGraph Agent Service - SUPPLEY Calc
 * 
 * Implementação de agentes especializados usando LangGraph para:
 * - Análise de câmbio e alertas
 * - Cálculos tributários e NCM
 * - Análise de mercado e commodities
 * - Orquestração inteligente de tarefas
 */

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { invokeLLM } from "../_core/llm";
import * as exchangeService from "./exchangeService";
import * as taxService from "./taxCalculationService";
import * as predictiveService from "./predictiveAnalysisService";
import { getDb } from "../db";
import { ncmTaxRates, icmsRates, importCalculations } from "../../drizzle/schema";
import { eq, desc, like } from "drizzle-orm";

// ============================================
// DEFINIÇÃO DO ESTADO DO AGENTE
// ============================================

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  currentAgent: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "orchestrator",
  }),
  toolResults: Annotation<Record<string, unknown>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
  context: Annotation<{
    userId?: number;
    lastQuery?: string;
    intent?: string;
  }>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
});

type AgentStateType = typeof AgentState.State;

// ============================================
// FERRAMENTAS ESPECIALIZADAS
// ============================================

interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

// Ferramentas de Câmbio
const exchangeTools = {
  async getCurrentRate(currency: string = "USD", target: string = "BRL"): Promise<ToolResult> {
    try {
      const result = await exchangeService.getExchangeRate(currency, target);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },

  async getMultipleRates(): Promise<ToolResult> {
    try {
      const rates = await exchangeService.getMultipleRates([
        { from: "USD", to: "BRL" },
        { from: "EUR", to: "BRL" },
        { from: "PYG", to: "BRL" },
      ]);
      return { success: true, data: rates };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },

  async analyzeExchangeTrend(currency: string = "USD"): Promise<ToolResult> {
    try {
      const db = await getDb();
      if (!db) return { success: false, data: null, error: "Database not available" };
      
      // Simular análise de tendência baseada em dados históricos
      const currentRate = await exchangeService.getExchangeRate(currency, "BRL");
      const trend = {
        currency,
        currentRate: currentRate.rate,
        trend: currentRate.rate > 5.5 ? "alta" : currentRate.rate < 5.0 ? "baixa" : "estável",
        recommendation: currentRate.rate > 5.5 
          ? "Aguardar melhores condições para importar" 
          : "Momento favorável para importação",
        volatility: "moderada",
      };
      return { success: true, data: trend };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },
};

// Ferramentas Tributárias
const taxTools = {
  async getNcmInfo(ncmCode: string): Promise<ToolResult> {
    try {
      const db = await getDb();
      if (!db) return { success: false, data: null, error: "Database not available" };
      
      const results = await db.select()
        .from(ncmTaxRates)
        .where(like(ncmTaxRates.ncmCode, `${ncmCode}%`))
        .limit(5);
      
      if (results.length === 0) {
        return { 
          success: true, 
          data: { 
            message: "NCM não encontrado na base. Alíquotas padrão serão aplicadas.",
            defaultRates: { ii: 14, ipi: 10, pis: 2.1, cofins: 9.65 }
          }
        };
      }
      
      return { success: true, data: results };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },

  async calculateImportTaxes(params: {
    cifValue: number;
    ncmCode: string;
    originCountry: string;
    destinationState: string;
  }): Promise<ToolResult> {
    try {
      const result = await taxService.calculateImportTaxes({
        cifValueCents: Math.round(params.cifValue * 100),
        ncmCode: params.ncmCode,
        originCountry: params.originCountry,
        destinationState: params.destinationState,
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },

  async getIcmsRate(state: string): Promise<ToolResult> {
    try {
      const db = await getDb();
      if (!db) return { success: false, data: null, error: "Database not available" };
      
      const results = await db.select()
        .from(icmsRates)
        .where(eq(icmsRates.stateCode, state.toUpperCase()))
        .limit(1);
      
      if (results.length === 0) {
        return { success: true, data: { state, icmsRate: 18, message: "Alíquota padrão" } };
      }
      
      return { success: true, data: results[0] };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },

  async getMercosulBenefits(originCountry: string): Promise<ToolResult> {
    const mercosulCountries = ["paraguai", "argentina", "uruguai", "py", "ar", "uy"];
    const isMercosul = mercosulCountries.some(c => 
      originCountry.toLowerCase().includes(c)
    );
    
    return {
      success: true,
      data: {
        isMercosul,
        benefits: isMercosul ? [
          "Isenção de Imposto de Importação (II) para produtos com origem Mercosul",
          "Preferência tarifária conforme ACE-18",
          "Tratamento aduaneiro simplificado",
        ] : [],
        requirements: isMercosul ? [
          "Certificado de Origem válido",
          "Cumprimento das regras de origem do Mercosul",
        ] : [],
      },
    };
  },
};

// Ferramentas de Mercado
const marketTools = {
  async getMarketAnalysis(): Promise<ToolResult> {
    try {
      const analysis = await predictiveService.generateSystemicAnalysis();
      return { success: true, data: analysis };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },

  async getCommodityInfo(commodity: string): Promise<ToolResult> {
    // Mapeamento de nomes em português para códigos do commodityService
    const nameToCode: Record<string, string> = {
      "aço": "STEEL_HRC",
      "ferro": "STEEL_HRC",
      "alumínio": "ALUMINUM_LME",
      "aluminio": "ALUMINUM_LME",
      "cobre": "COPPER_LME",
      "zinco": "ZINC_LME",
      "níquel": "NICKEL_LME",
      "niquel": "NICKEL_LME",
      "ouro": "GOLD",
      "prata": "SILVER",
      "petróleo": "BRENT_OIL",
      "petroleo": "BRENT_OIL",
      "soja": "SOYBEAN",
      "milho": "CORN",
      "trigo": "WHEAT",
      "algodão": "COTTON",
      "algodao": "COTTON",
      "café": "COFFEE",
      "cafe": "COFFEE",
    };

    const normalizedCommodity = commodity.toLowerCase().trim();
    const code = nameToCode[normalizedCommodity];

    if (!code) {
      return {
        success: true,
        data: {
          commodity: normalizedCommodity,
          price: 0,
          unit: "N/A",
          trend: "desconhecido",
          forecast: "Dados não disponíveis. Commodities disponíveis: aço, alumínio, cobre, zinco, ouro, prata, petróleo, soja, milho, trigo, algodão, café",
        },
      };
    }

    try {
      const { getCurrentCommodityPrice, getCommodityHistory, analyzeCommodityTrend } = await import("./commodityService");
      const priceData = await getCurrentCommodityPrice(code);
      const history = await getCommodityHistory(code, 30);
      const trend = analyzeCommodityTrend(code, history);

      if (priceData) {
        return {
          success: true,
          data: {
            commodity: normalizedCommodity,
            code,
            price: priceData.price / 100,
            unit: `USD/${priceData.unit}`,
            trend: trend.trend === "bullish" ? "alta" : trend.trend === "bearish" ? "baixa" : "estável",
            changePercent: priceData.changePercent,
            volatility: trend.volatility,
            forecast: trend.recommendation,
            source: priceData.source,
          },
        };
      }
    } catch (error) {
      console.error("[Agent] Error fetching commodity:", error);
    }

    return {
      success: true,
      data: {
        commodity: normalizedCommodity,
        price: 0,
        unit: "N/A",
        trend: "desconhecido",
        forecast: "Erro ao buscar dados em tempo real",
      },
    };
  },

  async getCalculationHistory(userId: number, limit: number = 5): Promise<ToolResult> {
    try {
      const db = await getDb();
      if (!db) return { success: false, data: null, error: "Database not available" };
      
      const results = await db.select()
        .from(importCalculations)
        .where(eq(importCalculations.userId, userId))
        .orderBy(desc(importCalculations.createdAt))
        .limit(limit);
      
      return { success: true, data: results };
    } catch (error) {
      return { success: false, data: null, error: String(error) };
    }
  },
};

// ============================================
// NÓS DO GRAFO DE AGENTES
// ============================================

// Nó Orquestrador - Decide qual agente especializado chamar
async function orchestratorNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const userQuery = lastMessage?.content?.toString() || "";
  
  // Usar LLM para classificar a intenção
  const classificationPrompt = `
Você é um classificador de intenções para um sistema de importação. 
Analise a pergunta do usuário e classifique em uma das categorias:

- "exchange": Perguntas sobre câmbio, cotações, dólar, euro, guarani
- "tax": Perguntas sobre impostos, NCM, alíquotas, tributação, Mercosul
- "market": Perguntas sobre mercado, commodities, tendências, preços de materiais
- "calculation": Perguntas sobre cálculos de importação, custos, viabilidade
- "general": Perguntas gerais sobre importação ou saudações

Pergunta: "${userQuery}"

Responda APENAS com a categoria (uma palavra).
`;

  try {
    const response = await invokeLLM({
      messages: [{ role: "user", content: classificationPrompt }],
    });
    
    const content = response.choices[0]?.message?.content;
    const intent = (typeof content === "string" ? content.toLowerCase().trim() : "general");
    
    return {
      context: { ...state.context, lastQuery: userQuery, intent },
      currentAgent: intent,
    };
  } catch {
    return {
      context: { ...state.context, lastQuery: userQuery, intent: "general" },
      currentAgent: "general",
    };
  }
}

// Nó do Agente de Câmbio
async function exchangeAgentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = state.context.lastQuery || "";
  
  // Coletar dados de câmbio
  const [currentRates, usdTrend] = await Promise.all([
    exchangeTools.getMultipleRates(),
    exchangeTools.analyzeExchangeTrend("USD"),
  ]);
  
  // Gerar resposta com LLM
  const systemPrompt = `
Você é o Agente de Câmbio da SUPPLEY, especialista em análise de taxas de câmbio para importação.
Você tem acesso aos seguintes dados em tempo real:

Cotações Atuais:
${JSON.stringify(currentRates.data, null, 2)}

Análise de Tendência USD:
${JSON.stringify(usdTrend.data, null, 2)}

Responda à pergunta do usuário de forma clara e objetiva, fornecendo insights sobre:
- Cotações atuais
- Tendências de curto prazo
- Recomendações para timing de importação
- Impacto no custo de importação

Seja específico com números e percentuais quando relevante.
`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });
    
    const aiResponse = response.choices[0]?.message?.content || "Não foi possível analisar o câmbio no momento.";
    
    return {
      messages: [new AIMessage(aiResponse)],
      toolResults: { exchange: { currentRates: currentRates.data, trend: usdTrend.data } },
    };
  } catch {
    return {
      messages: [new AIMessage("Desculpe, ocorreu um erro ao analisar o câmbio. Tente novamente.")],
    };
  }
}

// Nó do Agente Tributário
async function taxAgentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = state.context.lastQuery || "";
  
  // Extrair NCM se mencionado na query
  const ncmMatch = query.match(/\d{4}\.?\d{2}\.?\d{2}/);
  const ncmCode = ncmMatch ? ncmMatch[0].replace(/\./g, "") : null;
  
  // Coletar dados tributários
  const toolResults: Record<string, unknown> = {};
  
  if (ncmCode) {
    const ncmInfo = await taxTools.getNcmInfo(ncmCode);
    toolResults.ncmInfo = ncmInfo.data;
  }
  
  // Verificar se menciona país do Mercosul
  const mercosulCountries = ["paraguai", "argentina", "uruguai"];
  const mentionedCountry = mercosulCountries.find(c => query.toLowerCase().includes(c));
  if (mentionedCountry) {
    const benefits = await taxTools.getMercosulBenefits(mentionedCountry);
    toolResults.mercosulBenefits = benefits.data;
  }
  
  // Gerar resposta com LLM
  const systemPrompt = `
Você é o Agente Tributário da SUPPLEY, especialista em legislação de importação e tributação.
Você tem conhecimento profundo sobre:
- Imposto de Importação (II)
- IPI, PIS-Importação, COFINS-Importação
- ICMS por estado
- Acordos do Mercosul (ACE-18)
- Classificação NCM

${Object.keys(toolResults).length > 0 ? `Dados coletados:\n${JSON.stringify(toolResults, null, 2)}` : ""}

Responda à pergunta do usuário de forma técnica mas acessível, citando:
- Alíquotas aplicáveis
- Base legal quando relevante
- Benefícios fiscais disponíveis
- Requisitos para aproveitamento de benefícios
`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });
    
    const aiResponse = response.choices[0]?.message?.content || "Não foi possível analisar a tributação no momento.";
    
    return {
      messages: [new AIMessage(aiResponse)],
      toolResults: { tax: toolResults },
    };
  } catch {
    return {
      messages: [new AIMessage("Desculpe, ocorreu um erro ao analisar a tributação. Tente novamente.")],
    };
  }
}

// Nó do Agente de Mercado
async function marketAgentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = state.context.lastQuery || "";
  
  // Identificar commodities mencionadas
  const commodities = ["aço", "ferro", "alumínio", "cobre", "prego", "escora"];
  const mentionedCommodities = commodities.filter(c => query.toLowerCase().includes(c));
  
  // Coletar dados de mercado
  const toolResults: Record<string, unknown> = {};
  
  for (const commodity of mentionedCommodities) {
    const info = await marketTools.getCommodityInfo(commodity);
    toolResults[commodity] = info.data;
  }
  
  // Se não mencionou commodity específica, buscar análise geral
  if (mentionedCommodities.length === 0) {
    const marketAnalysis = await marketTools.getMarketAnalysis();
    toolResults.marketAnalysis = marketAnalysis.data;
  }
  
  // Gerar resposta com LLM
  const systemPrompt = `
Você é o Agente de Mercado da SUPPLEY, especialista em análise de commodities e tendências de mercado.
Você monitora:
- Preços de matérias-primas (aço, ferro, alumínio)
- Tendências de mercado de construção civil
- Indicadores macroeconômicos
- Oportunidades de compra

${Object.keys(toolResults).length > 0 ? `Dados de mercado:\n${JSON.stringify(toolResults, null, 2)}` : ""}

Responda à pergunta do usuário com insights sobre:
- Situação atual do mercado
- Tendências de preços
- Melhores momentos para compra
- Riscos e oportunidades
`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });
    
    const aiResponse = response.choices[0]?.message?.content || "Não foi possível analisar o mercado no momento.";
    
    return {
      messages: [new AIMessage(aiResponse)],
      toolResults: { market: toolResults },
    };
  } catch {
    return {
      messages: [new AIMessage("Desculpe, ocorreu um erro ao analisar o mercado. Tente novamente.")],
    };
  }
}

// Nó do Agente de Cálculo
async function calculationAgentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = state.context.lastQuery || "";
  const userId = state.context.userId;
  
  // Buscar histórico de cálculos se disponível
  let history = null;
  if (userId) {
    const historyResult = await marketTools.getCalculationHistory(userId, 3);
    if (historyResult.success) {
      history = historyResult.data;
    }
  }
  
  // Gerar resposta com LLM
  const systemPrompt = `
Você é o Agente de Cálculo da SUPPLEY, especialista em análise de viabilidade de importação.
Você ajuda a:
- Calcular custos totais de importação
- Analisar viabilidade econômica
- Comparar cenários de importação
- Otimizar margens de lucro

${history ? `Últimos cálculos do usuário:\n${JSON.stringify(history, null, 2)}` : ""}

Responda à pergunta do usuário sobre cálculos de importação, explicando:
- Composição dos custos
- Impostos incidentes
- Margem de lucro esperada
- Recomendações de otimização
`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });
    
    const aiResponse = response.choices[0]?.message?.content || "Não foi possível processar o cálculo no momento.";
    
    return {
      messages: [new AIMessage(aiResponse)],
      toolResults: { calculation: { history } },
    };
  } catch {
    return {
      messages: [new AIMessage("Desculpe, ocorreu um erro ao processar o cálculo. Tente novamente.")],
    };
  }
}

// Nó do Agente Geral
async function generalAgentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = state.context.lastQuery || "";
  
  const systemPrompt = `
Você é o Agente SUPPLEY, um assistente inteligente especializado em importação para o Brasil.
A SUPPLEY é uma empresa de sourcing e desenvolvimento de produtos para construção civil, 
com foco em ferro, aço (pregos, arames, escoras metálicas), acabamentos, equipamentos e máquinas.

Você pode ajudar com:
- Dúvidas sobre processos de importação
- Informações sobre câmbio e tributação
- Análise de mercado e commodities
- Cálculos de viabilidade

Seja cordial, profissional e objetivo nas respostas.
Se a pergunta for muito específica, sugira usar uma das funcionalidades especializadas do sistema.
`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });
    
    const aiResponse = response.choices[0]?.message?.content || "Olá! Como posso ajudar com suas importações hoje?";
    
    return {
      messages: [new AIMessage(aiResponse)],
    };
  } catch {
    return {
      messages: [new AIMessage("Olá! Estou aqui para ajudar com suas importações. Como posso ajudar?")],
    };
  }
}

// ============================================
// ROTEAMENTO CONDICIONAL
// ============================================

function routeToAgent(state: AgentStateType): string {
  const intent = state.context.intent || "general";
  
  switch (intent) {
    case "exchange":
      return "exchangeAgent";
    case "tax":
      return "taxAgent";
    case "market":
      return "marketAgent";
    case "calculation":
      return "calculationAgent";
    default:
      return "generalAgent";
  }
}

// ============================================
// CONSTRUÇÃO DO GRAFO
// ============================================

const agentGraph = new StateGraph(AgentState)
  // Adicionar nós
  .addNode("orchestrator", orchestratorNode)
  .addNode("exchangeAgent", exchangeAgentNode)
  .addNode("taxAgent", taxAgentNode)
  .addNode("marketAgent", marketAgentNode)
  .addNode("calculationAgent", calculationAgentNode)
  .addNode("generalAgent", generalAgentNode)
  // Definir fluxo
  .addEdge(START, "orchestrator")
  .addConditionalEdges("orchestrator", routeToAgent, [
    "exchangeAgent",
    "taxAgent",
    "marketAgent",
    "calculationAgent",
    "generalAgent",
  ])
  // Todos os agentes terminam após responder
  .addEdge("exchangeAgent", END)
  .addEdge("taxAgent", END)
  .addEdge("marketAgent", END)
  .addEdge("calculationAgent", END)
  .addEdge("generalAgent", END)
  .compile();

// ============================================
// INTERFACE PÚBLICA
// ============================================

export interface AgentResponse {
  response: string;
  agent: string;
  toolResults?: Record<string, unknown>;
}

export async function invokeAgent(
  message: string,
  userId?: number
): Promise<AgentResponse> {
  try {
    const result = await agentGraph.invoke({
      messages: [new HumanMessage(message)],
      context: { userId },
    });
    
    const lastMessage = result.messages[result.messages.length - 1];
    const response = lastMessage?.content?.toString() || "Não foi possível processar sua solicitação.";
    
    return {
      response,
      agent: result.currentAgent || "general",
      toolResults: result.toolResults,
    };
  } catch (error) {
    console.error("[LangGraph Agent] Error:", error);
    return {
      response: "Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.",
      agent: "error",
    };
  }
}

// Função para análise sistêmica completa
export async function runSystemicAnalysis(): Promise<{
  success: boolean;
  analysis?: Awaited<ReturnType<typeof predictiveService.generateSystemicAnalysis>>;
  error?: string;
}> {
  try {
    const analysis = await predictiveService.generateSystemicAnalysis();
    return { success: true, analysis };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export { agentGraph, AgentState };
