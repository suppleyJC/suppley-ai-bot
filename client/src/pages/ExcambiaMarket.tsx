import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import CambioDoDia from "@/components/CambioDoDia";
import { MemoriaExcambiaPanel } from "@/pages/MemoriaExcambia";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Globe, Gauge,
  Lightbulb, AlertCircle, CheckCircle, BarChart3,
} from "lucide-react";

/**
 * Excambia — Inteligência de Mercado.
 *
 * Página construída SOBRE as fontes oficiais que funcionam de fato:
 *   - Câmbio do dia (BCB/PTAX)
 *   - market.intelligence (BCB câmbio + FRED commodities + IBGE inflação) →
 *     sinais, recomendações e a JANELA DE COMPRA (camada preditiva)
 *   - market.comex (Comex Stat / MDIC-SECEX) → estatística oficial por NCM
 *
 * (A antiga base Yahoo/Manus foi removida — dependência externa que não existe
 * no deploy independente e deixava a tela zerada.)
 */

function Variacao({ pct }: { pct: number }) {
  if (pct > 0.05) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
        <TrendingUp className="h-4 w-4" /> +{pct.toFixed(1)}%
      </span>
    );
  }
  if (pct < -0.05) {
    return (
      <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
        <TrendingDown className="h-4 w-4" /> {pct.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-sm font-medium">
      <Minus className="h-4 w-4" /> {pct.toFixed(1)}%
    </span>
  );
}

const brl = (n: number | null | undefined) =>
  n == null ? "n/d" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function ExcambiaMarket() {
  const [tab, setTab] = useState("geral");
  const { data: intel, isLoading, isFetching, refetch } =
    trpc.market.intelligence.useQuery(undefined, { refetchInterval: 10 * 60 * 1000 });

  // Comex Stat por NCM
  const [ncmInput, setNcmInput] = useState("");
  const [ncmQuery, setNcmQuery] = useState("");
  const { data: comex, isFetching: isFetchingComex } = trpc.market.comex.useQuery(
    { ncm: ncmQuery, fluxo: "import" },
    { enabled: ncmQuery.replace(/\D/g, "").length >= 6 },
  );

  const sinais = intel?.sinais ?? [];
  const insights = intel?.insights ?? [];
  const timing = intel?.timing;
  const emAlta = sinais.filter((s) => s.tendencia === "alta").length;
  const emBaixa = sinais.filter((s) => s.tendencia === "baixa").length;
  const temFred = sinais.some((s) => s.fonte === "FRED");

  const timingCor =
    timing?.recomendacao === "comprar" ? "text-green-600"
    : timing?.recomendacao === "aguardar" ? "text-amber-600"
    : "text-muted-foreground";
  const timingBorda =
    timing?.recomendacao === "comprar" ? "border-l-green-500"
    : timing?.recomendacao === "aguardar" ? "border-l-amber-500"
    : "border-l-slate-300";

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Inteligência de Mercado
          </h1>
          <p className="text-muted-foreground">
            Câmbio, commodities, inflação e estatística oficial de importação — para decidir quando e de onde importar.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Topo: câmbio + resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CambioDoDia />
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                <span className="text-sm text-muted-foreground">Janela de compra</span>
              </div>
              {isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <p className={`text-2xl font-bold mt-1 ${timingCor}`}>{timing?.score ?? "—"}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <span className="text-sm text-muted-foreground">Em alta</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-green-600">{emAlta}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                <span className="text-sm text-muted-foreground">Em baixa</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-red-600">{emBaixa}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                <span className="text-sm text-muted-foreground">Recomendações</span>
              </div>
              <p className="text-2xl font-bold mt-1">{insights.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="comex">Comex Stat</TabsTrigger>
          <TabsTrigger value="memoria">Memória da Excambia</TabsTrigger>
        </TabsList>

        {/* VISÃO GERAL — timing + sinais + recomendações */}
        <TabsContent value="geral" className="space-y-6 mt-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-40" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
              </div>
            </div>
          ) : (
            <>
              {timing && (
                <Card className={`border-l-4 ${timingBorda}`}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Janela de compra</p>
                        <h3 className="text-xl font-bold">{timing.titulo}</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{timing.texto}</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-4xl font-bold ${timingCor}`}>{timing.score}</div>
                        <p className="text-xs text-muted-foreground">favorabilidade /100</p>
                      </div>
                    </div>
                    <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                      {timing.fatores.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" /> Sinais oficiais
                </h3>
                {sinais.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem sinais no momento.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sinais.map((s) => (
                      <Card key={s.chave}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{s.chave}</p>
                              <p className="text-xs text-muted-foreground">{s.fonte}</p>
                            </div>
                            <Variacao pct={s.variacaoPct} />
                          </div>
                          <p className="mt-2 text-xl font-bold">
                            {s.atual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                            {s.unidade ? <span className="text-sm font-normal text-muted-foreground"> {s.unidade}</span> : null}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                {!temFred && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Dica: configure a chave FRED no servidor para incluir commodities globais (alumínio, ferro, cobre, petróleo).
                  </p>
                )}
              </div>

              {insights.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Recomendações</h3>
                  <div className="space-y-3">
                    {insights.map((i, idx) => {
                      const Icon = i.severidade === "oportunidade" ? CheckCircle
                        : i.severidade === "atencao" ? AlertCircle : Lightbulb;
                      const cor = i.severidade === "oportunidade" ? "text-green-500 border-l-green-500"
                        : i.severidade === "atencao" ? "text-amber-500 border-l-amber-500"
                        : "text-blue-400 border-l-blue-400";
                      return (
                        <Card key={idx} className={`border-l-4 ${cor.split(" ")[1]}`}>
                          <CardContent className="p-4 flex gap-3">
                            <Icon className={`h-5 w-5 shrink-0 ${cor.split(" ")[0]}`} />
                            <div>
                              <p className="font-medium text-sm">{i.titulo}</p>
                              <p className="text-sm text-muted-foreground mt-1">{i.texto}</p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* COMEX STAT — consulta oficial por NCM */}
        <TabsContent value="comex" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" /> Comex Stat (MDIC/SECEX)
              </CardTitle>
              <CardDescription>
                Estatística oficial de importação por NCM — valor, preço médio US$/kg e principais origens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={ncmInput}
                  onChange={(e) => setNcmInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setNcmQuery(ncmInput)}
                  placeholder="NCM (8 dígitos) — ex.: 7317.00.20"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Total FOB (12m)</p>
                      <p className="text-lg font-bold">US$ {comex.totalFobUsd.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Peso</p>
                      <p className="text-lg font-bold">{comex.totalKg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Preço médio</p>
                      <p className="text-lg font-bold">{comex.precoMedioUsdKg != null ? `US$ ${comex.precoMedioUsdKg.toFixed(2)}/kg` : "n/d"}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
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
                  Sem dados de importação para esse NCM nos últimos 12 meses.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Informe um NCM para consultar a base oficial.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MEMÓRIA DA EXCAMBIA — aprendizados persistentes */}
        <TabsContent value="memoria" className="mt-4">
          <MemoriaExcambiaPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
