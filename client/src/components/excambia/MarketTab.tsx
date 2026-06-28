import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, TrendingUp, BarChart3, DollarSign } from "lucide-react";
import { MessageContent } from "@/components/MessageContent";

interface MarketTabProps {
  loadingMarket: boolean;
  marketAnalysis: any;
  exchangeRates: {
    USD?: number;
    EUR?: number;
    CNY?: number;
  };
}

export function MarketTab({ loadingMarket, marketAnalysis, exchangeRates }: MarketTabProps) {
  return (
    <TabsContent value="market" className="flex-1 overflow-auto m-0 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <h2 className="text-xl font-bold">Análise de Mercado</h2>

        {loadingMarket ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : marketAnalysis ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  Câmbio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <span className="font-medium">USD/BRL</span>
                    <span className="text-xl font-bold text-blue-600">
                      R$ {exchangeRates?.USD?.toFixed(4) || "..."}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <span className="font-medium">EUR/BRL</span>
                    <span className="text-xl font-bold text-blue-600">
                      R$ {exchangeRates?.EUR?.toFixed(4) || "..."}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <span className="font-medium">CNY/BRL</span>
                    <span className="text-xl font-bold text-blue-600">
                      R$ {exchangeRates?.CNY?.toFixed(4) || "..."}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Tendências
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-none break-words">
                  <MessageContent>{typeof marketAnalysis === 'string' ? marketAnalysis : (marketAnalysis as any)?.analysis || "Análise de mercado não disponível."}</MessageContent>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Análise de Mercado</h3>
              <p className="text-sm text-muted-foreground text-center">
                Dados de mercado serão exibidos aqui.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TabsContent>
  );
}
