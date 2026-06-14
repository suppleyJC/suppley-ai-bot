import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Sparkles, TrendingUp, TrendingDown, Lightbulb,
  Brain, Target, Shield, Zap, BarChart3, DollarSign, Minus,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";

interface MarketIndicator {
  name: string;
  value: number;
  trend: "up" | "down" | "stable";
  impact: "positive" | "negative" | "neutral";
  description: string;
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
  correlations: any[];
  predictions: any[];
  opportunities: OpportunityWindow[];
  riskFactors: string[];
  strategicInsights: string[];
  overallOutlook: "bullish" | "bearish" | "neutral";
  confidenceScore: number;
}

interface PredictiveTabProps {
  systemicAnalysis: SystemicAnalysis | null;
  onGenerateAnalysis: () => void;
  isGenerating: boolean;
}

function getTrendIcon(trend: "up" | "down" | "stable") {
  switch (trend) {
    case "up": return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    case "down": return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    case "stable": return <Minus className="h-4 w-4 text-gray-500" />;
  }
}

function getImpactColor(impact: "positive" | "negative" | "neutral") {
  switch (impact) {
    case "positive": return "text-green-600 bg-green-50 dark:bg-green-950/30";
    case "negative": return "text-red-600 bg-red-50 dark:bg-red-950/30";
    case "neutral": return "text-gray-600 bg-gray-50 dark:bg-gray-950/30";
  }
}

function getOutlookInfo(outlook: "bullish" | "bearish" | "neutral") {
  switch (outlook) {
    case "bullish": return { label: "Otimista", color: "text-green-600", bgColor: "bg-green-500", icon: TrendingUp };
    case "bearish": return { label: "Pessimista", color: "text-red-600", bgColor: "bg-red-500", icon: TrendingDown };
    case "neutral": return { label: "Neutro", color: "text-gray-600", bgColor: "bg-gray-500", icon: Minus };
  }
}

function getOpportunityTypeIcon(type: string) {
  switch (type) {
    case "exchange": return <DollarSign className="h-5 w-5 text-blue-500" />;
    case "commodity": return <BarChart3 className="h-5 w-5 text-orange-500" />;
    case "seasonal": return <Zap className="h-5 w-5 text-yellow-500" />;
    case "regulatory": return <Shield className="h-5 w-5 text-green-500" />;
    default: return <Target className="h-5 w-5 text-gray-500" />;
  }
}

export function PredictiveTab({ systemicAnalysis, onGenerateAnalysis, isGenerating }: PredictiveTabProps) {
  return (
    <TabsContent value="predictive" className="flex-1 overflow-auto m-0 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Análise Sistêmica e Preditiva</h2>
            <p className="text-sm text-muted-foreground">
              Correlações de mercado, previsões e janelas de oportunidade
            </p>
          </div>
          <Button
            onClick={onGenerateAnalysis}
            disabled={isGenerating}
            className="bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Gerar Análise Sistêmica
              </>
            )}
          </Button>
        </div>

        {systemicAnalysis ? (
          <div className="space-y-6">
            {/* Overall Outlook */}
            <Card className="border-2 border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span>Perspectiva Geral do Mercado</span>
                  <Badge className={`${getOutlookInfo(systemicAnalysis.overallOutlook).bgColor} text-white`}>
                    {getOutlookInfo(systemicAnalysis.overallOutlook).label}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-2">Confiança da Análise</p>
                    <Progress value={systemicAnalysis.confidenceScore} className="h-3" />
                  </div>
                  <div className="text-2xl font-bold text-purple-600">
                    {systemicAnalysis.confidenceScore}%
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Market Indicators */}
            {systemicAnalysis.marketIndicators.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                    Indicadores de Mercado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2">
                    {systemicAnalysis.marketIndicators.map((indicator, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-xl border ${getImpactColor(indicator.impact)}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{indicator.name}</span>
                          {getTrendIcon(indicator.trend)}
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          {typeof indicator.value === "number"
                            ? indicator.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                            : indicator.value}
                        </div>
                        <p className="text-xs opacity-80">{indicator.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Opportunities */}
            {systemicAnalysis.opportunities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-600" />
                    Janelas de Oportunidade
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {systemicAnalysis.opportunities.map((opp, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-xl border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800"
                      >
                        <div className="flex items-start gap-3">
                          {getOpportunityTypeIcon(opp.type)}
                          <div className="flex-1">
                            <h4 className="font-semibold text-green-800 dark:text-green-300">{opp.title}</h4>
                            <p className="text-sm text-green-700 dark:text-green-400 mt-1">{opp.description}</p>
                            <div className="flex items-center gap-4 mt-3 text-xs">
                              <span className="text-green-600">
                                Economia potencial: R$ {opp.potentialSavings.toLocaleString("pt-BR")}
                              </span>
                              <span className="text-green-600">
                                Confiança: {opp.confidence}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Strategic Insights */}
            {systemicAnalysis.strategicInsights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-600" />
                    Insights Estratégicos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {systemicAnalysis.strategicInsights.map((insight, index) => (
                      <li key={index} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <Sparkles className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <span className="text-sm text-amber-800 dark:text-amber-300">{insight}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Brain className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Análise Sistêmica Disponível</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                Clique no botão acima para gerar uma análise completa do mercado, incluindo correlações, previsões e janelas de oportunidade.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TabsContent>
  );
}
