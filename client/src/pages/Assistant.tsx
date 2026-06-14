import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  Bot, Send, Loader2, Bell, TrendingUp, TrendingDown, AlertTriangle, 
  CheckCircle, Info, Trash2, RefreshCw, Settings2,
  MessageSquare, Activity, Sparkles, Target, Shield, Lightbulb,
  ArrowUpRight, ArrowDownRight, Minus, BarChart3, Zap, Brain
} from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

interface MarketIndicator {
  name: string;
  value: number;
  trend: "up" | "down" | "stable";
  impact: "positive" | "negative" | "neutral";
  description: string;
}

interface Correlation {
  variable1: string;
  variable2: string;
  coefficient: number;
  strength: "strong" | "moderate" | "weak";
  interpretation: string;
}

interface TrendPrediction {
  indicator: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  timeframe: string;
  direction: "up" | "down" | "stable";
  recommendation: string;
}

interface OpportunityWindow {
  type: "exchange" | "commodity" | "seasonal" | "regulatory";
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  potentialSavings: number;
  confidence: number;
  actionRequired: string;
}

interface SystemicAnalysis {
  timestamp: Date;
  marketIndicators: MarketIndicator[];
  correlations: Correlation[];
  predictions: TrendPrediction[];
  opportunities: OpportunityWindow[];
  riskFactors: string[];
  strategicInsights: string[];
  overallOutlook: "bullish" | "bearish" | "neutral";
  confidenceScore: number;
}

