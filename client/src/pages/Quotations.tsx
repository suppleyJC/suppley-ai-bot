import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calculator, 
  Package, 
  Building2, 
  Clock,
  FileText,
  CheckCircle2,
  Ship,
  FileCheck,
  Plus,
  Trash2,
  Eye,
  MoreHorizontal,
  TrendingUp,
  ArrowRight,
  Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileSpreadsheet, File } from "lucide-react";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  draft: { label: "Rascunho", color: "text-muted-foreground", bgColor: "bg-muted", icon: FileText },
  analyzing: { label: "Analisando", color: "text-blue-600", bgColor: "bg-blue-50", icon: Calculator },
  viable: { label: "Viável", color: "text-emerald-600", bgColor: "bg-emerald-50", icon: CheckCircle2 },
  not_viable: { label: "Inviável", color: "text-red-600", bgColor: "bg-red-50", icon: FileText },
  negotiating: { label: "Negociando", color: "text-amber-600", bgColor: "bg-amber-50", icon: Building2 },
  approved: { label: "Aprovada", color: "text-green-600", bgColor: "bg-green-50", icon: CheckCircle2 },
  ordered: { label: "Pedido Feito", color: "text-purple-600", bgColor: "bg-purple-50", icon: FileCheck },
  shipped: { label: "Embarcado", color: "text-indigo-600", bgColor: "bg-indigo-50", icon: Ship },
  customs: { label: "Desembaraço", color: "text-orange-600", bgColor: "bg-orange-50", icon: FileCheck },
  nationalized: { label: "Nacionalizado", color: "text-teal-600", bgColor: "bg-teal-50", icon: CheckCircle2 },
  completed: { label: "Concluído", color: "text-emerald-700", bgColor: "bg-emerald-100", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "text-muted-foreground", bgColor: "bg-muted", icon: FileText },
};

const statusTabs = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Rascunhos" },
  { value: "analyzing", label: "Analisando" },
  { value: "viable", label: "Viáveis" },
  { value: "in_progress", label: "Em Andamento" },
  { value: "completed", label: "Concluídas" },
];

