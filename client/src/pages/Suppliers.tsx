import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Building2, 
  Plus, 
  Pencil, 
  Trash2, 
  Mail, 
  Phone, 
  MapPin,
  Globe,
  User,
  Loader2
} from "lucide-react";

interface SupplierFormData {
  name: string;
  country: string;
  city: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  isMercosul: boolean;
}

const initialFormData: SupplierFormData = {
  name: "",
  country: "",
  city: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
  isMercosul: false,
};

function SupplierForm({ 
  data, 
  onChange, 
  onSubmit, 
  loading,
  submitLabel = "Salvar"
}: { 
  data: SupplierFormData;
  onChange: (data: SupplierFormData) => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome da Empresa *</Label>
          <Input
            id="name"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Ex: Fábrica ABC"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">País *</Label>
          <Input
            id="country"
            value={data.country}
            onChange={(e) => onChange({ ...data, country: e.target.value })}
            placeholder="Ex: Paraguai"
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="city">Cidade</Label>
        <Input
          id="city"
          value={data.city}
          onChange={(e) => onChange({ ...data, city: e.target.value })}
          placeholder="Ex: Ciudad del Este"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactName">Nome do Contato</Label>
          <Input
            id="contactName"
            value={data.contactName}
            onChange={(e) => onChange({ ...data, contactName: e.target.value })}
            placeholder="Ex: Juan Pérez"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactEmail">E-mail</Label>
          <Input
            id="contactEmail"
            type="email"
            value={data.contactEmail}
            onChange={(e) => onChange({ ...data, contactEmail: e.target.value })}
            placeholder="Ex: contato@empresa.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactPhone">Telefone</Label>
        <Input
          id="contactPhone"
          value={data.contactPhone}
          onChange={(e) => onChange({ ...data, contactPhone: e.target.value })}
          placeholder="Ex: +595 21 123456"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          placeholder="Informações adicionais sobre o fornecedor..."
          rows={3}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isMercosul"
          checked={data.isMercosul}
          onCheckedChange={(checked) => onChange({ ...data, isMercosul: checked as boolean })}
        />
        <Label htmlFor="isMercosul" className="text-sm font-normal">
          Fornecedor do Mercosul (elegível para isenção de II)
        </Label>
      </div>

      <DialogFooter>
        <Button onClick={onSubmit} disabled={loading || !data.name || !data.country}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function Suppliers() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);

  const { data: suppliers, isLoading } = trpc.suppliers.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor cadastrado com sucesso");
      setIsCreateOpen(false);
      setFormData(initialFormData);
      utils.suppliers.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao cadastrar: ${error.message}`);
    },
  });

  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor atualizado com sucesso");
      setEditingId(null);
      setFormData(initialFormData);
      utils.suppliers.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor excluído com sucesso");
      utils.suppliers.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: formData.name,
      country: formData.country,
      city: formData.city || undefined,
      contactName: formData.contactName || undefined,
      contactEmail: formData.contactEmail || undefined,
      contactPhone: formData.contactPhone || undefined,
      notes: formData.notes || undefined,
      isMercosul: formData.isMercosul,
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      name: formData.name,
      country: formData.country,
      city: formData.city || undefined,
      contactName: formData.contactName || undefined,
      contactEmail: formData.contactEmail || undefined,
      contactPhone: formData.contactPhone || undefined,
      notes: formData.notes || undefined,
      isMercosul: formData.isMercosul,
    });
  };

  const openEdit = (supplier: typeof suppliers extends (infer T)[] | undefined ? T : never) => {
    if (!supplier) return;
    setFormData({
      name: supplier.name,
      country: supplier.country,
      city: supplier.city || "",
      contactName: supplier.contactName || "",
      contactEmail: supplier.contactEmail || "",
      contactPhone: supplier.contactPhone || "",
      notes: supplier.notes || "",
      isMercosul: supplier.isMercosul,
    });
    setEditingId(supplier.id);
  };

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
          <h1 className="text-3xl font-bold">Fornecedores</h1>
          <p className="text-muted-foreground">
            Gerencie seus fornecedores internacionais
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => setFormData(initialFormData)}>
              <Plus className="h-4 w-4" />
              Novo Fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cadastrar Fornecedor</DialogTitle>
              <DialogDescription>
                Adicione um novo fornecedor internacional
              </DialogDescription>
            </DialogHeader>
            <SupplierForm
              data={formData}
              onChange={setFormData}
              onSubmit={handleCreate}
              loading={createMutation.isPending}
              submitLabel="Cadastrar"
            />
          </DialogContent>
        </Dialog>
      </div>

      {!suppliers || suppliers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum fornecedor cadastrado</h3>
            <p className="text-muted-foreground mb-4">
              Comece cadastrando seu primeiro fornecedor
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Fornecedor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((supplier) => (
            <Card key={supplier.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{supplier.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{supplier.country}</span>
                        {supplier.isMercosul && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            Mercosul
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {supplier.city && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{supplier.city}</span>
                  </div>
                )}
                {supplier.contactName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{supplier.contactName}</span>
                  </div>
                )}
                {supplier.contactEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{supplier.contactEmail}</span>
                  </div>
                )}
                {supplier.contactPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{supplier.contactPhone}</span>
                  </div>
                )}
                
                <div className="flex gap-2 pt-3 border-t">
                  <Dialog open={editingId === supplier.id} onOpenChange={(open) => !open && setEditingId(null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(supplier)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Editar Fornecedor</DialogTitle>
                        <DialogDescription>
                          Atualize as informações do fornecedor
                        </DialogDescription>
                      </DialogHeader>
                      <SupplierForm
                        data={formData}
                        onChange={setFormData}
                        onSubmit={handleUpdate}
                        loading={updateMutation.isPending}
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
                        <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O fornecedor "{supplier.name}" será permanentemente excluído.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => deleteMutation.mutate({ id: supplier.id })}
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
