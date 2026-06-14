/**
 * Intelligence Report Panel - Relatório de Inteligência da Excambia
 * 
 * Mostra o veredicto GO/NEGOTIATE/NO_GO/WAIT com score visual,
 * análise de preços, riscos, timing e ações recomendadas.
 * 
 * Este é o componente que transforma a Excambia de calculadora em agente.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  Target,
  Zap,
  DollarSign,
  Users,
  BarChart3,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Brain,
  Handshake,
  Timer,
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================

interface Scores {
  priceScore: number;
  timingScore: number;
  supplierScore: number;
  marginScore: number;
  riskScore: number;
  overallScore: number;
}

interface PriceAnomaly {
  productName: string;
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

interface ActionItem {
  priority: "high" | "medium" | "low";
  action: string;
  deadline?: string;
  expectedImpact: string;
  category: string;
}

interface RiskFactor {
  name: string;
  level: "low" | "medium" | "high";
  description: string;
  impact: string;
}

interface IntelligenceReportProps {
  verdict: "GO" | "NEGOTIATE" | "NO_GO" | "WAIT";
  confidenceScore: number;
  summary: string;
  scores: Scores;
  anomalies: PriceAnomaly[];
  actions: ActionItem[];
  riskFactors: RiskFactor[];
  riskMitigations: string[];
  overallRisk: "low" | "medium" | "high";
  negotiationTargetDiscount: number;
  negotiationArguments: string[];
  timingRecommendation: "buy_now" | "wait" | "urgent";
  timingReasoning: string;
  savingsOpportunityCents: number;
  isLoading?: boolean;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// ============================================================
// VERDICT BADGE
// ============================================================

function VerdictDisplay({ verdict, score }: { verdict: string; score: number }) {
  const config = {
    GO: { 
      label: "GO", 
      sublabel: "Operação Aprovada",
      color: "bg-emerald-500", 
      textColor: "text-emerald-700",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
      borderColor: "border-emerald-300 dark:border-emerald-700",
      icon: CheckCircle2,
      gradient: "from-emerald-500 to-green-600",
    },
    NEGOTIATE: { 
      label: "NEGOCIAR", 
      sublabel: "Oportunidade com ajustes",
      color: "bg-amber-500", 
      textColor: "text-amber-700",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
      borderColor: "border-amber-300 dark:border-amber-700",
      icon: Handshake,
      gradient: "from-amber-500 to-orange-600",
    },
    NO_GO: { 
      label: "NO GO", 
      sublabel: "Operação Inviável",
      color: "bg-red-500", 
      textColor: "text-red-700",
      bgColor: "bg-red-50 dark:bg-red-900/20",
      borderColor: "border-red-300 dark:border-red-700",
      icon: XCircle,
      gradient: "from-red-500 to-red-700",
    },
    WAIT: { 
      label: "AGUARDAR", 
      sublabel: "Momento não ideal",
      color: "bg-blue-500", 
      textColor: "text-blue-700",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      borderColor: "border-blue-300 dark:border-blue-700",
      icon: Clock,
      gradient: "from-blue-500 to-indigo-600",
    },
  }[verdict] || {
    label: verdict, sublabel: "", color: "bg-gray-500", textColor: "text-gray-700",
    bgColor: "bg-gray-50", borderColor: "border-gray-300", icon: AlertTriangle,
    gradient: "from-gray-500 to-gray-600",
  };
  
  const Icon = config.icon;
  
  return (
    <div className={`flex items-center gap-6 p-6 rounded-xl border-2 ${config.borderColor} ${config.bgColor}`}>
      {/* Score Circle */}
      <div className="relative">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-200 dark:text-gray-700" />
          <circle 
            cx="50" cy="50" r="42" fill="none" strokeWidth="6" strokeLinecap="round"
            stroke="url(#scoreGradient)"
            strokeDasharray={`${score * 2.64} ${264 - score * 2.64}`}
          />
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" className={`text-${config.color.replace('bg-', '')}`} style={{ stopColor: "currentColor" }} />
              <stop offset="100%" className={`text-${config.color.replace('bg-', '')}`} style={{ stopColor: "currentColor" }} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{score}</span>
          <span className="text-[10px] text-gray-500">/ 100</span>
        </div>
      </div>
      
      {/* Verdict Text */}
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-1">
          <Icon className={`h-8 w-8 ${config.textColor}`} />
          <span className={`text-3xl font-black tracking-tight ${config.textColor}`}>
            {config.label}
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{config.sublabel}</p>
      </div>
    </div>
  );
}

// ============================================================
// SCORE BREAKDOWN
// ============================================================

