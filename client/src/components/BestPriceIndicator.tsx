import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trophy, TrendingDown, TrendingUp, Info, Loader2 } from "lucide-react";

interface BestPriceIndicatorProps {
  productName: string;
  currentPriceBrlCents: number;
  currentSupplierName?: string;
  showDetails?: boolean;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function BestPriceIndicator({
  productName,
  currentPriceBrlCents,
  showDetails = true,
}: BestPriceIndicatorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const { data: bestPriceData, isLoading } = trpc.priceComparison.getBestPrice.useQuery(
    { productName },
    { enabled: !!productName && productName.length > 2 }
  );
  
  const { data: comparisonData } = trpc.priceComparison.compareProduct.useQuery(
    { productName },
    { enabled: dialogOpen && !!productName }
  );
  
  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
  
  if (!bestPriceData?.hasBestPrice) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs gap-1 cursor-help">
              <Info className="h-3 w-3" />
              Primeiro preço
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Este é o primeiro preço registrado para este produto.</p>
            <p className="text-muted-foreground text-xs mt-1">
              Adicione mais cotações para comparar preços.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  const { bestPrice, alternatives } = bestPriceData;
  const isBestPrice = currentPriceBrlCents <= (bestPrice?.priceBrlCents || 0);
  const priceDifference = bestPrice ? currentPriceBrlCents - bestPrice.priceBrlCents : 0;
  const differencePercent = bestPrice && bestPrice.priceBrlCents > 0
    ? ((priceDifference / bestPrice.priceBrlCents) * 100).toFixed(1)
    : "0";
  
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Badge 
                variant={isBestPrice ? "default" : "secondary"}
                className={`text-xs gap-1 cursor-pointer transition-colors ${
                  isBestPrice 
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >
                {isBestPrice ? (
                  <>
                    <Trophy className="h-3 w-3" />
                    Melhor Preço
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-3 w-3" />
                    +{differencePercent}%
                  </>
                )}
              </Badge>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {isBestPrice ? (
              <p>Este é o melhor preço entre {bestPrice?.totalSuppliers || 1} fornecedor(es)</p>
            ) : (
              <div>
                <p>Melhor preço: {formatCurrency(bestPrice?.priceBrlCents || 0)}</p>
                <p className="text-muted-foreground text-xs">
                  Fornecedor: {bestPrice?.supplierName}
                </p>
                <p className="text-amber-600 text-xs mt-1">
                  Economia potencial: {formatCurrency(priceDifference)}
                </p>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Comparativo de Preços
          </DialogTitle>
          <DialogDescription>
            Comparação de preços para "{productName}" entre fornecedores
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Estatísticas */}
          {comparisonData && (
            <div className="grid grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950">
                <p className="text-xs text-muted-foreground">Menor Preço</p>
                <p className="font-semibold text-emerald-600">
                  {formatCurrency(comparisonData.statistics.minPrice)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Preço Médio</p>
                <p className="font-semibold">
                  {formatCurrency(comparisonData.statistics.avgPrice)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950">
                <p className="text-xs text-muted-foreground">Maior Preço</p>
                <p className="font-semibold text-red-600">
                  {formatCurrency(comparisonData.statistics.maxPrice)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <p className="text-xs text-muted-foreground">Fornecedores</p>
                <p className="font-semibold text-primary">
                  {comparisonData.statistics.totalSuppliers}
                </p>
              </div>
            </div>
          )}
          
          {/* Lista de fornecedores */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 text-sm font-medium">#</th>
                  <th className="text-left p-3 text-sm font-medium">Fornecedor</th>
                  <th className="text-left p-3 text-sm font-medium">País</th>
                  <th className="text-right p-3 text-sm font-medium">Preço (BRL)</th>
                  <th className="text-right p-3 text-sm font-medium">Diferença</th>
                  <th className="text-left p-3 text-sm font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData?.suppliers.map((supplier) => (
                  <tr 
                    key={supplier.supplierId}
                    className={`border-t ${supplier.isBestPrice ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}
                  >
                    <td className="p-3">
                      {supplier.isBestPrice ? (
                        <Trophy className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <span className="text-muted-foreground">{supplier.rank}</span>
                      )}
                    </td>
                    <td className="p-3 font-medium">{supplier.supplierName}</td>
                    <td className="p-3 text-muted-foreground">{supplier.country}</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(supplier.latestPriceBrlCents)}
                    </td>
                    <td className="p-3 text-right">
                      {supplier.isBestPrice ? (
                        <Badge className="bg-emerald-500 text-white">Melhor</Badge>
                      ) : (
                        <span className="text-amber-600">+{supplier.differenceFromBest}%</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-sm">
                      {new Date(supplier.quotationDate).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Economia potencial */}
          {comparisonData && comparisonData.statistics.priceRange > 0 && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-emerald-600" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Economia Potencial
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Ao escolher o fornecedor com melhor preço, você pode economizar até{" "}
                <span className="font-semibold text-emerald-600">
                  {formatCurrency(comparisonData.statistics.priceRange)}
                </span>{" "}
                por unidade em comparação com o preço mais alto.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BestPriceIndicator;
