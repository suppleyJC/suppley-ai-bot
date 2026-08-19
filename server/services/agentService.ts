import { eq, desc, and, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  agentAlerts, InsertAgentAlert, AgentAlert,
  agentActions, InsertAgentAction, AgentAction,
  agentPreferences, InsertAgentPreferences, AgentPreferences,
  exchangeRateHistory, InsertExchangeRateHistory,
  aiChatMessages, InsertAiChatMessage, AiChatMessage
} from "../../drizzle/schema";
import { getExchangeRate } from "./exchangeService";
import { invokeLLM } from "../_core/llm";

let _db: ReturnType<typeof drizzle> | null = null;

async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

// ==================== AGENT PREFERENCES ====================

export async function getAgentPreferences(userId: number): Promise<AgentPreferences | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(agentPreferences).where(eq(agentPreferences.userId, userId)).limit(1);
  return result[0] || null;
}

export async function upsertAgentPreferences(userId: number, data: Partial<InsertAgentPreferences>): Promise<AgentPreferences | null> {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await getAgentPreferences(userId);
  
  if (existing) {
    await db.update(agentPreferences).set(data).where(eq(agentPreferences.userId, userId));
  } else {
    await db.insert(agentPreferences).values({
      userId,
      ...data,
    });
  }
  
  return getAgentPreferences(userId);
}

// ==================== AGENT ALERTS ====================

