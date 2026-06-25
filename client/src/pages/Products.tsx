import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  Package, 
  Plus, 
  Pencil, 
  Trash2, 
  Barcode,
  Scale,
  Box,
  Loader2,
  TrendingUp
} from "lucide-react";
import { NCMAutocomplete } from "@/components/NCMAutocomplete";
import { PriceHistoryView } from "@/components/PriceHistoryView";

interface ProductFormData {
  name: string;
  description: string;
  ncmCode: string;
  unit: string;
  weightKg: number | null;
  volumeM3: number | null;
  supplierId: number | null;
}

const initialFormData: ProductFormData = {
  name: "",
  description: "",
  ncmCode: "",
  unit: "UN",
  weightKg: null,
  volumeM3: null,
  supplierId: null,
};

function ProductForm({ 
  data, 
  onChange, 
  onSubmit, 
  loading,
  suppliers,
  submitLabel = "Salvar"
}: { 
  data: ProductFormData;
  onChange: (data: ProductFormData) => void;
  onSubmit: () => void;
  loading: boolean;
  suppliers: Array<{ id: number; name: string }>;
  submitLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do Produto *</Label>
        <Input
          id="name"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="Ex: Pregos de Aço 2.5x50mm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Descrição detalhada do produto..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ncmCode">Código NCM *</Label>
        <NCMAutocomplete
          value={data.ncmCode}
          onChange={(ncmCode) => onChange({ ...data, ncmCode })}
          productName={data.name}
          productDescription={data.description}
          placeholder="Digite o código NCM ou busque por descrição"
        />
        <p className="text-xs text-muted-foreground">
          Clique no botão ✨ para a SOFIA sugerir a NCM ideal com otimização tributária
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="unit">Unidade de Medida</Label>
        <Select value={data.unit} onValueChange={(v) => onChange({ ...data, unit: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UN">Unidade (UN)</SelectItem>
            <SelectItem value="KG">Quilograma (KG)</SelectItem>
            <SelectItem value="TON">Tonelada (TON)</SelectItem>
            <SelectItem value="CX">Caixa (CX)</SelectItem>
            <SelectItem value="PC">Peça (PC)</SelectItem>
            <SelectItem value="M">Metro (M)</SelectItem>
            <SelectItem value="M2">Metro² (M²)</SelectItem>
            <SelectItem value="M3">Metro³ (M³)</SelectItem>
            <SelectItem value="L">Litro (L)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="weightKg">Peso (kg)</Label>
          <Input
            id="weightKg"
            type="number"
            step="0.001"
            min="0"
            value={data.weightKg ?? ""}
            onChange={(e) => onChange({ ...data, weightKg: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="Ex: 25.5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="volumeM3">Volume (m³)</Label>
          <Input
            id="volumeM3"
            type="number"
            step="0.001"
            min="0"
            value={data.volumeM3 ?? ""}
            onChange={(e) => onChange({ ...data, volumeM3: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="Ex: 0.05"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="supplier">Fornecedor</Label>
        <Select 
          value={data.supplierId?.toString() || "none"} 
          onValueChange={(v) => onChange({ ...data, supplierId: v === "none" ? null : parseInt(v) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione um fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button onClick={onSubmit} disabled={loading || !data.name || !data.ncmCode}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function Products() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);

  const { data: products, isLoading } = trpc.products.list.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      toast.success("Produto cadastrado com sucesso");
      setIsCreateOpen(false);
      setFormData(initialFormData);
      utils.products.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao cadastrar: ${error.message}`);
    },
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success("Produto atualizado com sucesso");
      setEditingId(null);
      setFormData(initialFormData);
      utils.products.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success("Produto excluído com sucesso");
      utils.products.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      description: formData.description || undefined,
      ncmCode: formData.ncmCode,
      unit: formData.unit,
      weightKg: formData.weightKg ?? undefined,
      volumeM3: formData.volumeM3 ?? undefined,
      supplierId: formData.supplierId ?? undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      name: formData.name,
      description: formData.description || undefined,
      ncmCode: formData.ncmCode,
      unit: formData.unit,
      weightKg: formData.weightKg ?? undefined,
      volumeM3: formData.volumeM3 ?? undefined,
      supplierId: formData.supplierId ?? undefined,
    });
  };

  const openEdit = (product: typeof products extends (infer T)[] | undefined ? T : never) => {
    if (!product) return;
    setFormData({
      name: product.name,
      description: product.description || "",
      ncmCode: product.ncmCode,
      unit: product.unit,
      weightKg: product.weightKg,
      volumeM3: product.volumeM3,
      supplierId: product.supplierId,
    });
    setEditingId(product.id);
  };

  const suppliersList = suppliers?.map(s => ({ id: s.id, name: s.name })) || [];

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">
            Gerencie seu catálogo de produtos para importação
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => setFormData(initialFormData)}>
              <Plus className="h-4 w-4" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cadastrar Produto</DialogTitle>
              <DialogDescription>
                Adicione um novo produto ao catálogo
              </DialogDescription>
            </DialogHeader>
            <ProductForm
              data={formData}
              onChange={setFormData}
              onSubmit={handleCreate}
              loading={createMutation.isPending}
              suppliers={suppliersList}
              submitLabel="Cadastrar"
            />
          </DialogContent>
        </Dialog>
      </div>

      {!products || products.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum produto cadastrado</h3>
            <p className="text-muted-foreground mb-4">
              Comece cadastrando seu primeiro produto
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Produto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{product.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Barcode className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground font-mono">{product.ncmCode}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {product.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                )}
                
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{product.unit}</Badge>
                  {product.weightKg && (
                    <Badge variant="outline" className="gap-1">
                      <Scale className="h-3 w-3" />
                      {product.weightKg} kg
                    </Badge>
                  )}
                  {product.volumeM3 && (
                    <Badge variant="outline" className="gap-1">
                      <Box className="h-3 w-3" />
                      {product.volumeM3} m³
                    </Badge>
                  )}
                </div>

                {product.supplierId && suppliers && (
                  <div className="text-sm text-muted-foreground">
                    Fornecedor: {suppliers.find(s => s.id === product.supplierId)?.name || "-"}
                  </div>
                )}
                
                <div className="flex gap-2 pt-3 border-t">
                  <ProductPriceHistoryDialog productName={product.name} />
                  <Dialog open={editingId === product.id} onOpenChange={(open) => !open && setEditingId(null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(product)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Editar Produto</DialogTitle>
                        <DialogDescription>
                          Atualize as informações do produto
                        </DialogDescription>
                      </DialogHeader>
                      <ProductForm
                        data={formData}
                        onChange={setFormData}
                        onSubmit={handleUpdate}
                        loading={updateMutation.isPending}
                        suppliers={suppliersList}
                        submitLabel="Salvar Alterações"
                      />
                    </DialogContent>
                  </Dialog>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O produto "{product.name}" será permanentemente excluído.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => deleteMutation.mutate({ id: product.id })}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** Botão + diálogo com a evolução cronológica de preço do produto (todos os fornecedores). */
function ProductPriceHistoryDialog({ productName }: { productName: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = trpc.proforma.productPriceHistory.useQuery(
    { productName },
    { enabled: open }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1">
          <TrendingUp className="h-4 w-4 mr-1" />
          Histórico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Histórico de preços — {productName}</DialogTitle>
          <DialogDescription>
            Evolução cronológica entre fornecedores e custo estimado posto no Brasil há época.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Carregando histórico...
          </div>
        ) : !data || data.points.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma cotação registrada para este produto ainda. Suba proformas para alimentar o histórico.
          </p>
        ) : (
          <PriceHistoryView points={data.points} />
        )}
      </DialogContent>
    </Dialog>
  );
}
