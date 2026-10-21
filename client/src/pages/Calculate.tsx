import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  Calculator, 
  Package, 
  Ship, 
  DollarSign, 
  FileText, 
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Save,
  Loader2,
  Brain,
  Upload,
  FileUp,
  X,
} from "lucide-react";

const MERCOSUL_COUNTRIES = [
  { value: "Paraguai", label: "Paraguai" },
  { value: "Argentina", label: "Argentina" },
  { value: "Uruguai", label: "Uruguai" },
];

const OTHER_COUNTRIES = [
  { value: "China", label: "China" },
  { value: "Estados Unidos", label: "Estados Unidos" },
  { value: "Alemanha", label: "Alemanha" },
  { value: "Itália", label: "Itália" },
  { value: "Japão", label: "Japão" },
  { value: "Coreia do Sul", label: "Coreia do Sul" },
  { value: "Índia", label: "Índia" },
  { value: "México", label: "México" },
];

const BRAZILIAN_STATES = [
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "PR", label: "Paraná" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "BA", label: "Bahia" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "PE", label: "Pernambuco" },
];

function formatCurrency(value: number, currency: string = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

interface CalculationResult {
  exchangeRate: number;
  exchangeSource: string;
  fobBrl: number;
  freightBrl: number;
  insuranceBrl: number;
  cifBrl: number;
  taxes: {
    rates: { ii: number; ipi: number; pis: number; cofins: number; icms: number };
    values: { iiValueCents: number; ipiValueCents: number; pisValueCents: number; cofinsValueCents: number; icmsValueCents: number; totalTaxesCents: number };
  };
  customsBrokerBrl: number;
  storageBrl: number;
  otherCostsBrl: number;
  totalCostBrl: number;
  unitCostBrl: number;
  markupPercent: number;
  suggestedPriceBrl: number;
  suggestedUnitPriceBrl: number;
  grossProfitBrl: number;
  grossMarginPercent: number;
  isMercosul: boolean;
  calculationId?: number;
  summary: {
    costs: Array<{ label: string; value: number; percent: number }>;
    metrics: { totalCost: number; unitCost: number; suggestedPrice: number; grossProfit: number; grossMargin: number; taxBurden: number };
  };
}

interface ViabilityAnalysis {
  viabilityScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
  marketInsights: string;
}

function ResultsDisplay({ result, analysis, loadingAnalysis, onAnalyze }: { 
  result: CalculationResult; 
  analysis: ViabilityAnalysis | null;
  loadingAnalysis: boolean;
  onAnalyze: () => void;
}) {
  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadge = (score: number) => {
    if (score >= 70) return <Badge className="bg-green-100 text-green-800">Alta Viabilidade</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-100 text-yellow-800">Viabilidade Moderada</Badge>;
    return <Badge className="bg-red-100 text-red-800">Baixa Viabilidade</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Custo Total</div>
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">{formatCurrency(result.totalCostBrl)}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Unitário: {formatCurrency(result.unitCostBrl)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="text-sm text-green-600 dark:text-green-400 font-medium">Preço Sugerido</div>
            <div className="text-3xl font-bold text-green-900 dark:text-green-100">{formatCurrency(result.suggestedPriceBrl)}</div>
            <div className="text-sm text-green-600 dark:text-green-400 mt-1">
              Markup: {formatPercent(result.markupPercent / 100)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
          <CardContent className="pt-6">
            <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">Lucro Bruto</div>
            <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">{formatCurrency(result.grossProfitBrl)}</div>
            <div className="text-sm text-purple-600 dark:text-purple-400 mt-1">
              Margem: {formatPercent(result.grossMarginPercent)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mercosul Badge */}
      {result.isMercosul && (
        <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-green-800 dark:text-green-200 font-medium">
            Produto com origem Mercosul - Isenção de Imposto de Importação aplicada
          </span>
        </div>
      )}

      {/* Detailed Breakdown */}
      <Tabs defaultValue="costs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="costs">Composição de Custos</TabsTrigger>
          <TabsTrigger value="taxes">Impostos</TabsTrigger>
          <TabsTrigger value="analysis">Análise IA</TabsTrigger>
        </TabsList>

        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Composição do Custo Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.summary.costs.map((cost, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{cost.label}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{formatPercent(cost.percent)}</span>
                      <span className="font-medium w-28 text-right">{formatCurrency(cost.value)}</span>
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(result.totalCostBrl)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações do Câmbio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Taxa Utilizada</div>
                  <div className="font-semibold">R$ {result.exchangeRate.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Fonte</div>
                  <div className="font-semibold">{result.exchangeSource}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Valor CIF</div>
                  <div className="font-semibold">{formatCurrency(result.cifBrl)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="taxes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detalhamento de Impostos</CardTitle>
              <CardDescription>
                Carga tributária total: {formatPercent(result.summary.metrics.taxBurden)} sobre o CIF
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">II (Imposto de Importação)</span>
                      <div className="text-right">
                        <span className="font-medium">{formatCurrency(result.taxes.values.iiValueCents / 100)}</span>
                        <span className="text-sm text-muted-foreground ml-2">({formatPercent(result.taxes.rates.ii / 100)})</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IPI</span>
                      <div className="text-right">
                        <span className="font-medium">{formatCurrency(result.taxes.values.ipiValueCents / 100)}</span>
                        <span className="text-sm text-muted-foreground ml-2">({formatPercent(result.taxes.rates.ipi / 100)})</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PIS</span>
                      <div className="text-right">
                        <span className="font-medium">{formatCurrency(result.taxes.values.pisValueCents / 100)}</span>
                        <span className="text-sm text-muted-foreground ml-2">({formatPercent(result.taxes.rates.pis / 100)})</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">COFINS</span>
                      <div className="text-right">
                        <span className="font-medium">{formatCurrency(result.taxes.values.cofinsValueCents / 100)}</span>
                        <span className="text-sm text-muted-foreground ml-2">({formatPercent(result.taxes.rates.cofins / 100)})</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ICMS</span>
                      <div className="text-right">
                        <span className="font-medium">{formatCurrency(result.taxes.values.icmsValueCents / 100)}</span>
                        <span className="text-sm text-muted-foreground ml-2">({formatPercent(result.taxes.rates.icms / 100)})</span>
                      </div>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total de Impostos</span>
                  <span>{formatCurrency(result.taxes.values.totalTaxesCents / 100)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {!analysis && !loadingAnalysis && (
            <Card>
              <CardContent className="py-8 text-center">
                <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Análise de Viabilidade com IA</h3>
                <p className="text-muted-foreground mb-4">
                  Obtenha uma análise detalhada da viabilidade desta importação, incluindo pontos fortes, riscos e recomendações.
                </p>
                <Button onClick={onAnalyze} className="gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Gerar Análise
                </Button>
              </CardContent>
            </Card>
          )}

          {loadingAnalysis && (
            <Card>
              <CardContent className="py-8 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">Analisando viabilidade...</p>
              </CardContent>
            </Card>
          )}

          {analysis && (
            <div className="space-y-4">
              {/* Score Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Score de Viabilidade</h3>
                      <p className="text-muted-foreground text-sm">{analysis.summary}</p>
                    </div>
                    {getScoreBadge(analysis.viabilityScore)}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Pontuação</span>
                      <span className={`font-bold ${getScoreColor(analysis.viabilityScore)}`}>
                        {analysis.viabilityScore}/100
                      </span>
                    </div>
                    <Progress value={analysis.viabilityScore} className="h-3" />
                  </div>
                </CardContent>
              </Card>

              {/* Analysis Details */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Pontos Fortes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.strengths.map((s, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-green-500 mt-1">•</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-yellow-600">
                      <AlertTriangle className="h-4 w-4" />
                      Pontos de Atenção
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.weaknesses.map((w, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-yellow-500 mt-1">•</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      Riscos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.risks.map((r, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-red-500 mt-1">•</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-blue-600">
                      <TrendingUp className="h-4 w-4" />
                      Oportunidades
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.opportunities.map((o, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Recomendações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-amber-500 mt-1">{i + 1}.</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Market Insights */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Insights de Mercado</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{analysis.marketInsights}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Calculate() {
  const [formData, setFormData] = useState({
    productName: "",
    ncmCode: "",
    quantity: 1,
    unit: "UN",
    originCountry: "",
    destinationState: "SC",
    fobValue: 0,
    fobCurrency: "USD",
    freight: 0,
    insurance: 0,
    customsBrokerBrl: 1500,
    storageBrl: 500,
    otherCostsBrl: 0,
    markupPercent: 3000,
  });

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [analysis, setAnalysis] = useState<ViabilityAnalysis | null>(null);
  
  // Quotation file state
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: currencies } = trpc.exchange.getSupportedCurrencies.useQuery();
  
  const calculateMutation = trpc.calculations.calculate.useMutation({
    onSuccess: (data) => {
      setResult(data as CalculationResult);
      setAnalysis(null);
      toast.success("Cálculo realizado com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro no cálculo: ${error.message}`);
    },
  });

  const analyzeMutation = trpc.calculations.analyze.useMutation({
    onSuccess: (data) => {
      setAnalysis(data);
      toast.success("Análise gerada com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro na análise: ${error.message}`);
    },
  });
  
  const uploadQuotationMutation = trpc.calculations.uploadQuotation.useMutation({
    onSuccess: (data) => {
      toast.success("Cotação anexada com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro ao anexar cotação: ${error.message}`);
    },
  });
  
  const updateQuotationFileMutation = trpc.calculations.updateQuotationFile.useMutation();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Apenas arquivos PDF são permitidos");
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error("Arquivo muito grande. Máximo: 10MB");
        return;
      }
      setQuotationFile(file);
    }
  };
  
  const removeFile = () => {
    setQuotationFile(null);
  };

  const handleSubmit = async (e: React.FormEvent, save: boolean = false) => {
    e.preventDefault();
    
    if (!formData.productName || !formData.ncmCode || !formData.originCountry || formData.fobValue <= 0) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // If there's a file and we're saving, upload it first
    let uploadedFile: { fileUrl: string; fileKey: string; fileName: string } | null = null;
    
    if (quotationFile && save) {
      setUploadingFile(true);
      try {
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(quotationFile);
        });
        
        uploadedFile = await uploadQuotationMutation.mutateAsync({
          fileName: quotationFile.name,
          fileData,
          contentType: "application/pdf",
        });
      } catch (error) {
        setUploadingFile(false);
        return;
      }
      setUploadingFile(false);
    }

    calculateMutation.mutate({
      ...formData,
      save,
    }, {
      onSuccess: async (data) => {
        // If we uploaded a file and saved the calculation, link them
        if (uploadedFile && data.calculationId) {
          await updateQuotationFileMutation.mutateAsync({
            calculationId: data.calculationId,
            fileUrl: uploadedFile.fileUrl,
            fileKey: uploadedFile.fileKey,
            fileName: uploadedFile.fileName,
          });
        }
      },
    });
  };

  const handleAnalyze = () => {
    if (!result) return;
    
    analyzeMutation.mutate({
      calculationId: result.calculationId,
      productName: formData.productName,
      ncmCode: formData.ncmCode,
      originCountry: formData.originCountry,
      quantity: formData.quantity,
      calculationResult: {
        fobBrl: result.fobBrl,
        cifBrl: result.cifBrl,
        totalCostBrl: result.totalCostBrl,
        unitCostBrl: result.unitCostBrl,
        suggestedPriceBrl: result.suggestedPriceBrl,
        grossProfitBrl: result.grossProfitBrl,
        grossMarginPercent: result.grossMarginPercent,
        isMercosul: result.isMercosul,
        taxes: result.taxes,
      },
    });
  };

  const updateField = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Calculadora de Importação</h1>
        <p className="text-muted-foreground">
          Calcule o custo total e a viabilidade de importar produtos para o Brasil
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-6">
          <form onSubmit={(e) => handleSubmit(e, false)}>
            {/* Product Info */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Informações do Produto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="productName">Nome do Produto *</Label>
                    <Input
                      id="productName"
                      placeholder="Ex: Pregos de Aço"
                      value={formData.productName}
                      onChange={(e) => updateField("productName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ncmCode">Código NCM *</Label>
                    <Input
                      id="ncmCode"
                      placeholder="Ex: 73170010"
                      value={formData.ncmCode}
                      onChange={(e) => updateField("ncmCode", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantidade *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => updateField("quantity", parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unidade</Label>
                    <Select value={formData.unit} onValueChange={(v) => updateField("unit", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UN">Unidade (UN)</SelectItem>
                        <SelectItem value="KG">Quilograma (KG)</SelectItem>
                        <SelectItem value="TON">Tonelada (TON)</SelectItem>
                        <SelectItem value="CX">Caixa (CX)</SelectItem>
                        <SelectItem value="PC">Peça (PC)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Origin & Destination */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Ship className="h-5 w-5" />
                  Origem e Destino
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="originCountry">País de Origem *</Label>
                    <Select value={formData.originCountry} onValueChange={(v) => updateField("originCountry", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o país" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">Mercosul</div>
                        {MERCOSUL_COUNTRIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                        <Separator className="my-1" />
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">Outros</div>
                        {OTHER_COUNTRIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destinationState">Estado de Destino</Label>
                    <Select value={formData.destinationState} onValueChange={(v) => updateField("destinationState", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BRAZILIAN_STATES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Values */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Valores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="fobValue">Valor FOB *</Label>
                    <Input
                      id="fobValue"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.fobValue}
                      onChange={(e) => updateField("fobValue", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fobCurrency">Moeda</Label>
                    <Select value={formData.fobCurrency} onValueChange={(v) => updateField("fobCurrency", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies?.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="freight">Frete Internacional</Label>
                    <Input
                      id="freight"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.freight}
                      onChange={(e) => updateField("freight", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insurance">Seguro</Label>
                    <Input
                      id="insurance"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.insurance}
                      onChange={(e) => updateField("insurance", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional Costs */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Custos Adicionais (R$)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="customsBroker">Despachante</Label>
                    <Input
                      id="customsBroker"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.customsBrokerBrl}
                      onChange={(e) => updateField("customsBrokerBrl", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storage">Armazenagem</Label>
                    <Input
                      id="storage"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.storageBrl}
                      onChange={(e) => updateField("storageBrl", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="otherCosts">Outros</Label>
                    <Input
                      id="otherCosts"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.otherCostsBrl}
                      onChange={(e) => updateField("otherCostsBrl", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Markup */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Precificação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="markup">Markup Desejado (%)</Label>
                  <Input
                    id="markup"
                    type="number"
                    step="1"
                    min="0"
                    value={formData.markupPercent / 100}
                    onChange={(e) => updateField("markupPercent", (parseFloat(e.target.value) || 0) * 100)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Margem de lucro sobre o custo total
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quotation File Upload */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileUp className="h-5 w-5" />
                  Cotação do Fornecedor
                </CardTitle>
                <CardDescription>
                  Anexe o PDF da cotação para referência e análise
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!quotationFile ? (
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                    <input
                      type="file"
                      id="quotationFile"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="quotationFile" className="cursor-pointer">
                      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium">Clique para selecionar um arquivo PDF</p>
                      <p className="text-xs text-muted-foreground mt-1">Máximo: 10MB</p>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{quotationFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(quotationFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={removeFile}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {quotationFile && (
                  <p className="text-xs text-muted-foreground mt-2">
                    O arquivo será anexado ao salvar o cálculo
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button 
                type="submit" 
                size="lg" 
                className="flex-1 gap-2"
                disabled={calculateMutation.isPending || uploadingFile}
              >
                {calculateMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Calculator className="h-5 w-5" />
                )}
                Calcular
              </Button>
              <Button 
                type="button"
                variant="outline"
                size="lg"
                className="gap-2"
                disabled={calculateMutation.isPending || uploadingFile}
                onClick={(e) => handleSubmit(e, true)}
              >
                {uploadingFile ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                {uploadingFile ? "Enviando..." : quotationFile ? "Salvar com Cotação" : "Calcular e Salvar"}
              </Button>
            </div>
          </form>
        </div>

        {/* Results */}
        <div>
          {!result && !calculateMutation.isPending && (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center">
                <Calculator className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Preencha o formulário</h3>
                <p className="text-muted-foreground">
                  Os resultados do cálculo aparecerão aqui
                </p>
              </CardContent>
            </Card>
          )}

          {calculateMutation.isPending && (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center">
                <Loader2 className="h-16 w-16 mx-auto mb-4 animate-spin text-primary" />
                <h3 className="text-lg font-semibold mb-2">Calculando...</h3>
                <p className="text-muted-foreground">
                  Buscando câmbio e calculando impostos
                </p>
              </CardContent>
            </Card>
          )}

          {result && !calculateMutation.isPending && (
            <ResultsDisplay 
              result={result} 
              analysis={analysis}
              loadingAnalysis={analyzeMutation.isPending}
              onAnalyze={handleAnalyze}
            />
          )}
        </div>
      </div>
    </div>
  );
}
