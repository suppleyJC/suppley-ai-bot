import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { CalculationResults, formatCurrency } from "./types";

interface ResultsSidebarProps {
  results: CalculationResults | null;
  isCalculating: boolean;
  isGeneratingReport: boolean;
  onDownloadReport: () => void;
}

export function ResultsSidebar({ results, isCalculating, isGeneratingReport, onDownloadReport }: ResultsSidebarProps) {
  if (!results && !isCalculating) {
    return (
      <Card className="flex items-center justify-center min-h-[300px] sticky top-20">
        <CardContent className="text-center">
          <Calculator className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">Preencha a cotação</h3>
          <p className="text-muted-foreground">
            Após calcular, você poderá baixar o relatório Excel completo
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!results || isCalculating) {
    return null;
  }

  return (
    <Card className="sticky top-20 border-2 border-green-500/30 bg-gradient-to-br from-white to-green-50 dark:from-gray-900 dark:to-green-950 shadow-lg">
      <CardContent className="p-4 lg:p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-green-200 dark:border-green-800">
          <div className="p-2 bg-green-500 rounded-full">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-green-800 dark:text-green-200">Cálculo Concluído</h3>
            <p className="text-xs text-muted-foreground">{results.totals.productCount} produto(s)</p>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Custo Total</span>
            <span className="font-semibold">{formatCurrency(results.totals.totalCostBrl)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Preço Sugerido</span>
            <span className="font-semibold text-green-600">{formatCurrency(results.totals.totalSuggestedPriceBrl)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Lucro Bruto</span>
            <span className="font-semibold text-purple-600">{formatCurrency(results.totals.totalGrossProfitBrl)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Total Impostos</span>
            <span className="font-semibold text-orange-600">{formatCurrency(results.totals.totalTaxesBrl)}</span>
          </div>
        </div>

        {/* Download Button */}
        <Button
          className="w-full gap-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
          onClick={onDownloadReport}
          disabled={isGeneratingReport}
        >
          {isGeneratingReport ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
          ) : (
            <><FileText className="h-4 w-4" /> Baixar Excel</>
          )}
        </Button>

        {/* Mercosul Badge */}
        {results.results[0]?.calculation.isMercosul && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-xs">Mercosul - II isento</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