function ScoreBreakdown({ scores }: { scores: Scores }) {
  const items = [
    { label: "Preço", score: scores.priceScore, icon: DollarSign, color: "bg-blue-500" },
    { label: "Margem", score: scores.marginScore, icon: BarChart3, color: "bg-purple-500" },
    { label: "Fornecedor", score: scores.supplierScore, icon: Users, color: "bg-indigo-500" },
    { label: "Timing", score: scores.timingScore, icon: Timer, color: "bg-amber-500" },
    { label: "Risco", score: scores.riskScore, icon: Shield, color: "bg-emerald-500" },
  ];
  
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Brain className="h-4 w-4" />
        Análise Detalhada
      </h4>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <item.icon className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400 w-24">{item.label}</span>
          <div className="flex-1">
            <Progress value={item.score} className="h-2" />
          </div>
          <span className={`text-sm font-semibold w-10 text-right ${
            item.score >= 70 ? "text-emerald-600" : item.score >= 40 ? "text-amber-600" : "text-red-600"
          }`}>
            {item.score}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// ACTION ITEMS
// ============================================================

function ActionsList({ actions }: { actions: ActionItem[] }) {
  const priorityConfig = {
    high: { color: "bg-red-100 text-red-700 dark:bg-red-900/30", label: "URGENTE" },
    medium: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30", label: "IMPORTANTE" },
    low: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30", label: "SUGESTÃO" },
  };
  
  const categoryIcons: Record<string, typeof Zap> = {
    negotiation: Handshake,
    tax: DollarSign,
    timing: Timer,
    logistics: Target,
    risk: Shield,
  };
  
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Ações Recomendadas
      </h4>
      {actions.map((action, i) => {
        const config = priorityConfig[action.priority];
        const Icon = categoryIcons[action.category] || Zap;
        
        return (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
            <div className="flex-shrink-0 mt-0.5">
              <Icon className="h-4 w-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                  {config.label}
                </Badge>
                {action.deadline && (
                  <span className="text-[10px] text-gray-400">{action.deadline}</span>
                )}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{action.action}</p>
              <p className="text-xs text-gray-500 mt-1">{action.expectedImpact}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// RISK PANEL
// ============================================================

function RiskPanel({ 
  riskFactors, 
  mitigations, 
  overallRisk 
}: { 
  riskFactors: RiskFactor[]; 
  mitigations: string[]; 
  overallRisk: string;
}) {
  const [expanded, setExpanded] = useState(false);
  
  const riskColor = overallRisk === "low" 
    ? "text-emerald-600" 
    : overallRisk === "medium" 
      ? "text-amber-600" 
      : "text-red-600";
  
  return (
    <div className="space-y-3">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Análise de Riscos
          <Badge variant="outline" className={`ml-2 ${riskColor}`}>
            {overallRisk === "low" ? "Baixo" : overallRisk === "medium" ? "Médio" : "Alto"}
          </Badge>
        </h4>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      
      {expanded && (
        <div className="space-y-3 animate-in slide-in-from-top-2">
          {riskFactors.map((factor, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800/50">
              <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                factor.level === "high" ? "text-red-500" : factor.level === "medium" ? "text-amber-500" : "text-blue-500"
              }`} />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{factor.name}</p>
                <p className="text-xs text-gray-500">{factor.description}</p>
              </div>
            </div>
          ))}
          
          {mitigations.length > 0 && (
            <>
              <Separator />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mitigações</p>
              {mitigations.map((m, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 flex-shrink-0" />
                  <span>{m}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function IntelligenceReportPanel({
  verdict,
  confidenceScore,
  summary,
  scores,
  anomalies,
  actions,
  riskFactors,
  riskMitigations,
  overallRisk,
  negotiationTargetDiscount,
  negotiationArguments,
  timingRecommendation,
  timingReasoning,
  savingsOpportunityCents,
  isLoading = false,
}: IntelligenceReportProps) {
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600 animate-pulse" />
            Excambia está analisando...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Relatório de Inteligência Excambia
            </CardTitle>
            <CardDescription className="text-gray-400 mt-1">
              Análise agêntica completa da oportunidade de importação
            </CardDescription>
          </div>
          {savingsOpportunityCents > 0 && (
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
              Economia potencial: {formatCurrency(savingsOpportunityCents)}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-6 space-y-6">
        {/* Verdict */}
        <VerdictDisplay verdict={verdict} score={confidenceScore} />
        
        {/* Summary */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
            {summary}
          </p>
        </div>
        
        {/* Scores */}
        <ScoreBreakdown scores={scores} />
        
        <Separator />
        
        {/* Timing */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
          <Timer className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              Timing: {timingRecommendation === "buy_now" ? "Comprar agora" : timingRecommendation === "urgent" ? "URGENTE" : "Aguardar"}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{timingReasoning}</p>
          </div>
        </div>
        
        {/* Negotiation hint */}
        {negotiationTargetDiscount > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
            <Handshake className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                Meta de negociação: {negotiationTargetDiscount.toFixed(0)}% de desconto
              </p>
              <ul className="mt-1 space-y-0.5">
                {negotiationArguments.slice(0, 3).map((arg, i) => (
                  <li key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                    <ArrowRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    {arg}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        
        <Separator />
        
        {/* Actions */}
        <ActionsList actions={actions} />
        
        {/* Risks */}
        <RiskPanel 
          riskFactors={riskFactors} 
          mitigations={riskMitigations} 
          overallRisk={overallRisk} 
        />
        
        {/* Anomalies */}
        {anomalies.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Alertas de Preço ({anomalies.length})
              </h4>
              {anomalies.map((anomaly, i) => (
                <div key={i} className={`p-2 rounded text-sm ${
                  anomaly.severity === "critical" 
                    ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300" 
                    : anomaly.severity === "warning"
                      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                      : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                }`}>
                  <span className="font-medium">{anomaly.productName}:</span> {anomaly.description}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
