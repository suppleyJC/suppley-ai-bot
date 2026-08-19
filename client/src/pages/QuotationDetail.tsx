import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Calculator, 
  Package, 
  Building2, 
  FileText,
  CheckCircle2,
  Ship,
  FileCheck,
  ArrowLeft,
  Download,
  Trash2,
  DollarSign,
  TrendingUp,
  Percent
} from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Rascunho", color: "bg-gray-500", icon: FileText },
  analyzing: { label: "Analisando", color: "bg-blue-500", icon: Calculator },
  viable: { label: "Viável", color: "bg-green-500", icon: CheckCircle2 },
  not_viable: { label: "Inviável", color: "bg-red-500", icon: FileText },
  negotiating: { label: "Negociando", color: "bg-yellow-500", icon: Building2 },
  approved: { label: "Aprovada", color: "bg-green-600", icon: CheckCircle2 },
  ordered: { label: "Pedido Feito", color: "bg-purple-500", icon: FileCheck },
  shipped: { label: "Embarcado", color: "bg-indigo-500", icon: Ship },
  customs: { label: "Desembaraço", color: "bg-orange-500", icon: FileCheck },
  nationalized: { label: "Nacionalizado", color: "bg-teal-500", icon: CheckCircle2 },
  completed: { label: "Concluído", color: "bg-emerald-600", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "bg-gray-400", icon: FileText },
};