export default function Assistant() {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [systemicAnalysis, setSystemicAnalysis] = useState<SystemicAnalysis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const utils = trpc.useUtils();
  
  // Queries
  const { data: chatHistory, isLoading: loadingChat } = trpc.agent.getChatHistory.useQuery();
  const { data: alerts, isLoading: loadingAlerts } = trpc.agent.getAlerts.useQuery();
  const { data: unreadAlerts } = trpc.agent.getUnreadAlerts.useQuery();
  const { data: actions, isLoading: loadingActions } = trpc.agent.getActions.useQuery();
  const { data: marketAnalysis, isLoading: loadingMarket } = trpc.agent.analyzeMarket.useQuery();
  
  // Mutations
  const chatMutation = trpc.agent.chat.useMutation({
    onMutate: () => setIsTyping(true),
    onSuccess: () => {
      utils.agent.getChatHistory.invalidate();
      setMessage("");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao enviar mensagem");
    },
    onSettled: () => setIsTyping(false),
  });
  
  const markReadMutation = trpc.agent.markAlertRead.useMutation({
    onSuccess: () => {
      utils.agent.getAlerts.invalidate();
      utils.agent.getUnreadAlerts.invalidate();
    },
  });
  
  const markAllReadMutation = trpc.agent.markAllAlertsRead.useMutation({
    onSuccess: () => {
      utils.agent.getAlerts.invalidate();
      utils.agent.getUnreadAlerts.invalidate();
      toast.success("Todos os alertas marcados como lidos");
    },
  });
  
  const dismissMutation = trpc.agent.dismissAlert.useMutation({
    onSuccess: () => {
      utils.agent.getAlerts.invalidate();
      toast.success("Alerta removido");
    },
  });
  
  const clearChatMutation = trpc.agent.clearChatHistory.useMutation({
    onSuccess: () => {
      utils.agent.getChatHistory.invalidate();
      toast.success("Histórico de chat limpo");
    },
  });
  
  const checkExchangeMutation = trpc.agent.checkExchangeAlerts.useMutation({
    onSuccess: (alerts) => {
      utils.agent.getAlerts.invalidate();
      utils.agent.getUnreadAlerts.invalidate();
      if (alerts.length > 0) {
        toast.success(`${alerts.length} alerta(s) gerado(s)`);
      } else {
        toast.info("Nenhum alerta gerado - câmbio dentro dos limites");
      }
    },
  });
  
  const generateRecsMutation = trpc.agent.generateRecommendations.useMutation({
    onSuccess: (alerts) => {
      utils.agent.getAlerts.invalidate();
      utils.agent.getUnreadAlerts.invalidate();
      toast.success(`${alerts.length} recomendação(ões) gerada(s)`);
    },
  });
  
  const systemicAnalysisMutation = trpc.agent.generateSystemicAnalysis.useMutation({
    onSuccess: (analysis) => {
      setSystemicAnalysis(analysis as SystemicAnalysis);
      toast.success("Análise sistêmica concluída!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao gerar análise");
    },
  });
  
  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || chatMutation.isPending) return;
    chatMutation.mutate({ message: message.trim() });
  };
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };
  
  const getAlertIcon = (type: string) => {
    switch (type) {
      case "exchange_rate_favorable": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "exchange_rate_unfavorable": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "recommendation": return <Sparkles className="h-4 w-4 text-purple-500" />;
      case "market_opportunity": return <TrendingUp className="h-4 w-4 text-blue-500" />;
      default: return <Info className="h-4 w-4 text-gray-500" />;
    }
  };
  
  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up": return <ArrowUpRight className="h-4 w-4 text-green-500" />;
      case "down": return <ArrowDownRight className="h-4 w-4 text-red-500" />;
      case "stable": return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };
  
  const getImpactColor = (impact: "positive" | "negative" | "neutral") => {
    switch (impact) {
      case "positive": return "text-green-600 bg-green-50";
      case "negative": return "text-red-600 bg-red-50";
      case "neutral": return "text-gray-600 bg-gray-50";
    }
  };
  
  const getOutlookInfo = (outlook: "bullish" | "bearish" | "neutral") => {
    switch (outlook) {
      case "bullish": return { label: "Otimista", color: "text-green-600", icon: TrendingUp };
      case "bearish": return { label: "Pessimista", color: "text-red-600", icon: TrendingDown };
      case "neutral": return { label: "Neutro", color: "text-gray-600", icon: Minus };
    }
  };
  
  const getOpportunityTypeIcon = (type: string) => {
    switch (type) {
      case "exchange": return <TrendingUp className="h-5 w-5 text-blue-500" />;
      case "commodity": return <BarChart3 className="h-5 w-5 text-orange-500" />;
      case "seasonal": return <Zap className="h-5 w-5 text-yellow-500" />;
      case "regulatory": return <Shield className="h-5 w-5 text-green-500" />;
      default: return <Target className="h-5 w-5 text-gray-500" />;
    }
  };
  
  const reversedHistory = chatHistory ? [...chatHistory].reverse() : [];
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Brain className="h-8 w-8 text-[#682ABA]" />
            Agente SUPPLEY
          </h1>
          <p className="text-muted-foreground">
            IA Agêntica com análises sistêmicas e preditivas de mercado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Bell className="h-3 w-3" />
            {unreadAlerts?.length || 0} não lidos
          </Badge>
        </div>
      </div>
      
      <Tabs defaultValue="predictive" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="predictive" className="gap-2">
            <Brain className="h-4 w-4" />
            Preditiva
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alertas
            {(unreadAlerts?.length || 0) > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                {unreadAlerts?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Mercado
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Atividade
          </TabsTrigger>
        </TabsList>
        
        {/* Predictive Analysis Tab */}
        <TabsContent value="predictive" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Análise Sistêmica e Preditiva</h2>
              <p className="text-sm text-muted-foreground">
                Correlações de mercado, previsões e janelas de oportunidade
              </p>
            </div>
            <Button
              onClick={() => systemicAnalysisMutation.mutate()}
              disabled={systemicAnalysisMutation.isPending}
              className="bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
            >
              {systemicAnalysisMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              Gerar Análise Sistêmica
            </Button>
          </div>
          
          {systemicAnalysis ? (
            <div className="space-y-6">
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Perspectiva Geral</p>
                        <p className={`text-2xl font-bold ${getOutlookInfo(systemicAnalysis.overallOutlook).color}`}>
                          {getOutlookInfo(systemicAnalysis.overallOutlook).label}
                        </p>
                      </div>
                      {(() => {
                        const OutlookIcon = getOutlookInfo(systemicAnalysis.overallOutlook).icon;
                        return <OutlookIcon className={`h-8 w-8 ${getOutlookInfo(systemicAnalysis.overallOutlook).color}`} />;
                      })()}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Confiança</p>
                        <p className="text-2xl font-bold">{systemicAnalysis.confidenceScore}%</p>
                      </div>
                      <Target className="h-8 w-8 text-[#28E7C5]" />
                    </div>
                    <Progress value={systemicAnalysis.confidenceScore} className="mt-2" />
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Oportunidades</p>
                        <p className="text-2xl font-bold text-green-600">{systemicAnalysis.opportunities.length}</p>
                      </div>
                      <Sparkles className="h-8 w-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Fatores de Risco</p>
                        <p className="text-2xl font-bold text-orange-600">{systemicAnalysis.riskFactors.length}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-orange-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Market Indicators */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Indicadores de Mercado
                  </CardTitle>
                  <CardDescription>Principais métricas que impactam suas importações</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {systemicAnalysis.marketIndicators.map((indicator, idx) => (
                      <div key={idx} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{indicator.name}</span>
                          {getTrendIcon(indicator.trend)}
                        </div>
                        <p className="text-2xl font-bold">
                          {indicator.name.includes("Câmbio") ? `R$ ${indicator.value.toFixed(2)}` :
                           indicator.name.includes("Selic") || indicator.name.includes("Confiança") ? `${indicator.value}%` :
                           `$${indicator.value}`}
                        </p>
                        <Badge className={`mt-2 ${getImpactColor(indicator.impact)}`}>
                          {indicator.impact === "positive" ? "Favorável" : 
                           indicator.impact === "negative" ? "Desfavorável" : "Neutro"}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-2">{indicator.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Correlations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Correlações Identificadas
                  </CardTitle>
                  <CardDescription>Relações entre variáveis que afetam seus custos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {systemicAnalysis.correlations.map((corr, idx) => (
                      <div key={idx} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{corr.variable1}</Badge>
                            <span className="text-muted-foreground">↔</span>
                            <Badge variant="outline">{corr.variable2}</Badge>
                          </div>
                          <Badge className={
                            corr.strength === "strong" ? "bg-red-100 text-red-700" :
                            corr.strength === "moderate" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-700"
                          }>
                            {corr.coefficient > 0 ? "+" : ""}{(corr.coefficient * 100).toFixed(0)}% {corr.strength === "strong" ? "Forte" : corr.strength === "moderate" ? "Moderada" : "Fraca"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{corr.interpretation}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Predictions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Previsões de Mercado
                  </CardTitle>
                  <CardDescription>Projeções para os próximos 30-90 dias</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {systemicAnalysis.predictions.map((pred, idx) => (
                      <div key={idx} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{pred.indicator}</span>
                            {getTrendIcon(pred.direction)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{pred.timeframe}</Badge>
                            <Badge className="bg-[#682ABA]/10 text-[#682ABA]">
                              {pred.confidence}% confiança
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Atual</p>
                            <p className="text-lg font-semibold">{pred.currentValue.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center justify-center">
                            {pred.direction === "up" ? (
                              <ArrowUpRight className="h-6 w-6 text-green-500" />
                            ) : pred.direction === "down" ? (
                              <ArrowDownRight className="h-6 w-6 text-red-500" />
                            ) : (
                              <Minus className="h-6 w-6 text-gray-500" />
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Previsto</p>
                            <p className={`text-lg font-semibold ${
                              pred.direction === "up" ? "text-green-600" :
                              pred.direction === "down" ? "text-red-600" : ""
                            }`}>{pred.predictedValue.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="bg-muted/50 rounded p-3">
                          <p className="text-sm flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 text-[#28E7C5] mt-0.5 flex-shrink-0" />
                            {pred.recommendation}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Opportunities */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-500" />
                    Janelas de Oportunidade
                  </CardTitle>
                  <CardDescription>Momentos ideais para ação identificados pela IA</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {systemicAnalysis.opportunities.map((opp, idx) => (
                      <div key={idx} className="p-4 border rounded-lg border-green-200 bg-green-50/50">
                        <div className="flex items-start gap-3">
                          {getOpportunityTypeIcon(opp.type)}
                          <div className="flex-1">
                            <h4 className="font-semibold">{opp.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{opp.description}</p>
                            <div className="flex items-center gap-2 mt-3">
                              <Badge className="bg-green-100 text-green-700">
                                Economia potencial: {opp.potentialSavings.toFixed(1)}%
                              </Badge>
                              <Badge variant="outline">
                                {opp.confidence}% confiança
                              </Badge>
                            </div>
                            <div className="mt-3 p-2 bg-white rounded border">
                              <p className="text-xs text-muted-foreground">Ação recomendada:</p>
                              <p className="text-sm font-medium">{opp.actionRequired}</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Período: {new Date(opp.startDate).toLocaleDateString("pt-BR")} - {new Date(opp.endDate).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Strategic Insights & Risks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-[#28E7C5]" />
                      Insights Estratégicos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {systemicAnalysis.strategicInsights.map((insight, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                          <span className="text-sm">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                      Fatores de Risco
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {systemicAnalysis.riskFactors.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Shield className="h-4 w-4 text-orange-500 mt-1 flex-shrink-0" />
                          <span className="text-sm">{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
              
              <p className="text-xs text-muted-foreground text-center">
                Análise gerada em {new Date(systemicAnalysis.timestamp).toLocaleString("pt-BR")}
              </p>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12">
                <div className="text-center">
                  <Brain className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Análise Sistêmica Disponível</h3>
                  <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                    Clique no botão acima para gerar uma análise completa do mercado, 
                    incluindo correlações, previsões e janelas de oportunidade para suas importações.
                  </p>
                  <Button
                    onClick={() => systemicAnalysisMutation.mutate()}
                    disabled={systemicAnalysisMutation.isPending}
                    className="bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
                  >
                    {systemicAnalysisMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Iniciar Análise Preditiva
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Chat Tab */}
        <TabsContent value="chat" className="space-y-4">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#311260] to-[#682ABA] flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Agente SUPPLEY</CardTitle>
                  <CardDescription>Especialista em importação</CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearChatMutation.mutate()}
                disabled={clearChatMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
              <ScrollArea className="flex-1 px-6">
                <div className="space-y-4 py-4">
                  {loadingChat ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : reversedHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Olá! Sou o Agente SUPPLEY.</p>
                      <p className="text-sm">Como posso ajudar com suas importações hoje?</p>
                    </div>
                  ) : (
                    reversedHistory.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <Streamdown>{msg.content}</Streamdown>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-4 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              
              <Separator />
              
              <form onSubmit={handleSendMessage} className="p-4 flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Digite sua pergunta sobre importação..."
                  disabled={chatMutation.isPending}
                  className="flex-1"
                />
                <Button type="submit" disabled={chatMutation.isPending || !message.trim()}>
                  {chatMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkExchangeMutation.mutate()}
                disabled={checkExchangeMutation.isPending}
              >
                {checkExchangeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Verificar Câmbio
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateRecsMutation.mutate()}
                disabled={generateRecsMutation.isPending}
              >
                {generateRecsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Gerar Recomendações
              </Button>
            </div>
            {(unreadAlerts?.length || 0) > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar todos como lidos
              </Button>
            )}
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alertas e Notificações
              </CardTitle>
              <CardDescription>
                Alertas gerados automaticamente pelo agente de IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAlerts ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !alerts || alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum alerta no momento</p>
                  <p className="text-sm">Configure alertas de câmbio nas preferências</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 border rounded-lg ${!alert.isRead ? "bg-muted/50" : ""}`}
                      onClick={() => !alert.isRead && markReadMutation.mutate({ alertId: alert.id })}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`h-2 w-2 rounded-full mt-2 ${getPriorityColor(alert.priority)}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              {getAlertIcon(alert.alertType)}
                              <span className="font-medium">{alert.title}</span>
                              {!alert.isRead && (
                                <Badge variant="secondary" className="text-xs">Novo</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                            {alert.actionRecommended && (
                              <p className="text-sm text-primary mt-2 flex items-center gap-1">
                                <Lightbulb className="h-3 w-3" />
                                {alert.actionRecommended}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(alert.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => dismissMutation.mutate({ alertId: alert.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Análise de Mercado
              </CardTitle>
              <CardDescription>
                Tendências e recomendações baseadas em dados de câmbio
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMarket ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Streamdown>{marketAnalysis || "Dados insuficientes para análise."}</Streamdown>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Histórico de Atividades
              </CardTitle>
              <CardDescription>
                Ações executadas pelo agente de IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingActions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !actions || actions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma atividade registrada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {actions.slice(0, 20).map((action) => (
                    <div key={action.id} className="flex items-start gap-3 text-sm">
                      <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                      <div className="flex-1">
                        <p>{action.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(action.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {action.actionType.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