function QuotationCard({ 
  quotation, 
  onDelete,
  index
}: { 
  quotation: any; 
  onDelete: (id: number) => void;
  index: number;
}) {
  const status = statusConfig[quotation.status] || statusConfig.draft;
  const StatusIcon = status.icon;

  return (
    <div 
      className="card-modern group animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className={`h-12 w-12 rounded-xl ${status.bgColor} flex items-center justify-center`}>
            <StatusIcon className={`h-6 w-6 ${status.color}`} />
          </div>
          <div>
            <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
              {quotation.supplierName || "Cotação"} 
              {quotation.quotationNumber && ` #${quotation.quotationNumber}`}
            </h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {quotation.supplierCountry || quotation.originCountry || "Origem não definida"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`${status.bgColor} ${status.color} border-0 font-medium`}>
            {status.label}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Link href={`/quotations/${quotation.id}`}>
                <DropdownMenuItem>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Detalhes
                </DropdownMenuItem>
              </Link>
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => onDelete(quotation.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Valor FOB</p>
          <p className="font-semibold">{formatCurrency(quotation.totalFobCents)}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Custo Total</p>
          <p className="font-semibold">{formatCurrency(quotation.totalCostCents)}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Moeda</p>
          <p className="font-semibold">{quotation.currency || "USD"}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Criado em</p>
          <p className="font-semibold flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(quotation.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>
      
      {quotation.notes && (
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {quotation.notes}
        </p>
      )}
      
      <div className="flex justify-end pt-4 border-t border-border/50">
        <Link href={`/quotations/${quotation.id}`}>
          <Button variant="ghost" size="sm" className="gap-2 text-primary hover:text-primary">
            Ver Detalhes
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// Tipo para agrupamento por fornecedor
interface SupplierGroup {
  supplierName: string;
  country: string;
  quotations: any[];
  totalQuotations: number;
  totalValue: number;
}

export default function Quotations() {
  const [activeTab, setActiveTab] = useState("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("grouped");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  
  const utils = trpc.useUtils();
  const { data: quotations, isLoading } = trpc.quotations.list.useQuery({ limit: 100 });
  const { data: stats } = trpc.quotations.stats.useQuery();
  
  const deleteMutation = trpc.quotations.delete.useMutation({
    onSuccess: () => {
      toast.success("Cotação excluída com sucesso");
      utils.quotations.list.invalidate();
      utils.quotations.stats.invalidate();
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error("Erro ao excluir cotação: " + error.message);
    },
  });

  const filteredQuotations = quotations?.filter((q) => {
    // Filtro por tab
    let matchesTab = true;
    if (activeTab !== "all") {
      if (activeTab === "in_progress") {
        matchesTab = ["ordered", "shipped", "customs"].includes(q.status);
      } else {
        matchesTab = q.status === activeTab;
      }
    }
    
    // Filtro por busca
    let matchesSearch = true;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      matchesSearch = 
        (q.supplierName?.toLowerCase().includes(query) ?? false) ||
        (q.notes?.toLowerCase().includes(query) ?? false) ||
        (q.originCountry?.toLowerCase().includes(query) ?? false);
    }
    
    return matchesTab && matchesSearch;
  });
  
  // Agrupar cotações por fornecedor
  const groupedBySupplier = useMemo(() => {
    if (!filteredQuotations) return [];
    
    const groups: Record<string, SupplierGroup> = {};
    
    filteredQuotations.forEach((q) => {
      const supplierKey = q.supplierName || "Fornecedor Não Identificado";
      
      if (!groups[supplierKey]) {
        groups[supplierKey] = {
          supplierName: supplierKey,
          country: q.supplierCountry || q.originCountry || "País não definido",
          quotations: [],
          totalQuotations: 0,
          totalValue: 0,
        };
      }
      
      groups[supplierKey].quotations.push(q);
      groups[supplierKey].totalQuotations++;
      groups[supplierKey].totalValue += q.totalCostCents || 0;
    });
    
    // Ordenar por nome do fornecedor
    return Object.values(groups).sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [filteredQuotations]);
  
  const toggleSupplier = (supplierName: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(supplierName)) {
        next.delete(supplierName);
      } else {
        next.add(supplierName);
      }
      return next;
    });
  };
  
  const expandAll = () => {
    setExpandedSuppliers(new Set(groupedBySupplier.map((g) => g.supplierName)));
  };
  
  const collapseAll = () => {
    setExpandedSuppliers(new Set());
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Análise das Oportunidades</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas cotações e acompanhe o status das importações
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cotações..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Link href="/calculate">
            <Button size="lg" className="btn-turquesa gap-2">
              <Plus className="h-5 w-5" />
              Novo Cálculo
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <div className="stat-icon stat-icon-purple">
            <Calculator className="h-6 w-6" />
          </div>
          <div className="stat-value">{stats?.totalQuotations || 0}</div>
          <div className="stat-label">Total de Cotações</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-turquesa">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="stat-value text-emerald-600">{stats?.viableCount || 0}</div>
          <div className="stat-label">Viáveis</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-purple">
            <Ship className="h-6 w-6" />
          </div>
          <div className="stat-value text-blue-600">{stats?.inProgressCount || 0}</div>
          <div className="stat-label">Em Andamento</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-turquesa">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div className="stat-value text-emerald-600">{stats?.completedCount || 0}</div>
          <div className="stat-label">Concluídas</div>
        </div>
      </div>

      {/* Tabs and List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
            {statusTabs.map((tab) => (
              <TabsTrigger 
                key={tab.value} 
                value={tab.value}
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "grouped" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("grouped")}
              className="gap-2"
            >
              <Folder className="h-4 w-4" />
              Por Fornecedor
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Lista
            </Button>
            {viewMode === "grouped" && groupedBySupplier.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={expandAll}>
                  Expandir Todos
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  Recolher Todos
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="grid gap-5 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-56 w-full rounded-2xl" />
              ))}
            </div>
          ) : viewMode === "grouped" && groupedBySupplier.length > 0 ? (
            /* Visualização agrupada por fornecedor */
            <div className="space-y-4">
              {groupedBySupplier.map((group) => (
                <Collapsible
                  key={group.supplierName}
                  open={expandedSuppliers.has(group.supplierName)}
                  onOpenChange={() => toggleSupplier(group.supplierName)}
                >
                  <div className="card-modern">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between cursor-pointer p-4 hover:bg-muted/30 rounded-xl transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedSuppliers.has(group.supplierName) ? (
                            <FolderOpen className="h-6 w-6 text-primary" />
                          ) : (
                            <Folder className="h-6 w-6 text-muted-foreground" />
                          )}
                          <div>
                            <h3 className="font-semibold text-lg">{group.supplierName}</h3>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5" />
                              {group.country}
                              <span className="mx-1">•</span>
                              {group.totalQuotations} cotação(es)
                              <span className="mx-1">•</span>
                              Total: {formatCurrency(group.totalValue)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-primary/10 text-primary">
                            {group.totalQuotations} cotações
                          </Badge>
                          {expandedSuppliers.has(group.supplierName) ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="border-t border-border/50 pt-4 px-4 pb-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          {group.quotations.map((quotation, index) => (
                            <div key={quotation.id} className="bg-muted/30 rounded-xl p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <File className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(quotation.createdAt).toLocaleDateString("pt-BR")}
                                  </span>
                                </div>
                                <Badge 
                                  variant="secondary" 
                                  className={`${statusConfig[quotation.status]?.bgColor || "bg-muted"} ${statusConfig[quotation.status]?.color || "text-muted-foreground"} border-0 text-xs`}
                                >
                                  {statusConfig[quotation.status]?.label || quotation.status}
                                </Badge>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                  <p className="text-xs text-muted-foreground">Valor FOB</p>
                                  <p className="font-medium">{formatCurrency(quotation.totalFobCents)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Custo Total</p>
                                  <p className="font-medium">{formatCurrency(quotation.totalCostCents)}</p>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between pt-3 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                  {quotation.pdfUrl && (
                                    <a href={quotation.pdfUrl} target="_blank" rel="noopener noreferrer">
                                      <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                                        <File className="h-3.5 w-3.5" />
                                        PDF
                                      </Button>
                                    </a>
                                  )}
                                  {quotation.excelUrl && (
                                    <a href={quotation.excelUrl} target="_blank" rel="noopener noreferrer">
                                      <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                                        <FileSpreadsheet className="h-3.5 w-3.5" />
                                        Excel
                                      </Button>
                                    </a>
                                  )}
                                </div>
                                <Link href={`/quotations/${quotation.id}`}>
                                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-primary">
                                    Ver Detalhes
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          ) : filteredQuotations && filteredQuotations.length > 0 ? (
            /* Visualização em lista */
            <div className="grid gap-5 md:grid-cols-2">
              {filteredQuotations.map((quotation, index) => (
                <QuotationCard 
                  key={quotation.id} 
                  quotation={quotation}
                  onDelete={setDeleteId}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div className="card-modern text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Nenhuma cotação encontrada</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {activeTab === "all" 
                  ? "Comece criando sua primeira oportunidade de importação"
                  : `Não há cotações com status "${statusTabs.find(t => t.value === activeTab)?.label}"`
                }
              </p>
              <Link href="/calculate">
                <Button className="btn-turquesa gap-2">
                  <Plus className="h-4 w-4" />
                  Novo Cálculo
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cotação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta cotação? Esta ação não pode ser desfeita
              e todos os cálculos associados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
