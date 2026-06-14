/**
 * Reform Impact Panel - Painel de Impacto da Reforma Tributária
 * 
 * Componente visual que mostra ao usuário exatamente como a reforma
 * tributária impacta cada importação, com timeline interativa e comparação.
 * 
 * DIFERENCIAL: Nenhuma outra ferramenta de importação no Brasil tem isso.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Zap,
  Shield
} from "lucide-react";

// Types matching the backend service
interface ReformComparison {
  currentTotalCents: number;
  newTotalCents: number;
  differenceCents: number;
  differencePercent: number;
  impact: "cheaper" | "more_expensive" | "neutral";
  savingsOrCostCents: number;
}

interface YearlyImpact {
  year: number;
  totalTaxCents: number;
  effectiveRate: number;
  comparedToCurrentPercent: number;
  description?: string;
}

interface ReformInsight {
  text: string;
  type: "info" | "positive" | "negative" | "warning";
}

interface ReformImpactPanelProps {
  comparison: ReformComparison;
  timeline: YearlyImpact[];
  insights: string[];
  currentYear: number;
  cifValueCents: number;
  isLoading?: boolean;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1)}%`;
}

// ============================================================
// TIMELINE VISUAL
// ============================================================

function ReformTimeline({ timeline, currentYear }: { timeline: YearlyImpact[]; currentYear: number }) {
  const maxTax = Math.max(...timeline.map(y => y.totalTaxCents));
  
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Timeline da Reforma (2025-2033)
      </h4>
      <div className="space-y-2">
        {timeline.map((year) => {
          const barWidth = maxTax > 0 ? (year.totalTaxCents / maxTax) * 100 : 0;
          const isCurrentYear = year.year === currentYear;
          const isFuture = year.year > currentYear;
          const changeColor = year.comparedToCurrentPercent < -1 
            ? "text-emerald-600" 
            : year.comparedToCurrentPercent > 1 
              ? "text-red-600" 
              : "text-gray-500";
          
          return (
            <div 
              key={year.year} 
              className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                isCurrentYear 
                  ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700" 
                  : isFuture 
                    ? "opacity-75" 
                    : ""
              }`}
            >
              <div className="w-12 text-sm font-mono font-semibold text-gray-600 dark:text-gray-400">
                {year.year}
                {isCurrentYear && (
                  <span className="block text-[10px] text-purple-600 font-normal">ATUAL</span>
                )}
              </div>
              
              <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    year.comparedToCurrentPercent < -1 
                      ? "bg-gradient-to-r from-emerald-400 to-emerald-500" 
                      : year.comparedToCurrentPercent > 1 
                        ? "bg-gradient-to-r from-red-400 to-red-500" 
                        : "bg-gradient-to-r from-blue-400 to-blue-500"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                  {formatCurrency(year.totalTaxCents)}
                </span>
              </div>
              
              <div className={`w-16 text-right text-xs font-semibold ${changeColor}`}>
                {year.comparedToCurrentPercent === 0 
                  ? "base" 
                  : `${year.comparedToCurrentPercent > 0 ? "+" : ""}${year.comparedToCurrentPercent.toFixed(1)}%`
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// COMPARAÇÃO VISUAL
// ============================================================

function RegimeComparison({ comparison, cifValueCents }: { comparison: ReformComparison; cifValueCents: number }) {
  const ImpactIcon = comparison.impact === "cheaper" 
    ? TrendingDown 
    : comparison.impact === "more_expensive" 
      ? TrendingUp 
      : Minus;
  
  const impactColor = comparison.impact === "cheaper" 
    ? "text-emerald-600" 
    : comparison.impact === "more_expensive" 
      ? "text-red-600" 
      : "text-gray-500";
  
  const impactBg = comparison.impact === "cheaper" 
    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700" 
    : comparison.impact === "more_expensive" 
      ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700" 
      : "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700";
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Current Regime */}
      <Card className="border-blue-200 dark:border-blue-700">
        <CardContent className="pt-4 pb-3">
          <div className="text-xs text-blue-600 font-semibold uppercase tracking-wider mb-1">
            Regime Atual
          </div>
          <div className="text-xs text-gray-500 mb-2">PIS + COFINS + IPI + ICMS</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(comparison.currentTotalCents)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Taxa efetiva: {cifValueCents > 0 ? formatPercent(Math.round((comparison.currentTotalCents / cifValueCents) * 10000)) : "0%"}
          </div>
        </CardContent>
      </Card>
      
      {/* Arrow / Difference */}
      <div className={`flex flex-col items-center justify-center p-4 rounded-lg border ${impactBg}`}>
        <ImpactIcon className={`h-8 w-8 ${impactColor} mb-2`} />
        <div className={`text-lg font-bold ${impactColor}`}>
          {comparison.impact === "cheaper" ? "-" : comparison.impact === "more_expensive" ? "+" : ""}
          {formatCurrency(comparison.savingsOrCostCents)}
        </div>
        <div className={`text-sm ${impactColor}`}>
          {comparison.differencePercent > 0 ? "+" : ""}{comparison.differencePercent.toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {comparison.impact === "cheaper" 
            ? "Economia com reforma" 
            : comparison.impact === "more_expensive" 
              ? "Custo adicional" 
              : "Impacto neutro"
          }
        </div>
      </div>
      
      {/* New Regime */}
      <Card className="border-purple-200 dark:border-purple-700">
        <CardContent className="pt-4 pb-3">
          <div className="text-xs text-purple-600 font-semibold uppercase tracking-wider mb-1">
            Novo Regime (2033)
          </div>
          <div className="text-xs text-gray-500 mb-2">CBS + IBS (sem cálculo por dentro)</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(comparison.newTotalCents)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Taxa efetiva: {cifValueCents > 0 ? formatPercent(Math.round((comparison.newTotalCents / cifValueCents) * 10000)) : "0%"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// INSIGHTS
// ============================================================

function InsightsList({ insights }: { insights: string[] }) {
  const classifyInsight = (text: string): ReformInsight["type"] => {
    if (text.includes("reduzir") || text.includes("economia") || text.includes("simplificando")) return "positive";
    if (text.includes("aumentar") || text.includes("adicional")) return "negative";
    if (text.includes("ATENÇÃO") || text.includes("Seletivo")) return "warning";
    return "info";
  };
  
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Insights da Reforma
      </h4>
      {insights.map((insight, i) => {
        const type = classifyInsight(insight);
        const Icon = type === "positive" ? CheckCircle2 : 
                     type === "negative" ? AlertTriangle : 
                     type === "warning" ? AlertTriangle : Info;
        const color = type === "positive" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" :
                      type === "negative" ? "text-red-600 bg-red-50 dark:bg-red-900/20" :
                      type === "warning" ? "text-amber-600 bg-amber-50 dark:bg-amber-900/20" :
                      "text-blue-600 bg-blue-50 dark:bg-blue-900/20";
        
        return (
          <div key={i} className={`flex items-start gap-2 p-3 rounded-lg ${color}`}>
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm">{insight}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function ReformImpactPanel({
  comparison,
  timeline,
  insights,
  currentYear,
  cifValueCents,
  isLoading = false,
}: ReformImpactPanelProps) {
  const [activeTab, setActiveTab] = useState("comparison");
  
  if (isLoading) {
    return (
      <Card className="border-purple-200 dark:border-purple-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-purple-600" />
            Impacto da Reforma Tributária
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-purple-200 dark:border-purple-700 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-purple-600" />
              Impacto da Reforma Tributária
            </CardTitle>
            <CardDescription className="mt-1">
              Simulação exclusiva Excambia — Como a reforma afeta esta importação
            </CardDescription>
          </div>
          <Badge 
            variant="outline" 
            className={
              comparison.impact === "cheaper" 
                ? "border-emerald-500 text-emerald-700 bg-emerald-50" 
                : comparison.impact === "more_expensive" 
                  ? "border-red-500 text-red-700 bg-red-50" 
                  : "border-gray-500 text-gray-700 bg-gray-50"
            }
          >
            {comparison.impact === "cheaper" 
              ? `Economia de ${Math.abs(comparison.differencePercent).toFixed(1)}%` 
              : comparison.impact === "more_expensive" 
                ? `+${comparison.differencePercent.toFixed(1)}% custo` 
                : "Impacto neutro"
            }
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="comparison">Comparativo</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>
          
          <TabsContent value="comparison">
            <RegimeComparison comparison={comparison} cifValueCents={cifValueCents} />
          </TabsContent>
          
          <TabsContent value="timeline">
            <ReformTimeline timeline={timeline} currentYear={currentYear} />
          </TabsContent>
          
          <TabsContent value="insights">
            <InsightsList insights={insights} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
