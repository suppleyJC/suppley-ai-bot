import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as agentService from "../services/agentService";
import { invokeAgent, runSystemicAnalysis } from "../services/langGraphAgentService";
import { generateSystemicAnalysis, saveAnalysis, getAnalysisSummary } from "../services/predictiveAnalysisService";
import * as predictionTracking from "../services/predictionTrackingService";

export const agentRouter = router({
// Preferences
getPreferences: protectedProcedure.query(async ({ ctx }) => {
  return agentService.getAgentPreferences(ctx.user.id);
}),

updatePreferences: protectedProcedure
  .input(z.object({
    enableExchangeAlerts: z.boolean().optional(),
    usdTargetRate: z.number().optional(),
    eurTargetRate: z.number().optional(),
    enableEmailNotifications: z.boolean().optional(),
    enablePushNotifications: z.boolean().optional(),
    autoAnalyzeNewCalculations: z.boolean().optional(),
    preferredAnalysisDepth: z.enum(["basic", "standard", "detailed"]).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Convert rates to storage format (multiply by 1000000)
    const data: Record<string, unknown> = { ...input };
    if (input.usdTargetRate !== undefined) {
      data.usdTargetRate = Math.round(input.usdTargetRate * 1000000);
    }
    if (input.eurTargetRate !== undefined) {
      data.eurTargetRate = Math.round(input.eurTargetRate * 1000000);
    }
    return agentService.upsertAgentPreferences(ctx.user.id, data);
  }),

// Alerts
getAlerts: protectedProcedure
  .input(z.object({ limit: z.number().default(50) }).optional())
  .query(async ({ ctx, input }) => {
    return agentService.getAlertsByUser(ctx.user.id, input?.limit ?? 50);
  }),

getUnreadAlerts: protectedProcedure.query(async ({ ctx }) => {
  return agentService.getUnreadAlerts(ctx.user.id);
}),

markAlertRead: protectedProcedure
  .input(z.object({ alertId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return agentService.markAlertAsRead(input.alertId, ctx.user.id);
  }),

markAllAlertsRead: protectedProcedure.mutation(async ({ ctx }) => {
  return agentService.markAllAlertsAsRead(ctx.user.id);
}),

dismissAlert: protectedProcedure
  .input(z.object({ alertId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return agentService.dismissAlert(input.alertId, ctx.user.id);
  }),

// Actions log
getActions: protectedProcedure
  .input(z.object({ limit: z.number().default(100) }).optional())
  .query(async ({ ctx, input }) => {
    return agentService.getAgentActions(ctx.user.id, input?.limit ?? 100);
  }),

// Analysis
analyzeMarket: protectedProcedure.query(async ({ ctx }) => {
  return agentService.analyzeMarketTrends(ctx.user.id);
}),

checkExchangeAlerts: protectedProcedure.mutation(async ({ ctx }) => {
  return agentService.checkExchangeRateAlerts(ctx.user.id);
}),

generateRecommendations: protectedProcedure.mutation(async ({ ctx }) => {
  return agentService.generateProactiveRecommendations(ctx.user.id);
}),

// Exchange rate history
getExchangeHistory: protectedProcedure
  .input(z.object({
    from: z.string().length(3).default("USD"),
    to: z.string().length(3).default("BRL"),
    days: z.number().default(30),
  }).optional())
  .query(async ({ input }) => {
    return agentService.getExchangeRateHistory(
      input?.from ?? "USD",
      input?.to ?? "BRL",
      input?.days ?? 30
    );
  }),

// Chat - LangGraph Agent
chat: protectedProcedure
  .input(z.object({ message: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    // Use LangGraph agent for intelligent responses
    const result = await invokeAgent(input.message, ctx.user.id);
    
    // Save to chat history
    await agentService.saveChatMessage({
      userId: ctx.user.id,
      role: "user",
      content: input.message,
    });
    await agentService.saveChatMessage({
      userId: ctx.user.id,
      role: "assistant",
      content: result.response,
    });
    
    return {
      response: result.response,
      agent: result.agent,
      toolResults: result.toolResults,
    };
  }),

getChatHistory: protectedProcedure
  .input(z.object({ limit: z.number().default(50) }).optional())
  .query(async ({ ctx, input }) => {
    return agentService.getChatHistory(ctx.user.id, input?.limit ?? 50);
  }),

clearChatHistory: protectedProcedure.mutation(async ({ ctx }) => {
  return agentService.clearChatHistory(ctx.user.id);
}),

// Predictive Analysis - Systemic and Market Analysis (LangGraph)
generateSystemicAnalysis: protectedProcedure.mutation(async ({ ctx }) => {
  // Use LangGraph for systemic analysis
  const langGraphResult = await runSystemicAnalysis();
  
  let analysis;
  if (langGraphResult.success && langGraphResult.analysis) {
    await saveAnalysis(langGraphResult.analysis);
    analysis = langGraphResult.analysis;
  } else {
    // Fallback to original service
    analysis = await generateSystemicAnalysis();
    await saveAnalysis(analysis);
  }

  // Salvar previsões para tracking de acurácia
  if (analysis.predictions && analysis.predictions.length > 0) {
    await predictionTracking.savePredictions(
      analysis.predictions,
      "systemic",
      ctx.user.id,
      JSON.stringify(analysis)
    );
  }

  return analysis;
}),

getAnalysisSummary: protectedProcedure.query(async () => {
  return getAnalysisSummary();
}),

// Prediction Tracking - Histórico e Acurácia
getPredictionAccuracy: protectedProcedure.query(async ({ ctx }) => {
  // Primeiro avaliar previsões expiradas
  await predictionTracking.evaluateExpiredPredictions();
  // Depois gerar relatório
  return predictionTracking.getAccuracyReport(ctx.user.id);
}),

getPredictionHistory: protectedProcedure
  .input(z.object({
    indicator: z.string(),
    limit: z.number().optional().default(30),
  }))
  .query(async ({ input }) => {
    return predictionTracking.getPredictionHistory(input.indicator, input.limit);
  }),

evaluatePredictions: protectedProcedure.mutation(async () => {
  return predictionTracking.evaluateExpiredPredictions();
}),
});
