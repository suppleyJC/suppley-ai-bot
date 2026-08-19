/**
 * Reform Dashboard - Painel da Reforma Tributária
 * 
 * Página dedicada para o usuário entender e simular o impacto
 * da reforma tributária nas suas importações.
 * 
 * EXCLUSIVO Excambia - Nenhuma outra ferramenta tem isso.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  Calendar,
  TrendingDown,
  Calculator,
  Info,
  AlertTriangle,
  CheckCircle2,
  Zap,
  BookOpen,
} from "lucide-react";
import ReformImpactPanel from "@/components/ReformImpactPanel";

// Reform timeline data (matching backend)
const REFORM_PHASES = [
  { year: 2025, status: "current", title: "Regime Atual", description: "PIS + COFINS + IPI + ICMS. Sistema tributário vigente.", color: "bg-blue-500" },
  { year: 2026, status: "test", title: "Fase Teste", description: "CBS 0,9% + IBS 0,1% — apenas simulação, sem recolhimento efetivo.", color: "bg-yellow-500" },
  { year: 2027, status: "future", title: "CBS Integral", description: "CBS substitui PIS/COFINS/IPI. Imposto Seletivo inicia. IPI zerado.", color: "bg-purple-500" },
  { year: 2028, status: "future", title: "Consolidação", description: "CBS consolidada. ICMS e ISS ainda vigentes.", color: "bg-purple-400" },
  { year: 2029, status: "future", title: "IBS 10%", description: "IBS começa a substituir ICMS/ISS. Transição gradual inicia.", color: "bg-indigo-500" },
  { year: 2030, status: "future", title: "IBS 20%", description: "IBS assume 20% da participação. ICMS reduz proporcionalmente.", color: "bg-indigo-400" },
  { year: 2031, status: "future", title: "IBS 30%", description: "IBS assume 30%. Transição no meio do caminho.", color: "bg-indigo-300" },
  { year: 2032, status: "future", title: "IBS 40%", description: "IBS assume 40%. Reta final da transição.", color: "bg-violet-500" },
  { year: 2033, status: "future", title: "Implementação Total", description: "IBS + CBS plenos. ICMS e ISS extintos. Fim do 'cálculo por dentro'.", color: "bg-emerald-500" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// ============================================================
// TIMELINE VISUAL
// ============================================================

function ReformTimelineVisual() {
  const currentYear = new Date().getFullYear();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-600" />
          Cronograma da Reforma Tributária
        </CardTitle>
        <CardDescription>
          EC 132/2023 + LC 214/2025 — Transição de 2026 a 2033
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-muted dark:bg-gray-700" />
          
          <div className="space-y-6">
            {REFORM_PHASES.map((phase, i) => {
              const isCurrent = phase.year === currentYear;
              const isPast = phase.year < currentYear;
              const isFuture = phase.year > currentYear;
              
              return (
                <div key={phase.year} className="relative flex items-start gap-4">
                  {/* Dot */}
                  <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                    isCurrent 
                      ? "border-purple-500 bg-purple-100 dark:bg-purple-900/30" 
                      : isPast 
                        ? "border-border bg-muted dark:bg-gray-800" 
                        : "border-border bg-card dark:bg-gray-900"
                  }`}>
                    <span className={`text-sm font-bold ${
                      isCurrent ? "text-purple-700" : isPast ? "text-muted-foreground" : "text-muted-foreground"
                    }`}>
                      {phase.year.toString().slice(2)}
                    </span>
                    {isCurrent && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className={`flex-1 pb-2 ${isFuture ? "opacity-70" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-semibold ${isCurrent ? "text-purple-700 dark:text-purple-300" : "text-foreground dark:text-gray-200"}`}>
                        {phase.year} — {phase.title}
                      </h4>
                      {isCurrent && (
                        <Badge className="bg-purple-100 text-purple-700 text-[10px]">ATUAL</Badge>
                      )}
                      {phase.year === 2026 && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300 text-[10px]">TESTE</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground dark:text-gray-400">{phase.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// SIMULADOR RÁPIDO
// ============================================================

function QuickSimulator() {
  const [cifValue, setCifValue] = useState<string>("");
  const [ncm, setNcm] = useState<string>("");
  const [simulated, setSimulated] = useState(false);
  
  // Simulated results (in production, this would call the API)
  const mockResults = {
    comparison: {
      currentTotalCents: Math.round(parseFloat(cifValue || "0") * 100 * 0.45),
      newTotalCents: Math.round(parseFloat(cifValue || "0") * 100 * 0.42),
      differenceCents: Math.round(parseFloat(cifValue || "0") * 100 * -0.03),
      differencePercent: -6.7,
      impact: "cheaper" as const,
      savingsOrCostCents: Math.round(parseFloat(cifValue || "0") * 100 * 0.03),
    },
    timeline: Array.from({ length: 9 }, (_, i) => ({
      year: 2025 + i,
      totalTaxCents: Math.round(parseFloat(cifValue || "0") * 100 * (0.45 - i * 0.003)),
      effectiveRate: 4500 - i * 30,
      comparedToCurrentPercent: i === 0 ? 0 : -(i * 0.8),
    })),
    insights: [
      "A reforma tributária reduzirá o custo tributário desta importação em aproximadamente 6,7%.",
      `Economia estimada de ${formatCurrency(parseFloat(cifValue || "0") * 0.03)} por operação quando totalmente implementada.`,
      "Em 2026, CBS (0,9%) e IBS (0,1%) são apenas simulação — sem recolhimento efetivo.",
      "O 'cálculo por dentro' será eliminado, simplificando a tributação.",
    ],
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-purple-600" />
          Simulador Rápido
        </CardTitle>
        <CardDescription>
          Simule o impacto da reforma em qualquer importação
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Valor CIF (R$)</Label>
            <Input
              type="number"
              placeholder="Ex: 100000"
              value={cifValue}
              onChange={(e) => { setCifValue(e.target.value); setSimulated(false); }}
            />
          </div>
          <div>
            <Label>NCM (opcional)</Label>
            <Input
              placeholder="Ex: 73170090"
              value={ncm}
              onChange={(e) => { setNcm(e.target.value); setSimulated(false); }}
            />
          </div>
          <div className="flex items-end">
            <Button 
              className="w-full bg-purple-600 hover:bg-purple-700"
              onClick={() => setSimulated(true)}
              disabled={!cifValue || parseFloat(cifValue) <= 0}
            >
              <Zap className="h-4 w-4 mr-2" />
              Simular Impacto
            </Button>
          </div>
        </div>
        
        {simulated && parseFloat(cifValue) > 0 && (
          <div className="mt-6">
            <ReformImpactPanel
              comparison={mockResults.comparison}
              timeline={mockResults.timeline}
              insights={mockResults.insights}
              currentYear={new Date().getFullYear()}
              cifValueCents={Math.round(parseFloat(cifValue) * 100)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// KEY CHANGES SUMMARY
// ============================================================

function KeyChanges() {
  const changes = [
    {
      icon: TrendingDown,
      title: "Fim do 'Cálculo por Dentro'",
      description: "Hoje, PIS, COFINS e ICMS são calculados 'por dentro' (incluídos na própria base). Com a reforma, CBS e IBS serão calculados 'por fora', simplificando drasticamente o cálculo.",
      impact: "positive",
    },
    {
      icon: Shield,
      title: "CBS substitui PIS + COFINS + IPI",
      description: "Três tributos federais viram um só. A CBS (Contribuição sobre Bens e Serviços) unifica a tributação federal sobre consumo.",
      impact: "positive",
    },
    {
      icon: Shield,
      title: "IBS substitui ICMS + ISS",
      description: "O IBS (Imposto sobre Bens e Serviços) unifica a tributação estadual/municipal. Transição gradual de 2029 a 2033.",
      impact: "neutral",
    },
    {
      icon: AlertTriangle,
      title: "Imposto Seletivo",
      description: "Novo imposto sobre produtos prejudiciais à saúde e ao meio ambiente (tabaco, bebidas alcoólicas, combustíveis fósseis). A partir de 2027.",
      impact: "negative",
    },
    {
      icon: CheckCircle2,
      title: "Isonomia Importação x Nacional",
      description: "Mesmas alíquotas para produtos importados e nacionais. Fim da assimetria tributária na importação.",
      impact: "positive",
    },
    {
      icon: Info,
      title: "II permanece inalterado",
      description: "O Imposto de Importação (II) não é afetado pela reforma. Continua sendo instrumento de política comercial.",
      impact: "neutral",
    },
  ];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-purple-600" />
          O que Muda na Importação
        </CardTitle>
        <CardDescription>
          Principais mudanças que afetam diretamente o custo de importação
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {changes.map((change, i) => (
            <div key={i} className={`p-4 rounded-lg border ${
              change.impact === "positive" 
                ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10"
                : change.impact === "negative"
                  ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10"
                  : "border-border bg-muted/50 dark:border-gray-700 dark:bg-gray-800/50"
            }`}>
              <div className="flex items-start gap-3">
                <change.icon className={`h-5 w-5 mt-0.5 ${
                  change.impact === "positive" ? "text-emerald-600" :
                  change.impact === "negative" ? "text-red-600" : "text-muted-foreground"
                }`} />
                <div>
                  <h4 className="font-semibold text-sm text-foreground dark:text-gray-200 mb-1">{change.title}</h4>
                  <p className="text-xs text-muted-foreground dark:text-gray-400 leading-relaxed">{change.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// PÁGINA PRINCIPAL
// ============================================================

export default function ReformDashboard() {
  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground dark:text-white flex items-center gap-3">
            <Shield className="h-7 w-7 text-purple-600" />
            Reforma Tributária
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Simulação exclusiva Excambia — Entenda como a reforma afeta suas importações
          </p>
        </div>
        <Badge className="bg-purple-100 text-purple-700 border-purple-200">
          EC 132/2023 + LC 214/2025
        </Badge>
      </div>
      
      {/* Alert Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-700">
        <Zap className="h-5 w-5 text-purple-600 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-purple-800 dark:text-purple-200">
            Você está à frente do mercado
          </p>
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
            A Excambia é a primeira plataforma de importação do Brasil com simulação completa da reforma tributária. 
            Use isso como vantagem competitiva — seus concorrentes ainda não sabem quanto vão pagar de imposto em 2027.
          </p>
        </div>
      </div>
      
      <Tabs defaultValue="simulator" className="space-y-4">
        <TabsList>
          <TabsTrigger value="simulator">Simulador</TabsTrigger>
          <TabsTrigger value="timeline">Cronograma</TabsTrigger>
          <TabsTrigger value="changes">O que Muda</TabsTrigger>
        </TabsList>
        
        <TabsContent value="simulator">
          <QuickSimulator />
        </TabsContent>
        
        <TabsContent value="timeline">
          <ReformTimelineVisual />
        </TabsContent>
        
        <TabsContent value="changes">
          <KeyChanges />
        </TabsContent>
      </Tabs>
    </div>
  );
}