export async function createAlert(userId: number, data: {
  alertType: "exchange_rate" | "exchange_rate_favorable" | "exchange_rate_unfavorable" | "market_opportunity" | "cost_optimization" | "supplier_recommendation" | "tax_update" | "trend_alert" | "recommendation";
  priority?: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  actionRecommended?: string;
  metadata?: string;
}): Promise<AgentAlert | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(agentAlerts).values({
    userId,
    alertType: data.alertType,
    priority: data.priority || "medium",
    title: data.title,
    message: data.message,
    actionRecommended: data.actionRecommended,
    metadata: data.metadata,
  });
  const inserted = await db.select().from(agentAlerts).where(eq(agentAlerts.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

export async function getAlertsByUser(userId: number, limit = 50): Promise<AgentAlert[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(agentAlerts)
    .where(eq(agentAlerts.userId, userId))
    .orderBy(desc(agentAlerts.createdAt))
    .limit(limit);
}

export async function getUnreadAlerts(userId: number): Promise<AgentAlert[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(agentAlerts)
    .where(and(eq(agentAlerts.userId, userId), eq(agentAlerts.isRead, false)))
    .orderBy(desc(agentAlerts.createdAt));
}

export async function markAlertAsRead(alertId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(agentAlerts)
    .set({ isRead: true })
    .where(and(eq(agentAlerts.id, alertId), eq(agentAlerts.userId, userId)));
  return true;
}

export async function markAllAlertsAsRead(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(agentAlerts)
    .set({ isRead: true })
    .where(eq(agentAlerts.userId, userId));
  return true;
}

export async function dismissAlert(alertId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(agentAlerts)
    .set({ isDismissed: true })
    .where(and(eq(agentAlerts.id, alertId), eq(agentAlerts.userId, userId)));
  return true;
}

// ==================== AGENT ACTIONS ====================

export async function logAgentAction(userId: number, data: {
  actionType: "analysis_generated" | "alert_created" | "recommendation_made" | "data_fetched" | "trend_detected" | "optimization_suggested" | "exchange_check" | "market_analysis" | "recommendation_generation" | "chat_response";
  description: string;
  result?: string;
}): Promise<AgentAction | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(agentActions).values({
    userId,
    actionType: data.actionType,
    description: data.description,
    result: data.result,
  });
  const inserted = await db.select().from(agentActions).where(eq(agentActions.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

export async function getAgentActions(userId: number, limit = 100): Promise<AgentAction[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(agentActions)
    .where(eq(agentActions.userId, userId))
    .orderBy(desc(agentActions.createdAt))
    .limit(limit);
}

// ==================== EXCHANGE RATE MONITORING ====================

export async function saveExchangeRateHistory(data: InsertExchangeRateHistory): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(exchangeRateHistory).values(data);
}

export async function getExchangeRateHistory(
  fromCurrency: string, 
  toCurrency: string, 
  days: number = 30
): Promise<{ rate: number; timestamp: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const result = await db.select({
    rate: exchangeRateHistory.rate,
    timestamp: exchangeRateHistory.recordedAt,
  }).from(exchangeRateHistory)
    .where(and(
      eq(exchangeRateHistory.fromCurrency, fromCurrency),
      eq(exchangeRateHistory.toCurrency, toCurrency),
      gte(exchangeRateHistory.recordedAt, startDate)
    ))
    .orderBy(exchangeRateHistory.recordedAt);
  
  return result.map(r => ({ rate: Number(r.rate) / 1000000, timestamp: r.timestamp }));
}

// ==================== AUTONOMOUS AGENT TASKS ====================

/**
 * Check exchange rates and create alerts if thresholds are met
 */
export async function checkExchangeRateAlerts(userId: number): Promise<AgentAlert[]> {
  const prefs = await getAgentPreferences(userId);
  if (!prefs || !prefs.enableExchangeAlerts) return [];
  
  const alerts: AgentAlert[] = [];
  
  try {
    // Check USD/BRL rate
    const usdRate = await getExchangeRate("USD", "BRL");
    
    // Save to history
    await saveExchangeRateHistory({
      fromCurrency: "USD",
      toCurrency: "BRL",
      rate: Math.round(usdRate.rate * 1000000),
      source: usdRate.source,
    });
    
    // Check if rate is below target (favorable)
    if (prefs.usdTargetRate && usdRate.rate <= prefs.usdTargetRate / 1000000) {
      const alert = await createAlert(userId, {
        alertType: "exchange_rate_favorable",
        priority: "high",
        title: "Câmbio Favorável para Compra",
        message: `O dólar está em R$ ${usdRate.rate.toFixed(4)}, abaixo do seu limite de R$ ${(prefs.usdTargetRate / 1000000).toFixed(4)}. Este pode ser um bom momento para realizar importações.`,
        actionRecommended: "Considere realizar compras ou fechar câmbio agora.",
        metadata: JSON.stringify({ rate: usdRate.rate, currency: "USD/BRL" }),
      });
      if (alert) alerts.push(alert);
    }
    
    // Log the action
    await logAgentAction(userId, {
      actionType: "exchange_check",
      description: `Verificou cotação USD/BRL: R$ ${usdRate.rate.toFixed(4)}`,
      result: JSON.stringify({ rate: usdRate.rate, alertsCreated: alerts.length }),
    });
    
  } catch (error) {
    console.error("[AgentService] Exchange rate check failed:", error);
  }
  
  return alerts;
}

/**
 * Analyze market trends and generate insights
 */
export async function analyzeMarketTrends(userId: number): Promise<string> {
  const history = await getExchangeRateHistory("USD", "BRL", 30);
  
  if (history.length < 2) {
    return "Dados insuficientes para análise de tendências. Continue monitorando para acumular histórico.";
  }
  
  // Calculate statistics
  const rates = history.map(h => h.rate);
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const currentRate = rates[rates.length - 1];
  const weekAgoRate = rates.length > 7 ? rates[rates.length - 7] : rates[0];
  const weekChange = ((currentRate - weekAgoRate) / weekAgoRate) * 100;
  
  // Determine trend
  let trend = "estável";
  if (weekChange > 2) trend = "alta";
  else if (weekChange < -2) trend = "queda";
  
  const analysis = `## Análise de Mercado - USD/BRL

**Período:** Últimos 30 dias
**Taxa Atual:** R$ ${currentRate.toFixed(4)}
**Média do Período:** R$ ${avgRate.toFixed(4)}
**Mínima:** R$ ${minRate.toFixed(4)}
**Máxima:** R$ ${maxRate.toFixed(4)}

### Tendência
O câmbio está em **${trend}** (${weekChange > 0 ? '+' : ''}${weekChange.toFixed(2)}% na última semana).

### Recomendação
${currentRate < avgRate 
  ? "A taxa atual está **abaixo da média** do período. Este pode ser um momento favorável para importações." 
  : "A taxa atual está **acima da média** do período. Considere aguardar uma melhor cotação se não houver urgência."}`;
  
  // Log the action
  await logAgentAction(userId, {
    actionType: "market_analysis",
    description: "Análise de tendências de mercado USD/BRL",
    result: JSON.stringify({ avgRate, minRate, maxRate, currentRate, trend }),
  });
  
  return analysis;
}

/**
 * Generate proactive recommendations based on user data
 */
export async function generateProactiveRecommendations(userId: number): Promise<AgentAlert[]> {
  const alerts: AgentAlert[] = [];
  
  try {
    // Get market analysis
    const marketAnalysis = await analyzeMarketTrends(userId);
    
    // Use LLM to generate recommendations
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um agente de IA especializado em importação e comércio exterior brasileiro. 
Sua função é analisar dados de mercado e gerar recomendações proativas para o usuário.
Responda em português brasileiro, de forma concisa e acionável.
Foque em oportunidades e riscos relevantes para importadores.`
        },
        {
          role: "user",
          content: `Com base na seguinte análise de mercado, gere 1-2 recomendações acionáveis para um importador brasileiro:

${marketAnalysis}

Responda em formato JSON com a estrutura:
{
  "recommendations": [
    {
      "title": "Título curto da recomendação",
      "message": "Descrição detalhada da recomendação",
      "priority": "high" | "medium" | "low"
    }
  ]
}`
        }
      ],
    });
    
    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : null;
    
    if (content) {
      try {
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          for (const rec of parsed.recommendations || []) {
            const alert = await createAlert(userId, {
              alertType: "recommendation",
              priority: rec.priority as "high" | "medium" | "low",
              title: rec.title,
              message: rec.message,
            });
            if (alert) alerts.push(alert);
          }
        }
      } catch (parseError) {
        console.error("[AgentService] Failed to parse recommendations:", parseError);
      }
    }
    
    // Log the action
    await logAgentAction(userId, {
      actionType: "recommendation_generation",
      description: "Gerou recomendações proativas baseadas em análise de mercado",
      result: JSON.stringify({ alertsCreated: alerts.length }),
    });
    
  } catch (error) {
    console.error("[AgentService] Recommendation generation failed:", error);
  }
  
  return alerts;
}

// ==================== AI CHAT ====================

export async function saveChatMessage(data: InsertAiChatMessage): Promise<AiChatMessage | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(aiChatMessages).values(data);
  const inserted = await db.select().from(aiChatMessages).where(eq(aiChatMessages.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

export async function getChatHistory(userId: number, limit = 50): Promise<AiChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(aiChatMessages)
    .where(eq(aiChatMessages.userId, userId))
    .orderBy(desc(aiChatMessages.createdAt))
    .limit(limit);
}

export async function clearChatHistory(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(aiChatMessages).where(eq(aiChatMessages.userId, userId));
  return true;
}

/**
 * Chat with the AI agent
 */
export async function chatWithAgent(userId: number, message: string): Promise<string> {
  // Save user message
  await saveChatMessage({
    userId,
    role: "user",
    content: message,
  });
  
  // Get chat history for context
  const history = await getChatHistory(userId, 10);
  const reversedHistory = [...history].reverse();
  
  // Get current exchange rate for context
  let exchangeContext = "";
  try {
    const rate = await getExchangeRate("USD", "BRL");
    exchangeContext = `Taxa de câmbio atual USD/BRL: R$ ${rate.rate.toFixed(4)}`;
  } catch {
    exchangeContext = "Taxa de câmbio não disponível no momento.";
  }
  
  // Build messages for LLM
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: `Você é o Agente SUPPLEY, um assistente de IA especializado em importação e comércio exterior brasileiro.

Suas capacidades:
- Responder dúvidas sobre importação, tributação e logística
- Analisar viabilidade de importações
- Fornecer informações sobre NCM, impostos (II, IPI, PIS, COFINS, ICMS)
- Explicar acordos comerciais (Mercosul, ACE-18)
- Orientar sobre documentação e processos aduaneiros
- Analisar tendências de câmbio e mercado

Contexto atual:
${exchangeContext}

Responda sempre em português brasileiro, de forma profissional mas acessível.
Seja proativo em sugerir ações e alertar sobre riscos.
Quando não souber algo, seja honesto e sugira fontes confiáveis.`
    },
    ...reversedHistory.slice(0, -1).map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    {
      role: "user",
      content: message,
    }
  ];
  
  try {
    const response = await invokeLLM({ messages });
    const rawContent = response.choices[0]?.message?.content;
    const assistantMessage = typeof rawContent === 'string' ? rawContent : "Desculpe, não consegui processar sua mensagem.";
    
    // Save assistant response
    await saveChatMessage({
      userId,
      role: "assistant",
      content: assistantMessage,
    });
    
    // Log the action
    await logAgentAction(userId, {
      actionType: "chat_response",
      description: `Respondeu pergunta: "${message.substring(0, 50)}..."`,
      result: JSON.stringify({ messageLength: assistantMessage.length }),
    });
    
    return assistantMessage;
  } catch (error) {
    console.error("[AgentService] Chat failed:", error);
    return "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.";
  }
}