const statusOptions = [
  { value: "draft", label: "Rascunho" },
  { value: "analyzing", label: "Analisando" },
  { value: "viable", label: "Viável" },
  { value: "not_viable", label: "Inviável" },
  { value: "negotiating", label: "Negociando" },
  { value: "approved", label: "Aprovada" },
  { value: "ordered", label: "Pedido Feito" },
  { value: "shipped", label: "Embarcado" },
  { value: "customs", label: "Desembaraço" },
  { value: "nationalized", label: "Nacionalizado" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

export default function QuotationDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const quotationId = parseInt(params.id || "0");
  const utils = trpc.useUtils();
  
  const { data: quotation, isLoading } = trpc.quotations.get.useQuery(
    { id: quotationId },
    { enabled: quotationId > 0 }
  );
  
  const updateMutation = trpc.quotations.update.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso");
      utils.quotations.get.invalidate({ id: quotationId });
      utils.quotations.list.invalidate();
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });
  
  const deleteMutation = trpc.quotations.delete.useMutation({
    onSuccess: () => {
      toast.success("Cotação excluída com sucesso");
      setLocation("/quotations");
    },
    onError: (error) => {
      toast.error("Erro ao excluir: " + error.message);
    },
  });
  
  const generateReportMutation = trpc.quotations.generateReport.useMutation({
    onSuccess: (data) => {
      toast.success("Relatório PDF gerado com sucesso!");
      // Open PDF in new tab
      window.open(data.url, "_blank");
    },
    onError: (error) => {
      toast.error("Erro ao gerar relatório: " + error.message);
    },
  });
  
  const generateExcelMutation = trpc.quotations.generateExcelReport.useMutation({
    onSuccess: (data) => {
      toast.success("Relatório Excel gerado com sucesso!");
      // Download Excel file
      window.open(data.url, "_blank");
    },
    onError: (error) => {
      toast.error("Erro ao gerar Excel: " + error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-semibold mb-2">Cotação não encontrada</h2>
        <Link href="/quotations">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para lista
          </Button>
        </Link>
      </div>
    );
  }

  const status = statusConfig[quotation.status] || statusConfig.draft;
  const StatusIcon = status.icon;
  const calculations = quotation.calculations || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/quotations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                {quotation.supplierName || "Cotação"} 
                {quotation.quotationNumber && ` #${quotation.quotationNumber}`}
              </h1>
              <Badge variant="secondary" className={`${status.color} text-white`}>
                {status.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {quotation.supplierCountry || quotation.originCountry} • 
              Criado em {new Date(quotation.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={quotation.status}
            onValueChange={(value) => updateMutation.mutate({ id: quotationId, status: value as any })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Alterar status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            onClick={() => generateReportMutation.mutate({ quotationId })}
            disabled={generateReportMutation.isPending || calculations.length === 0}
          >
            {generateReportMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            PDF
          </Button>
          <Button 
            variant="default"
            onClick={() => generateExcelMutation.mutate({ quotationId })}
            disabled={generateExcelMutation.isPending || calculations.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {generateExcelMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Excel
          </Button>
          <Button 
            variant="destructive" 
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">Valor FOB</span>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(quotation.totalFobCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Package className="h-4 w-4" />
              <span className="text-sm">Valor CIF</span>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(quotation.totalCifCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Percent className="h-4 w-4" />
              <span className="text-sm">Total Impostos</span>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(quotation.totalTaxesCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Custo Total</span>
            </div>
            <div className="text-2xl font-bold text-primary">{formatCurrency(quotation.totalCostCents)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Informações da Cotação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Fornecedor</p>
                <p className="font-medium">{quotation.supplierName || "Não informado"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">País de Origem</p>
                <p className="font-medium">{quotation.supplierCountry || quotation.originCountry || "Não informado"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Moeda</p>
                <p className="font-medium">{quotation.currency || "USD"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Câmbio</p>
                <p className="font-medium">
                  {quotation.exchangeRate 
                    ? `R$ ${(quotation.exchangeRate / 1000000).toFixed(4)}`
                    : "Não informado"
                  }
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado de Destino</p>
                <p className="font-medium">{quotation.destinationState || "SC"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mercosul</p>
                <p className="font-medium">{quotation.isMercosul ? "Sim (Isenção II)" : "Não"}</p>
              </div>
            </div>
            
            <Separator />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Frete</p>
                <p className="font-medium">{formatCurrency(quotation.freightCents)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Seguro</p>
                <p className="font-medium">{formatCurrency(quotation.insuranceCents)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Despachante</p>
                <p className="font-medium">{formatCurrency(quotation.customsBrokerCents)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Armazenagem</p>
                <p className="font-medium">{formatCurrency(quotation.storageCents)}</p>
              </div>
            </div>
            
            {quotation.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Observações</p>
                  <p className="text-sm">{quotation.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Timeline / Status */}
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>Acompanhamento do processo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Cotação Criada</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(quotation.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              
              {quotation.quotationDate && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Data da Cotação</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(quotation.quotationDate).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              )}
              
              {quotation.orderDate && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <FileCheck className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Pedido Realizado</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(quotation.orderDate).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              )}
              
              {quotation.shipmentDate && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Ship className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Embarcado</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(quotation.shipmentDate).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              )}
              
              {quotation.customsClearanceDate && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                    <FileCheck className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Desembaraçado</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(quotation.customsClearanceDate).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              )}
              
              {quotation.completionDate && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Concluído</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(quotation.completionDate).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products/Calculations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos da Cotação</CardTitle>
          <CardDescription>
            {calculations.length} produto(s) calculado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calculations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">FOB</TableHead>
                  <TableHead className="text-right">Impostos</TableHead>
                  <TableHead className="text-right">Custo Total</TableHead>
                  <TableHead className="text-right">Custo Unit.</TableHead>
                  <TableHead className="text-right">Preço Sugerido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calculations.map((calc: any) => (
                  <TableRow key={calc.id}>
                    <TableCell className="font-medium">{calc.productName}</TableCell>
                    <TableCell>{calc.ncmCode}</TableCell>
                    <TableCell className="text-right">{calc.quantity} {calc.unit}</TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.fobValueCents)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        calc.iiValueCents + calc.ipiValueCents + calc.pisValueCents + 
                        calc.cofinsValueCents + calc.icmsValueCents
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.totalCostCents)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.unitCostCents)}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatCurrency(calc.suggestedPriceCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum produto calculado para esta cotação</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
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
              onClick={() => deleteMutation.mutate({ id: quotationId })}
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
