import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import CambioDoDia from "@/components/CambioDoDia";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Sparkles,
  BarChart3,
  Globe,
  DollarSign,
  Fuel,
  Factory,
  Wheat,
  Ship,
  AlertCircle,
  CheckCircle,
  Clock,
  Lightbulb,
} from "lucide-react";

interface MarketQuote {
  symbol: string;
  name: string;
  category: string;
  price: number;
  change: number;
  changePercent: number;
  high?: number;
  low?: number;
  volume?: number;
  unit?: string;
  timestamp: number;
}

interface MarketInsight {
  content: string;
  date: string;
  createdAt: Date;
}

const categoryIcons: Record<string, React.ReactNode> = {
  commodity: <Factory className="h-4 w-4" />,
  index: <BarChart3 className="h-4 w-4" />,
  currency: <DollarSign className="h-4 w-4" />,
  energy: <Fuel className="h-4 w-4" />,
  agriculture: <Wheat className="h-4 w-4" />,
  freight: <Ship className="h-4 w-4" />,
};

const categoryLabels: Record<string, string> = {
  commodity: "Commodities",
  index: "Índices",
  currency: "Câmbio",
  energy: "Energia",
  agriculture: "Agrícolas",
  freight: "Frete",
};

function PriceChange({ change, changePercent }: { change: number; changePercent: number }) {
  if (changePercent > 0) {
    return (
      <div className="flex items-center gap-1 text-green-600">
        <TrendingUp className="h-4 w-4" />
        <span className="text-sm font-medium">+{changePercent.toFixed(2)}%</span>
      </div>
    );
  } else if (changePercent < 0) {
    return (
      <div className="flex items-center gap-1 text-red-600">
        <TrendingDown className="h-4 w-4" />
        <span className="text-sm font-medium">{changePercent.toFixed(2)}%</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" />
      <span className="text-sm font-medium">0.00%</span>
    </div>
  );
}

function MarketCard({ quote }: { quote: MarketQuote }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {categoryIcons[quote.category] || <Globe className="h-4 w-4" />}
            <div>
              <p className="font-medium text-sm">{quote.name}</p>
              <p className="text-xs text-muted-foreground">{quote.symbol}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {categoryLabels[quote.category] || quote.category}
          </Badge>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold">
              {quote.unit === "USD" ? "$" : ""}
              {quote.price.toLocaleString("pt-BR", { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
              {quote.unit && quote.unit !== "USD" ? ` ${quote.unit}` : ""}
            </p>
            {quote.high && quote.low && (
              <p className="text-xs text-muted-foreground mt-1">
                Máx: {quote.high.toFixed(2)} | Mín: {quote.low.toFixed(2)}
              </p>
            )}
          </div>
          <PriceChange change={quote.change} changePercent={quote.changePercent} />
        </div>
      </CardContent>
    </Card>
  );
}

function InsightCard({ insight }: { insight: MarketInsight }) {
  const getInsightIcon = (content: string) => {
    if (content.includes("oportunidade") || content.includes("favorável")) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (content.includes("atenção") || content.includes("risco") || content.includes("alta")) {
      return <AlertCircle className="h-5 w-5 text-amber-500" />;
    }
    return <Lightbulb className="h-5 w-5 text-blue-500" />;
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {getInsightIcon(insight.content)}
          <div className="flex-1">
            <p className="text-sm">{insight.content}</p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(insight.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExcambiaMarket() {
  const [activeTab, setActiveTab] = useState("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Fetch market data
  const { data: marketData, isLoading: isLoadingMarket, refetch: refetchMarket } = 
    trpc.marketData.getIndicators.useQuery(undefined, {
      refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    });

  // Fetch insights
  const { data: insights, isLoading: isLoadingInsights, refetch: refetchInsights } =
    trpc.marketData.getInsights.useQuery({ days: 7 });

  // Inteligência de decisão (sinais oficiais + janela de compra preditiva)
  const { data: intel, isLoading: isLoadingIntel } = trpc.market.intelligence.useQuery(undefined, {
    refetchInterval: 10 * 60 * 1000,
  });

  // Consulta Comex Stat por NCM (benchmark oficial)
  const [ncmInput, setNcmInput] = useState("");
  const [ncmQuery, setNcmQuery] = useState("");
  const { data: comex, isFetching: isFetchingComex } = trpc.market.comex.useQuery(
    { ncm: ncmQuery, fluxo: "import" },
    { enabled: ncmQuery.replace(/\D/g, "").length >= 6 },
  );

  // Mutations
  const refreshMutation = trpc.marketData.refresh.useMutation({
    onSuccess: () => {
      toast.success("Dados de mercado atualizados com sucesso!");
      refetchMarket();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar dados");
    },
  });

  const generateInsightsMutation = trpc.marketData.generateInsights.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.insights.length} novos insights gerados pela Excambia!`);
      refetchInsights();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao gerar insights");
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshMutation.mutateAsync();
    setIsRefreshing(false);
  };

  const handleGenerateInsights = async () => {
    setIsGeneratingInsights(true);
    await generateInsightsMutation.mutateAsync();
    setIsGeneratingInsights(false);
  };

  // Group market data by category
  const groupedData = marketData?.reduce((acc, quote) => {
    if (!acc[quote.category]) {
      acc[quote.category] = [];
    }
    acc[quote.category].push(quote);
    return acc;
  }, {} as Record<string, MarketQuote[]>) || {};

  // Calculate summary stats
  const summaryStats = {
    total: marketData?.length || 0,
    positive: marketData?.filter((q: MarketQuote) => q.changePercent > 0).length || 0,
    negative: marketData?.filter((q: MarketQuote) => q.changePercent < 0).length || 0,
    neutral: marketData?.filter((q: MarketQuote) => q.changePercent === 0).length || 0,
  };

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Excambia - Mercado
          </h1>
          <p className="text-muted-foreground">
            Indicadores de mercado e insights estratégicos para importação
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Atualizar Dados
          </Button>
          <Button
            onClick={handleGenerateInsights}
            disabled={isGeneratingInsights}
          >
            <Sparkles className={`h-4 w-4 mr-2 ${isGeneratingInsights ? "animate-pulse" : ""}`} />
            Gerar Insights
          </Button>
        </div>
      </div>

      {/* Câmbio do dia — camada transversal (COMANDO 8): sempre visível, fora do fluxo de etapas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CambioDoDia />
        {/* Summary Cards (ocupam as 2 colunas restantes no desktop) */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{summaryStats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Em Alta</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{summaryStats.positive}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <span className="text-sm text-muted-foreground">Em Baixa</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{summaryStats.negative}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <span className="text-sm text-muted-foreground">Insights</span>
            </div>
            <p className="text-2xl font-bold mt-1">{insights?.length || 0}</p>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="decisao">Decisão</TabsTrigger>
          <TabsTrigger value="comex">Comex Stat</TabsTrigger>
          <TabsTrigger value="commodities">Commodities</TabsTrigger>
          <TabsTrigger value="indices">Índices</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {isLoadingMarket ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <>
              {Object.entries(groupedData).map(([category, quotes]) => (
                <div key={category}>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    {categoryIcons[category]}
                    {categoryLabels[category] || category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {quotes.map((quote) => (
                      <MarketCard key={quote.symbol} quote={quote} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="decisao" className="space-y-6 mt-4">
          {isLoadingIntel ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : intel ? (
            <>
              {/* Janela de compra (preditiva) */}
              <Card className={
                intel.timing.recomendacao === "comprar" ? "border-l-4 border-l-green-500"
                : intel.timing.recomendacao === "aguardar" ? "border-l-4 border-l-amber-500"
                : "border-l-4 border-l-slate-300"
              }>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Janela de compra</p>
                      <h3 className="text-xl font-bold">{intel.timing.titulo}</h3>
                      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{intel.timing.texto}</p>
                    </div>
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${
                        intel.timing.recomendacao === "comprar" ? "text-green-600"
                        : intel.timing.recomendacao === "aguardar" ? "text-amber-600"
                        : "text-slate-500"
                      }`}>{intel.timing.score}</div>
                      <p className="text-xs text-muted-foreground">favorabilidade /100</p>
                    </div>
                  </div>
                  <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                    {intel.timing.fatores.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Sinais oficiais */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Sinais oficiais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {intel.sinais.map((s) => (
                    <Card key={s.chave}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{s.chave}</p>
                            <p className="text-xs text-muted-foreground">{s.fonte}</p>
                          </div>
                          <PriceChange change={s.variacaoPct} changePercent={s.variacaoPct} />
                        </div>
                        <p className="mt-2 text-xl font-bold">
                          {s.atual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                          {s.unidade ? <span className="text-sm font-normal text-muted-foreground"> {s.unidade}</span> : null}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Insights de decisão */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Recomendações</h3>
                <div className="space-y-3">
                  {intel.insights.map((i, idx) => (
                    <Card key={idx} className={`border-l-4 ${
                      i.severidade === "oportunidade" ? "border-l-green-500"
                      : i.severidade === "atencao" ? "border-l-amber-500"
                      : "border-l-blue-400"
                    }`}>
                      <CardContent className="p-4">
                        <p className="font-medium text-sm">{i.titulo}</p>
                        <p className="text-sm text-muted-foreground mt-1">{i.texto}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Inteligência de mercado indisponível no momento.</p>
          )}
        </TabsContent>

        <TabsContent value="comex" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" /> Comex Stat (MDIC/SECEX)
              </CardTitle>
              <CardDescription>
                Estatísticas oficiais de importação por NCM — valor, preço médio US$/kg e origens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={ncmInput}
                  onChange={(e) => setNcmInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setNcmQuery(ncmInput)}
                  placeholder="NCM (8 dígitos) — ex.: 7317.00.20"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <Button onClick={() => setNcmQuery(ncmInput)} disabled={ncmInput.replace(/\D/g, "").length < 6}>
                  Consultar
                </Button>
              </div>

              {isFetchingComex ? (
                <Skeleton className="h-40" />
              ) : comex && comex.disponivel ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Total FOB (12m)</p>
                      <p className="text-lg font-bold">US$ {comex.totalFobUsd.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Peso</p>
                      <p className="text-lg font-bold">{comex.totalKg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Preço médio</p>
                      <p className="text-lg font-bold">{comex.precoMedioUsdKg != null ? `US$ ${comex.precoMedioUsdKg.toFixed(2)}/kg` : "n/d"}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Tendência</p>
                      <p className="text-lg font-bold capitalize">{comex.tendenciaPreco}</p>
                    </div>
                  </div>
                  {comex.topOrigens.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Principais origens</p>
                      <div className="space-y-1.5">
                        {comex.topOrigens.map((o) => (
                          <div key={o.pais} className="flex items-center justify-between text-sm">
                            <span>{o.pais}</span>
                            <span className="text-muted-foreground">
                              US$ {o.fobUsd.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                              {o.precoMedioUsdKg != null ? ` · ${o.precoMedioUsdKg.toFixed(2)}/kg` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : comex ? (
                <p className="text-sm text-muted-foreground">
                  Sem dados de importação para esse NCM nos últimos 12 meses (ou fonte indisponível).
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Informe um NCM para consultar a base oficial.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commodities" className="mt-4">
          {isLoadingMarket ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketData
                ?.filter((q: MarketQuote) => q.category === "commodity" || q.category === "energy" || q.category === "agricultural" || q.category === "metal")                .map((quote) => (
                  <MarketCard key={quote.symbol} quote={quote} />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="indices" className="mt-4">
          {isLoadingMarket ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketData
                ?.filter((q: MarketQuote) => q.category === "index")
                .map((quote) => (
                  <MarketCard key={quote.symbol} quote={quote} />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Insights Estratégicos
              </CardTitle>
              <CardDescription>
                Análises geradas pela Excambia com base nos dados de mercado
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingInsights ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : insights && insights.length > 0 ? (
                <div className="space-y-4">
                  {insights.map((insight, index) => (
                    <InsightCard key={index} insight={insight} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Lightbulb className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Nenhum insight gerado ainda. Clique em "Gerar Insights" para que a Excambia analise os dados de mercado.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Gerar Insights Agora
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Last Update */}
      {marketData && marketData.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Última atualização: {new Date(marketData[0].timestamp).toLocaleString("pt-BR")}
        </p>
      )}
    </div>
  );
}
