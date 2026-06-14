import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";
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
  Loader2,
  Upload,
  FileUp,
  X,
  Plus,
  Trash2,
  AlertCircle,
  FileSearch,
  Sparkles,
  Wand2,
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

const UNITS = [
  { value: "UN", label: "UN" },
  { value: "KG", label: "KG" },
  { value: "TON", label: "TON" },
  { value: "CX", label: "CX" },
  { value: "PC", label: "PC" },
];

function formatCurrency(value: number, currency: string = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(value);
}



// Port Selector Component
function PortSelector({ 
  stateCode, 
  selectedPort, 
  onPortChange, 
  freight,
  onAfrmmChange 
}: { 
  stateCode: string; 
  selectedPort: string; 
  onPortChange: (portCode: string, portCosts?: { thc: number; storage: number; liberation: number }) => void;
  freight: number;
  onAfrmmChange: (afrmm: number) => void;
}) {
  const { data: ports } = trpc.ports.getPortsByState.useQuery(
    { stateCode },
    { enabled: !!stateCode }
  );
  const { data: allPorts } = trpc.ports.getAllPorts.useQuery();
  const { data: fixedCosts } = trpc.ports.getFixedCosts.useQuery();

  const availablePorts = ports && ports.length > 0 ? ports : allPorts?.filter(p => p.stateCode === stateCode) || [];
  const hasPortsInState = availablePorts.length > 0;

  // Calculate AFRMM when freight changes - use ref to prevent infinite loop
  const prevFreightRef = useRef<number | null>(null);
  useEffect(() => {
    if (fixedCosts && freight !== prevFreightRef.current) {
      prevFreightRef.current = freight;
      const afrmm = freight * fixedCosts.afrmmRate;
      onAfrmmChange(afrmm);
    }
  }, [freight, fixedCosts]); // Removed onAfrmmChange from deps to prevent loop

  const handlePortChange = (portCode: string) => {
    const port = availablePorts.find(p => p.code === portCode);
    if (port) {
      onPortChange(portCode, {
        thc: port.thcCost,
        storage: port.storageCostPercent * 100, // Estimate based on 10k CIF
        liberation: port.liberationCost,
      });
    } else {
      onPortChange(portCode);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 mt-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Ship className="h-4 w-4" />
          Porto de Destino
        </Label>
        {hasPortsInState ? (
          <Select value={selectedPort} onValueChange={handlePortChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o porto" />
            </SelectTrigger>
            <SelectContent>
              {availablePorts.map((port) => (
                <SelectItem key={port.code} value={port.code}>
                  {port.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
            Nenhum porto marítimo disponível para este estado. Os custos serão estimados.
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Custos Portuários Estimados</Label>
        <div className="text-sm space-y-1 p-2 bg-muted/50 rounded-md">
          <div className="flex justify-between">
            <span>THC (Terminal Handling):</span>
            <span className="font-medium">{formatCurrency(selectedPort ? (availablePorts.find(p => p.code === selectedPort)?.thcCost || 1200) : 1200)}</span>
          </div>
          <div className="flex justify-between">
            <span>Liberação:</span>
            <span className="font-medium">{formatCurrency(selectedPort ? (availablePorts.find(p => p.code === selectedPort)?.liberationCost || 400) : 400)}</span>
          </div>
          <div className="flex justify-between">
            <span>AFRMM (25% do frete):</span>
            <span className="font-medium">{formatCurrency(freight * 0.25)}</span>
          </div>
          <div className="flex justify-between">
            <span>Siscomex:</span>
            <span className="font-medium">{formatCurrency(fixedCosts?.siscomexBase || 214.50)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProductItem {
  id: string;
  productName: string;
  sku?: string;
  ncmCode: string;
  ncmConfirmed: boolean;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  targetPrice?: number; // Preço alvo de venda no Brasil (por unidade)
  extractedFromPdf: boolean;
}

interface CalculationResultItem {
  product: {
    name: string;
    sku?: string;
    ncmCode: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  };
  calculation: {
    exchangeRate: number;
    exchangeSource: string;
    fobBrl: number;
    freightBrl: number;
    insuranceBrl: number;
    cifBrl: number;
    taxes: {
      rates: { ii: number; ipi: number; pis: number; cofins: number; icms: number };
      values: { iiValueCents: number; ipiValueCents: number; pisValueCents: number; cofinsValueCents: number; icmsValueCents: number; totalTaxesCents: number };
      breakdown: { baseII: number; baseIPI: number; basePISCOFINS: number; baseICMS: number };
    };
    // Regime tributário e impostos sobre venda
    taxRegime: string;
    saleTaxes: {
      icmsOnSale: number;
      pisOnSale: number;
      cofinsOnSale: number;
      irpj: number;
      csll: number;
      simplesTotal?: number;
      totalTaxesOnSale: number;
      effectiveRate: number;
    };
    totalCostBrl: number;
    unitCostBrl: number;
    suggestedPriceBrl: number;
    suggestedUnitPriceBrl: number;
    grossProfitBrl: number;
    grossMarginPercent: number;
    isMercosul: boolean;
    calculationId?: number;
    // Análise de Preço Target (melhorada com margem, CMV e redução necessária)
    targetAnalysis?: {
      targetPrice: number;
      isViable: boolean;
      maxPurchasePrice: number;
      priceDifference: number;
      requiredDiscount: number;
      // Novos campos para análise detalhada
      grossMarginPercent?: number;
      netMarginPercent?: number;
      cmvPercent?: number;
      taxesOnSale?: number;
      effectiveTaxRate?: number;
      grossProfit?: number;
      netProfit?: number;
    };
  };
}

interface CalculationResults {
  results: CalculationResultItem[];
  totals: {
    totalFobBrl: number;
    totalCifBrl: number;
    totalTaxesBrl: number;
    totalCostBrl: number;
    totalSuggestedPriceBrl: number;
    totalGrossProfitBrl: number;
    productCount: number;
  };
  currency: string;
  originCountry: string;
  destinationState: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export default function CalculateMultiple() {
  // Support pre-loading from RFQ via query param
  const [rfqIdParam] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("rfqId") ? parseInt(params.get("rfqId")!) : null;
  });
  const [rfqLoaded, setRfqLoaded] = useState(false);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{ url: string; key: string; name: string } | null>(null);
  const [extractedData, setExtractedData] = useState<{
    supplierName?: string;
    supplierCountry?: string;
    currency?: string;
    freight?: number;
    insurance?: number;
  } | null>(null);
  const [results, setResults] = useState<CalculationResults | null>(null);

  
  const [formData, setFormData] = useState({
    originCountry: "",
    destinationState: "SC",
    portCode: "",
    currency: "USD",
    freight: 0,
    insurance: 0,
    customsBrokerBrl: 1500,
    storageBrl: 500,
    otherCostsBrl: 0,
    siscomex: 214.50,
    afrmm: 0,
    thc: 0,
    liberation: 0,
    taxRegime: "lucro_presumido",
    simplesFaixa: 1,
    markupPercent: 3000,
  });

  const { data: currencies } = trpc.exchange.getSupportedCurrencies.useQuery();
  
  // Load RFQ data if rfqIdParam is present
  const { data: rfqData } = trpc.rfq.getById.useQuery(
    { id: rfqIdParam! },
    { enabled: !!rfqIdParam && !rfqLoaded }
  );

  // Pre-populate form from RFQ data
  useEffect(() => {
    if (rfqData && !rfqLoaded) {
      setRfqLoaded(true);
      // Set destination state
      setFormData(prev => ({
        ...prev,
        destinationState: rfqData.destinationState || "SC",
        currency: rfqData.currency || "USD",
      }));
      // Convert RFQ items to products
      if (rfqData.items && rfqData.items.length > 0) {
        const rfqProducts: ProductItem[] = rfqData.items.map((item: any) => ({
          id: generateId(),
          productName: item.productName,
          sku: undefined,
          ncmCode: item.ncmCode || "",
          ncmConfirmed: !!item.ncmCode,
          quantity: item.quantity || 1,
          unit: item.unit || "UN",
          unitPrice: (item.targetUnitPriceCents || 0) / 100,
          totalPrice: ((item.targetUnitPriceCents || 0) / 100) * (item.quantity || 1),
          targetPrice: undefined,
          extractedFromPdf: false,
        }));
        setProducts(rfqProducts);
        toast.success(`${rfqProducts.length} itens carregados da RFQ ${rfqData.rfqNumber}`);
      }
    }
  }, [rfqData, rfqLoaded]);

  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const uploadMutation = trpc.calculations.uploadQuotation.useMutation();
  const extractMutation = trpc.calculations.extractFromPdf.useMutation();
  const calculateMutation = trpc.calculations.calculateMultiple.useMutation();
  const generateReportMutation = trpc.calculations.generateReport.useMutation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são permitidos");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo: 10MB");
      return;
    }
    
    setQuotationFile(file);
    setResults(null);
    
    // Upload file first
    toast.info("Enviando arquivo...");
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const uploaded = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData,
        contentType: "application/pdf",
      });
      
      setUploadedFileInfo({
        url: uploaded.fileUrl,
        key: uploaded.fileKey,
        name: uploaded.fileName,
      });
      
      toast.success("Arquivo enviado! Extraindo dados...");
      
      // Extract data from PDF - send base64 directly
      const extracted = await extractMutation.mutateAsync({
        fileBase64: fileData,
      });
      
      if (extracted.success && extracted.products.length > 0) {
        // Convert extracted products to our format
        const newProducts: ProductItem[] = extracted.products.map((p) => ({
          id: generateId(),
          productName: p.productName,
          sku: p.sku || undefined,
          ncmCode: p.ncmCode || "",
          ncmConfirmed: !!p.ncmCode,
          quantity: p.quantity,
          unit: p.unit,
          unitPrice: p.unitPrice,
          totalPrice: p.totalPrice,
          extractedFromPdf: true,
        }));
        
        setProducts(newProducts);
        setExtractedData({
          supplierName: extracted.supplierName || undefined,
          supplierCountry: extracted.supplierCountry || undefined,
          currency: extracted.currency,
          freight: extracted.freight || undefined,
          insurance: extracted.insurance || undefined,
        });
        
        // Update form with extracted data
        if (extracted.currency) {
          setFormData(prev => ({ ...prev, currency: extracted.currency! }));
        }
        if (extracted.supplierCountry) {
          // Try to match country
          const allCountries = [...MERCOSUL_COUNTRIES, ...OTHER_COUNTRIES];
          const match = allCountries.find(c => 
            c.value.toLowerCase() === extracted.supplierCountry?.toLowerCase() ||
            c.label.toLowerCase() === extracted.supplierCountry?.toLowerCase()
          );
          if (match) {
            setFormData(prev => ({ ...prev, originCountry: match.value }));
          }
        }
        if (extracted.freight) {
          setFormData(prev => ({ ...prev, freight: extracted.freight! }));
        }
        if (extracted.insurance) {
          setFormData(prev => ({ ...prev, insurance: extracted.insurance! }));
        }
        
        toast.success(`${newProducts.length} produto(s) extraído(s) da cotação!`);
        
        // Check for missing NCMs
        const missingNcm = newProducts.filter(p => !p.ncmCode);
        if (missingNcm.length > 0) {
          toast.warning(`${missingNcm.length} produto(s) sem NCM identificado. Por favor, preencha manualmente.`);
        }
      } else {
        toast.warning("Não foi possível extrair produtos do PDF. Adicione manualmente.");
      }
    } catch (error) {
      console.error("Error processing PDF:", error);
      toast.error("Erro ao processar o PDF. Tente novamente.");
    }
  };

  const removeFile = () => {
    setQuotationFile(null);
    setUploadedFileInfo(null);
    setExtractedData(null);
    setProducts([]);
    setResults(null);
  };

  const addProduct = () => {
    const newProduct: ProductItem = {
      id: generateId(),
      productName: "",
      ncmCode: "",
      ncmConfirmed: false,
      quantity: 1,
      unit: "UN",
      unitPrice: 0,
      totalPrice: 0,
      extractedFromPdf: false,
    };
    setProducts([...products, newProduct]);
  };

  const updateProduct = (id: string, updates: Partial<ProductItem>) => {
    setProducts(products.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, ...updates };
      // Recalculate total if quantity or unit price changed
      if (updates.quantity !== undefined || updates.unitPrice !== undefined) {
        updated.totalPrice = updated.quantity * updated.unitPrice;
      }
      return updated;
    }));
  };

  const removeProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  // Estado para controlar qual produto está carregando sugestão de NCM
  const [suggestingNcmFor, setSuggestingNcmFor] = useState<string | null>(null);

  // Usar trpc utils para fazer queries manuais
  const trpcUtils = trpc.useUtils();

  // Função para sugerir NCM para um produto específico
  const suggestNcmForProduct = async (productId: string, productName: string) => {
    if (!productName || productName.length < 2) {
      toast.error("Nome do produto muito curto para sugerir NCM");
      return;
    }

    setSuggestingNcmFor(productId);
    toast.info(`Excambia analisando: "${productName}"...`);

    try {
      // Usar trpc client para fazer a query
      const result = await trpcUtils.ncm.suggestWithAI.fetch({
        productName,
        productDescription: ""
      });

      if (result?.suggestedNCM?.ncmCode) {
        const ncmCode = result.suggestedNCM.ncmCode;
        const confidence = result.suggestedNCM.confidence || 0;
        const description = result.suggestedNCM.description || '';

        updateProduct(productId, { 
          ncmCode: ncmCode.replace(/\D/g, "").slice(0, 8),
          ncmConfirmed: true 
        });

        toast.success(
          `NCM sugerido: ${ncmCode} (${confidence}% confiança)\n${description.substring(0, 50)}...`,
          { duration: 5000 }
        );

        // Se houver alternativas com economia, mostrar dica
        if (result.alternatives && result.alternatives.length > 0) {
          const bestAlt = result.alternatives.find((a: any) => a.taxSavingsPotential && a.taxSavingsPotential > 0);
          if (bestAlt && bestAlt.taxSavingsPotential) {
            toast.info(
              `Dica de otimização: NCM ${bestAlt.ncmCode} pode economizar ${(bestAlt.taxSavingsPotential / 100).toFixed(2)}% em impostos`,
              { duration: 8000 }
            );
          }
        }
      } else {
        toast.warning("Não foi possível sugerir uma NCM. Preencha manualmente.");
      }
    } catch (error) {
      console.error('Erro ao sugerir NCM:', error);
      toast.error("Erro ao obter sugestão de NCM. Tente novamente.");
    } finally {
      setSuggestingNcmFor(null);
    }
  };

  // Função para sugerir NCM para todos os produtos pendentes
  const suggestNcmForAllPending = async () => {
    const pendingProducts = products.filter(p => !p.ncmCode || p.ncmCode === "00000000");
    
    if (pendingProducts.length === 0) {
      toast.info("Todos os produtos já possuem NCM");
      return;
    }

    toast.info(`Analisando ${pendingProducts.length} produto(s) com NCM pendente...`);

    for (const product of pendingProducts) {
      await suggestNcmForProduct(product.id, product.productName);
      // Pequeno delay entre requisições para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    toast.success("Análise de NCMs concluída!");
  };

  const updateField = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDownloadReport = async () => {
    if (!results) return;
    
    setIsGeneratingReport(true);
    try {
      const exchangeRate = results.results[0]?.calculation.exchangeRate || 5.0;
      const isMercosul = results.results[0]?.calculation.isMercosul || false;
      
      const reportData = {
        quotationNumber: uploadedFileInfo?.name || `Cotação-${Date.now()}`,
        supplierName: extractedData?.supplierName || "Não informado",
        supplierCountry: extractedData?.supplierCountry || formData.originCountry,
        currency: formData.currency,
        exchangeRate,
        originCountry: formData.originCountry,
        destinationState: formData.destinationState,
        isMercosul,
        freight: formData.freight,
        insurance: formData.insurance,
        additionalCosts: {
          customsBroker: formData.customsBrokerBrl,
          storage: formData.storageBrl,
          others: formData.otherCostsBrl,
        },
        markup: formData.markupPercent / 100,
        products: results.results.map(item => ({
          productName: item.product.name,
          sku: item.product.sku,
          ncmCode: item.product.ncmCode,
          quantity: item.product.quantity,
          unit: item.product.unit,
          fobValueBrl: item.calculation.fobBrl,
          cifValueBrl: item.calculation.cifBrl,
          totalTaxes: item.calculation.taxes.values.totalTaxesCents / 100,
          totalCost: item.calculation.totalCostBrl,
          unitCost: item.calculation.unitCostBrl,
          suggestedPrice: item.calculation.suggestedPriceBrl,
          profit: item.calculation.grossProfitBrl,
          profitMargin: item.calculation.grossMarginPercent,
          taxes: {
            ii: item.calculation.taxes.values.iiValueCents / 100,
            ipi: item.calculation.taxes.values.ipiValueCents / 100,
            pis: item.calculation.taxes.values.pisValueCents / 100,
            cofins: item.calculation.taxes.values.cofinsValueCents / 100,
            icms: item.calculation.taxes.values.icmsValueCents / 100,
          },
        })),
        totals: {
          totalFobBrl: results.totals.totalFobBrl,
          totalCifBrl: results.totals.totalCifBrl,
          totalTaxes: results.totals.totalTaxesBrl,
          totalCost: results.totals.totalCostBrl,
          totalSuggestedPrice: results.totals.totalSuggestedPriceBrl,
          totalProfit: results.totals.totalGrossProfitBrl,
          averageMargin: results.totals.totalGrossProfitBrl / results.totals.totalCostBrl * 100,
        },
      };
      
      const result = await generateReportMutation.mutateAsync(reportData);
      
      // Download the PDF
      window.open(result.url, "_blank");
      toast.success("Relatório gerado com sucesso!");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Erro ao gerar relatório. Tente novamente.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSubmit = async (save: boolean = false) => {
    console.log("handleSubmit called", { save, products, formData });
    // Validate
    if (products.length === 0) {
      toast.error("Adicione pelo menos um produto");
      return;
    }
    
    const invalidProducts = products.filter(p => !p.productName || !p.ncmCode || p.quantity <= 0);
    if (invalidProducts.length > 0) {
      toast.error("Preencha todos os campos obrigatórios dos produtos (nome, NCM, quantidade)");
      return;
    }
    
    if (!formData.originCountry) {
      toast.error("Selecione o país de origem");
      return;
    }
    
    try {
      const result = await calculateMutation.mutateAsync({
        products: products.map(p => ({
          productName: p.productName,
          sku: p.sku,
          ncmCode: p.ncmCode,
          quantity: p.quantity,
          unit: p.unit,
          unitPrice: p.unitPrice,
          totalPrice: p.totalPrice,
        })),
        originCountry: formData.originCountry,
        destinationState: formData.destinationState,
        currency: formData.currency,
        freight: formData.freight,
        insurance: formData.insurance,
        customsBrokerBrl: formData.customsBrokerBrl,
        storageBrl: formData.storageBrl,
        otherCostsBrl: formData.otherCostsBrl,
        markupPercent: formData.markupPercent,
        taxRegime: formData.taxRegime as "simples_nacional" | "lucro_presumido" | "lucro_real",
        simplesFaixa: formData.taxRegime === 'simples_nacional' ? formData.simplesFaixa : undefined,
        quotationFileUrl: uploadedFileInfo?.url,
        quotationFileKey: uploadedFileInfo?.key,
        quotationFileName: uploadedFileInfo?.name,
        save,
      });
      
      setResults(result);
      toast.success(save ? "Cálculos salvos com sucesso!" : "Cálculos realizados com sucesso!");
    } catch (error) {
      console.error("Error calculating:", error);
      toast.error("Erro ao calcular. Tente novamente.");
    }
  };

  const totalFob = products.reduce((sum, p) => sum + p.totalPrice, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Nova Cotação</h1>
        <p className="text-muted-foreground">
          Importe uma cotação em PDF ou adicione produtos manualmente para calcular custos de importação
        </p>
      </div>

      <div className="grid gap-6 xl:gap-8 lg:grid-cols-12">
        {/* Form - 8 columns on desktop for better space usage */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* PDF Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileUp className="h-5 w-5" />
                Cotação do Fornecedor
              </CardTitle>
              <CardDescription>
                Anexe o PDF da cotação para extrair automaticamente os produtos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!quotationFile ? (
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="quotationFile"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="quotationFile" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium">Arraste ou clique para selecionar</p>
                    <p className="text-sm text-muted-foreground mt-1">PDF da cotação do fornecedor (máx. 10MB)</p>
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{quotationFile.name}</p>
                        <p className="text-sm text-muted-foreground">
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
                  
                  {extractedData?.supplierName && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Fornecedor: <strong>{extractedData.supplierName}</strong></span>
                      {extractedData.supplierCountry && (
                        <span>({extractedData.supplierCountry})</span>
                      )}
                    </div>
                  )}
                  
                  {(uploadMutation.isPending || extractMutation.isPending) && (
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{uploadMutation.isPending ? "Enviando arquivo..." : "Extraindo dados..."}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Products List */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Produtos da Cotação
                    </CardTitle>
                    <CardDescription>
                      {products.length > 0 
                        ? `${products.length} produto(s) • Total FOB: ${formatCurrency(totalFob, formData.currency)}`
                        : "Adicione produtos manualmente ou importe do PDF"
                      }
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {products.some(p => !p.ncmCode || p.ncmCode === "00000000") && (
                      <Button 
                        onClick={suggestNcmForAllPending} 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                        disabled={suggestingNcmFor !== null}
                      >
                        {suggestingNcmFor ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        Sugerir NCMs
                      </Button>
                    )}
                    <Button onClick={addProduct} variant="outline" size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Adicionar Produto
                    </Button>
                  </div>
                </div>
                
                {/* Seletor de Regime Tributário para todos os produtos */}
                {products.length > 0 && (
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-turquesa-50 dark:from-purple-950/30 dark:to-turquesa-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label className="text-sm font-medium text-purple-700 dark:text-purple-300">Regime Tributário (aplicar a todos)</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Selecione o regime para calcular impostos sobre venda</p>
                      </div>
                      <Select 
                        value={formData.taxRegime || "lucro_presumido"} 
                        onValueChange={(v) => setFormData(prev => ({ ...prev, taxRegime: v, simplesFaixa: v === 'simples_nacional' ? (prev.simplesFaixa || 1) : 1 }))}
                      >
                        <SelectTrigger className="w-[220px] bg-white dark:bg-gray-900">
                          <SelectValue placeholder="Selecione o regime" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                          <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                          <SelectItem value="lucro_real">Lucro Real</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Seletor de Faixa do Simples Nacional */}
                    {formData.taxRegime === 'simples_nacional' && (
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                        <div className="flex-1">
                          <Label className="text-sm font-medium text-orange-700 dark:text-orange-300">Faixa do Simples Nacional</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Selecione a faixa conforme faturamento anual</p>
                        </div>
                        <Select 
                          value={String(formData.simplesFaixa || 1)} 
                          onValueChange={(v) => setFormData(prev => ({ ...prev, simplesFaixa: parseInt(v) }))}
                        >
                          <SelectTrigger className="w-[280px] bg-white dark:bg-gray-900">
                            <SelectValue placeholder="Selecione a faixa" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1ª Faixa - Até R$ 180 mil (4%)</SelectItem>
                            <SelectItem value="2">2ª Faixa - Até R$ 360 mil (7,3%)</SelectItem>
                            <SelectItem value="3">3ª Faixa - Até R$ 720 mil (9,5%)</SelectItem>
                            <SelectItem value="4">4ª Faixa - Até R$ 1,8 mi (10,7%)</SelectItem>
                            <SelectItem value="5">5ª Faixa - Até R$ 3,6 mi (14,3%)</SelectItem>
                            <SelectItem value="6">6ª Faixa - Até R$ 4,8 mi (19%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    {/* Botão de Recalcular (aparece quando já tem resultado) */}
                    {results && (
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                        <div className="flex-1">
                          <p className="text-sm text-green-700 dark:text-green-300 font-medium">Regime alterado? Recalcule para atualizar os valores</p>
                        </div>
                        <Button 
                          variant="outline" 
                          className="gap-2 border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                          onClick={() => handleSubmit(true)}
                          disabled={calculateMutation.isPending}
                        >
                          {calculateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Calculator className="h-4 w-4" />
                          )}
                          Recalcular
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum produto adicionado</p>
                  <p className="text-sm">Importe um PDF ou adicione manualmente</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {products.map((product, index) => (
                    <div 
                      key={product.id} 
                      className={`p-4 rounded-lg border ${!product.ncmCode ? 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20' : 'border-border'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                            {product.extractedFromPdf && (
                              <Badge variant="secondary" className="text-xs">
                                <FileSearch className="h-3 w-3 mr-1" />
                                Extraído do PDF
                              </Badge>
                            )}
                            {!product.ncmCode && (
                              <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                NCM Pendente
                              </Badge>
                            )}
                          </div>
                          
                          {/* Linha 1: Identificação do Produto */}
                          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="sm:col-span-2 space-y-2">
                              <Label className="text-xs font-medium text-foreground">Nome do Produto *</Label>
                              <Input
                                value={product.productName}
                                onChange={(e) => updateProduct(product.id, { productName: e.target.value })}
                                placeholder="Nome do produto"
                                className="h-10"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-foreground">SKU / Código</Label>
                              <Input
                                value={product.sku || ""}
                                onChange={(e) => updateProduct(product.id, { sku: e.target.value })}
                                placeholder="Código interno"
                                className="h-10"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                                NCM *
                                {!product.ncmCode && <AlertCircle className="h-3 w-3 text-yellow-500" />}
                              </Label>
                              <div className="flex gap-1">
                                <Input
                                  value={product.ncmCode}
                                  onChange={(e) => updateProduct(product.id, { 
                                    ncmCode: e.target.value.replace(/\D/g, "").slice(0, 8),
                                    ncmConfirmed: true 
                                  })}
                                  placeholder="00000000"
                                  className={`h-10 flex-1 ${!product.ncmCode ? "border-yellow-500 bg-yellow-50/50" : ""}`}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-10 w-10 shrink-0"
                                  onClick={() => suggestNcmForProduct(product.id, product.productName)}
                                  disabled={suggestingNcmFor === product.id || !product.productName}
                                  title="Excambia: Sugerir NCM automaticamente"
                                >
                                  {suggestingNcmFor === product.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4 text-purple-500" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {/* Linha 2: Quantidades e Preços - Grid fixo de 5 colunas */}
                          <div className="grid grid-cols-5 gap-2 pt-4">
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-muted-foreground uppercase">QTD *</Label>
                              <Input
                                type="number"
                                min="1"
                                value={product.quantity}
                                onChange={(e) => updateProduct(product.id, { quantity: parseInt(e.target.value) || 1 })}
                                className="h-9 text-sm w-full"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-muted-foreground uppercase">UNID</Label>
                              <Select 
                                value={product.unit} 
                                onValueChange={(v) => updateProduct(product.id, { unit: v })}
                              >
                                <SelectTrigger className="h-9 text-sm w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {UNITS.map((u) => (
                                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-muted-foreground uppercase">P.UNIT</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={product.unitPrice}
                                onChange={(e) => updateProduct(product.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                className="h-9 text-sm w-full"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-muted-foreground uppercase">TOTAL</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={product.totalPrice}
                                onChange={(e) => updateProduct(product.id, { 
                                  totalPrice: parseFloat(e.target.value) || 0,
                                  unitPrice: product.quantity > 0 ? (parseFloat(e.target.value) || 0) / product.quantity : 0
                                })}
                                className="h-9 text-sm w-full"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-purple-600 uppercase">ALVO</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Preço"
                                value={product.targetPrice || ""}
                                onChange={(e) => updateProduct(product.id, { targetPrice: parseFloat(e.target.value) || undefined })}
                                className="h-9 text-sm w-full border-purple-300 focus:border-purple-500 bg-purple-50/50"
                              />
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeProduct(product.id)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Origin & Destination */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Ship className="h-5 w-5" />
                Origem e Destino
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>País de Origem *</Label>
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
                  <Label>Estado de Destino</Label>
                  <Select value={formData.destinationState} onValueChange={(v) => {
                    updateField("destinationState", v);
                    updateField("portCode", ""); // Reset port when state changes
                  }}>
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
              
              {/* Porto de Destino */}
              <PortSelector 
                stateCode={formData.destinationState}
                selectedPort={formData.portCode}
                onPortChange={(portCode, portCosts) => {
                  updateField("portCode", portCode);
                  if (portCosts) {
                    updateField("thc", portCosts.thc);
                    updateField("liberation", portCosts.liberation);
                    updateField("storageBrl", portCosts.storage);
                  }
                }}
                freight={formData.freight}
                onAfrmmChange={(afrmm) => updateField("afrmm", afrmm)}
              />
            </CardContent>
          </Card>

          {/* Values */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Valores da Cotação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Moeda</Label>
                  <Select value={formData.currency} onValueChange={(v) => updateField("currency", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies?.map((c: { code: string; name: string }) => (
                        <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Frete Internacional ({formData.currency})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.freight}
                    onChange={(e) => updateField("freight", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Seguro ({formData.currency})</Label>
                  <Input
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Custos Aduaneiros e Operacionais (R$)
              </CardTitle>
              <CardDescription>
                Custos automáticos baseados no porto selecionado. Valores podem ser ajustados manualmente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Custos Portuários */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2">
                  <Ship className="h-4 w-4" />
                  Custos Portuários
                </h4>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label className="text-sm">THC</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.thc}
                      onChange={(e) => updateField("thc", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Liberação</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.liberation}
                      onChange={(e) => updateField("liberation", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">AFRMM (25% frete)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.afrmm}
                      onChange={(e) => updateField("afrmm", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Siscomex</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.siscomex}
                      onChange={(e) => updateField("siscomex", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
              
              {/* Custos Operacionais */}
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Custos Operacionais
                </h4>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Despachante</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.customsBrokerBrl}
                      onChange={(e) => updateField("customsBrokerBrl", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Armazenagem</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.storageBrl}
                      onChange={(e) => updateField("storageBrl", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Outros</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.otherCostsBrl}
                      onChange={(e) => updateField("otherCostsBrl", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
              
              {/* Total Custos Aduaneiros */}
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Custos Aduaneiros:</span>
                  <span className="text-lg font-bold text-primary">
                    {formatCurrency(
                      formData.thc + formData.liberation + formData.afrmm + formData.siscomex +
                      formData.customsBrokerBrl + formData.storageBrl + formData.otherCostsBrl
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Markup */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Precificação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Markup Desejado (%)</Label>
                <Input
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

          {/* Actions */}
          <div className="flex gap-3">
            <Button 
              size="lg" 
              className="flex-1 gap-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
              disabled={calculateMutation.isPending || products.length === 0}
              onClick={() => handleSubmit(true)}
            >
              {calculateMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
              Calcular e Gerar Relatório Excel
            </Button>
          </div>
          
          {/* Status de processamento */}
          {calculateMutation.isPending && (
            <Card className="mt-6">
              <CardContent className="py-8 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <h3 className="text-lg font-semibold mb-2">Calculando e gerando relatório...</h3>
                <p className="text-muted-foreground">
                  Processando {products.length} produto(s)
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results - 4 columns on lg, 3 on xl for compact sidebar */}
        <div className="lg:col-span-4 xl:col-span-3">
          {!results && !calculateMutation.isPending && (
            <Card className="flex items-center justify-center min-h-[300px] sticky top-20">
              <CardContent className="text-center">
                <Calculator className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Preencha a cotação</h3>
                <p className="text-muted-foreground">
                  Após calcular, você poderá baixar o relatório Excel completo
                </p>
              </CardContent>
            </Card>
          )}

          {results && !calculateMutation.isPending && (
            <Card className="sticky top-20 border-2 border-green-500/30 bg-gradient-to-br from-white to-green-50 dark:from-gray-900 dark:to-green-950 shadow-lg">
              <CardContent className="p-4 lg:p-5">
                {/* Header compacto */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-green-200 dark:border-green-800">
                  <div className="p-2 bg-green-500 rounded-full">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-green-800 dark:text-green-200">Cálculo Concluído</h3>
                    <p className="text-xs text-muted-foreground">{results.totals.productCount} produto(s)</p>
                  </div>
                </div>
                
                {/* Resumo compacto em linha */}
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
                
                {/* Botão Download Excel - compacto */}
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                  onClick={handleDownloadReport}
                  disabled={isGeneratingReport}
                >
                  {isGeneratingReport ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                  ) : (
                    <><FileText className="h-4 w-4" /> Baixar Excel</>
                  )}
                </Button>
                
                {/* Mercosul Badge - compacto */}
                {results.results[0]?.calculation.isMercosul && (
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-green-700 dark:text-green-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="text-xs">Mercosul - II isento</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
