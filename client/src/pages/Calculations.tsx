import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Link } from "wouter";
import { 
  Calculator, 
  Plus,
  Package,
  Globe,
  Building2,
  FolderOpen,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Calculation {
  id: number;
  productName: string;
  ncmCode: string;
  originCountry: string;
  isMercosul: boolean;
  quantity: number;
  unit: string;
  totalCostCents: number;
  suggestedPriceCents: number;
  viabilityScore: number | null;
  createdAt: Date;
  quotationId: number | null;
  supplierId: number | null;
}

interface Quotation {
  id: number;
  name: string;
  supplierName: string | null;
  supplierId: number | null;
  status: string;
  createdAt: Date;
  calculations: Calculation[];
}

interface SupplierGroup {
  supplierId: number | null;
  supplierName: string;
  quotations: Quotation[];
  totalCalculations: number;
  totalValue: number;
}

export default function Calculations() {
  const { data: quotations, isLoading: quotationsLoading } = trpc.quotations.list.useQuery({ limit: 100 });
  const { data: calculations, isLoading: calculationsLoading } = trpc.calculations.list.useQuery({ limit: 500 });
  
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set(['all']));
  const [expandedQuotations, setExpandedQuotations] = useState<Set<number>>(new Set());
  const [downloadingExcel, setDownloadingExcel] = useState<number | null>(null);
  
  const generateExcelMutation = trpc.quotations.generateExcelReport.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, '_blank');
        toast.success("Relatório Excel gerado com sucesso!");
      }
    },
    onError: (error) => {
      toast.error(`Erro ao gerar Excel: ${error.message}`);
    },
    onSettled: () => {
      setDownloadingExcel(null);
    }
  });

  const handleDownloadExcel = (quotationId: number) => {
    setDownloadingExcel(quotationId);
    generateExcelMutation.mutate({ quotationId });
  };

  // Agrupar cálculos por Fornecedor > Cotação
  const supplierGroups = useMemo(() => {
    if (!quotations || !calculations) return [];

    // Criar mapa de cotações com seus cálculos
    const quotationMap = new Map<number, Quotation>();
    
    quotations.forEach(q => {
      quotationMap.set(q.id, {
        id: q.id,
        name: q.quotationNumber || `Cotação #${q.id}`,
        supplierName: q.supplierName,
        supplierId: q.supplierId,
        status: q.status,
        createdAt: q.createdAt,
        calculations: []
      });
    });

    // Associar cálculos às cotações
    const standaloneCalcs: Calculation[] = [];
    calculations.forEach(calc => {
      if (calc.quotationId && quotationMap.has(calc.quotationId)) {
        quotationMap.get(calc.quotationId)!.calculations.push(calc as Calculation);
      } else {
        standaloneCalcs.push(calc as Calculation);
      }
    });

    // Criar cotação virtual para cálculos avulsos (sem quotationId)
    if (standaloneCalcs.length > 0) {
      // Agrupar cálculos avulsos por fornecedor
      const standaloneBySupplier = new Map<string, Calculation[]>();
      standaloneCalcs.forEach(calc => {
        const key = calc.supplierId?.toString() || 'avulso';
        if (!standaloneBySupplier.has(key)) standaloneBySupplier.set(key, []);
        standaloneBySupplier.get(key)!.push(calc);
      });
      standaloneBySupplier.forEach((calcs, key) => {
        const virtualId = -parseInt(key) || -99999;
        quotationMap.set(virtualId, {
          id: virtualId,
          name: `Cálculos Avulsos`,
          supplierName: calcs[0]?.originCountry || 'Sem Fornecedor',
          supplierId: calcs[0]?.supplierId || null,
          status: 'completed',
          createdAt: calcs[0]?.createdAt || new Date(),
          calculations: calcs
        });
      });
    }

    // Agrupar cotações por fornecedor
    const supplierMap = new Map<string, SupplierGroup>();
    
    quotationMap.forEach(quotation => {
      const supplierKey = quotation.supplierId?.toString() || 'sem-fornecedor';
      const supplierName = quotation.supplierName || 'Sem Fornecedor';
      
      if (!supplierMap.has(supplierKey)) {
        supplierMap.set(supplierKey, {
          supplierId: quotation.supplierId,
          supplierName,
          quotations: [],
          totalCalculations: 0,
          totalValue: 0
        });
      }
      
      const group = supplierMap.get(supplierKey)!;
      group.quotations.push(quotation);
      group.totalCalculations += quotation.calculations.length;
      group.totalValue += quotation.calculations.reduce((sum, c) => sum + c.totalCostCents, 0);
    });

    // Ordenar cotações por data dentro de cada fornecedor
    supplierMap.forEach(group => {
      group.quotations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    // Converter para array e ordenar por nome do fornecedor
    return Array.from(supplierMap.values()).sort((a, b) => 
      a.supplierName.localeCompare(b.supplierName)
    );
  }, [quotations, calculations]);

  const toggleSupplier = (supplierId: string) => {
    const newExpanded = new Set(expandedSuppliers);
    if (newExpanded.has(supplierId)) {
      newExpanded.delete(supplierId);
    } else {
      newExpanded.add(supplierId);
    }
    setExpandedSuppliers(newExpanded);
  };

  const toggleQuotation = (quotationId: number) => {
    const newExpanded = new Set(expandedQuotations);
    if (newExpanded.has(quotationId)) {
      newExpanded.delete(quotationId);
    } else {
      newExpanded.add(quotationId);
    }
    setExpandedQuotations(newExpanded);
  };

  const isLoading = quotationsLoading || calculationsLoading;

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalCalculations = calculations?.length || 0;
  const totalQuotations = quotations?.length || 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Histórico de Cálculos</h1>
          <p className="text-muted-foreground">
            {totalCalculations} cálculo(s) em {totalQuotations} cotação(ões) • Agrupado por fornecedor
          </p>
        </div>
        <Link href="/calculate">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Cálculo
          </Button>
        </Link>
      </div>

      {supplierGroups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calculator className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum cálculo salvo</h3>
            <p className="text-muted-foreground mb-4">
              Comece fazendo seu primeiro cálculo de importação
            </p>
            <Link href="/calculate">
              <Button>Fazer Cálculo</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {supplierGroups.map((supplier) => {
            const supplierKey = supplier.supplierId?.toString() || 'sem-fornecedor';
            const isSupplierExpanded = expandedSuppliers.has(supplierKey) || expandedSuppliers.has('all');
            
            return (
              <Card key={supplierKey} className="overflow-hidden">
                <Collapsible open={isSupplierExpanded} onOpenChange={() => toggleSupplier(supplierKey)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isSupplierExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{supplier.supplierName}</CardTitle>
                            <CardDescription>
                              {supplier.quotations.length} cotação(ões) • {supplier.totalCalculations} produto(s) • {formatCurrency(supplier.totalValue)}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-3 pl-8">
                        {supplier.quotations.map((quotation) => {
                          const isQuotationExpanded = expandedQuotations.has(quotation.id);
                          
                          return (
                            <Collapsible 
                              key={quotation.id} 
                              open={isQuotationExpanded} 
                              onOpenChange={() => toggleQuotation(quotation.id)}
                            >
                              <div className="border rounded-lg overflow-hidden">
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center gap-3">
                                      {isQuotationExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        <FolderOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                      </div>
                                      <div>
                                        <div className="font-medium">{quotation.name}</div>
                                        <div className="text-sm text-muted-foreground">
                                          {quotation.calculations.length} produto(s) • {formatDate(quotation.createdAt)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Link href={`/quotations/${quotation.id}`}>
                                        <Button variant="ghost" size="sm" className="gap-1">
                                          <Eye className="h-4 w-4" />
                                          Ver
                                        </Button>
                                      </Link>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="gap-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDownloadExcel(quotation.id);
                                        }}
                                        disabled={downloadingExcel === quotation.id}
                                      >
                                        {downloadingExcel === quotation.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                        )}
                                        Excel
                                      </Button>
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                
                                <CollapsibleContent>
                                  <div className="border-t bg-muted/20">
                                    <div className="p-4 space-y-2">
                                      {quotation.calculations.map((calc) => (
                                        <div 
                                          key={calc.id}
                                          className="flex items-center justify-between p-3 bg-background rounded-lg border"
                                        >
                                          <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                                              <Package className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                              <div className="font-medium text-sm">{calc.productName}</div>
                                              <div className="text-xs text-muted-foreground">
                                                NCM: {calc.ncmCode} • {calc.quantity} {calc.unit}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-4">
                                            <div className="text-right">
                                              <div className="text-sm font-medium">{formatCurrency(calc.totalCostCents)}</div>
                                              <div className="text-xs text-green-600">{formatCurrency(calc.suggestedPriceCents)}</div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <Globe className="h-3 w-3 text-muted-foreground" />
                                              <span className="text-xs">{calc.originCountry}</span>
                                              {calc.isMercosul && (
                                                <Badge variant="outline" className="text-[10px] px-1 py-0">Mercosul</Badge>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
