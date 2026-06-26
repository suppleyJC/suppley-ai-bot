import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  TrendingUp,
  Search,
  X,
  Layers,
  AlertTriangle,
  Building2,
  Tag as TagIcon,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { NCMAutocomplete } from "@/components/NCMAutocomplete";
import { PriceHistoryView } from "@/components/PriceHistoryView";

type Criticidade = "alta" | "media" | "baixa" | "";

interface ProductFormData {
  name: string;
  description: string;
  ncmCode: string;
  unit: string;
  weightKg: number | null;
  volumeM3: number | null;
  supplierId: number | null;
  classe: string;
  criticidade: Criticidade;
  categoria: string;
  subcategoria: string;
  aplicacao: string;
  tags: string[];
}

const initialFormData: ProductFormData = {
  name: "",
  description: "",
  ncmCode: "",
  unit: "UN",
  weightKg: null,
  volumeM3: null,
  supplierId: null,
  classe: "",
  criticidade: "",
  categoria: "",
  subcategoria: "",
  aplicacao: "",
  tags: [],
};

// Classes operacionais sugeridas (free-text via datalist — escalável).
const CLASSES_SUGERIDAS = [
  "Fixadores",
  "Escoramento e Estruturas",
  "Acessórios e Componentes",
  "EPI",
  "Ferramentas",
  "Consumíveis",
  "Elétricos",
  "Hidráulicos",
  "Acabamento",
  "Embalagem",
];

const CRIT_META: Record<
  "alta" | "media" | "baixa",
  { label: string; badge: string; dot: string }
> = {
  alta: { label: "Crítico", badge: "bg-red-50 text-red-700 border-red-200", dot: "#ef4444" },
  media: { label: "Médio", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "#f59e0b" },
  baixa: { label: "Baixo", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "#10b981" },
};

function fmtMoney(cents: number, currency: string): string {
  const v = cents / 100;
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency });
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Input de tags: adiciona com Enter/vírgula, remove clicando no X. */
function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? "" : "galvanizado, importado, alto-giro…"}
        className="flex-1 min-w-[8rem] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function ProductForm({
  data,
  onChange,
  onSubmit,
  loading,
  suppliers,
  submitLabel = "Salvar",
}: {
  data: ProductFormData;
  onChange: (data: ProductFormData) => void;
  onSubmit: () => void;
  loading: boolean;
  suppliers: Array<{ id: number; name: string }>;
  submitLabel?: string;
}) {
  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto px-1">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do Produto *</Label>
        <Input
          id="name"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="Ex: Prego cabeça simples 17x27"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição / Ficha técnica</Label>
        <Textarea
          id="description"
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Especificações técnicas completas do produto..."
          rows={2}
        />
      </div>

      {/* Classificação */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="classe">Classe de item</Label>
          <Input
            id="classe"
            list="classes-sugeridas"
            value={data.classe}
            onChange={(e) => onChange({ ...data, classe: e.target.value })}
            placeholder="Ex: Fixadores"
          />
          <datalist id="classes-sugeridas">
            {CLASSES_SUGERIDAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="criticidade">Criticidade</Label>
          <Select
            value={data.criticidade || "none"}
            onValueChange={(v) =>
              onChange({ ...data, criticidade: v === "none" ? "" : (v as Criticidade) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não definida</SelectItem>
              <SelectItem value="alta">Alta (crítico)</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoria</Label>
          <Input
            id="categoria"
            value={data.categoria}
            onChange={(e) => onChange({ ...data, categoria: e.target.value })}
            placeholder="Ex: Construção"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subcategoria">Subcategoria</Label>
          <Input
            id="subcategoria"
            value={data.subcategoria}
            onChange={(e) => onChange({ ...data, subcategoria: e.target.value })}
            placeholder="Ex: Fixação metálica"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="aplicacao">Aplicação</Label>
        <Input
          id="aplicacao"
          value={data.aplicacao}
          onChange={(e) => onChange({ ...data, aplicacao: e.target.value })}
          placeholder="Onde/como o item é usado"
        />
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        <TagsInput value={data.tags} onChange={(tags) => onChange({ ...data, tags })} />
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
          Clique no botão ✨ para a Excambia sugerir a NCM ideal com otimização tributária
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
            <SelectItem value="PCT">Pacote (PCT)</SelectItem>
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
            onChange={(e) =>
              onChange({ ...data, weightKg: e.target.value ? parseFloat(e.target.value) : null })
            }
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
            onChange={(e) =>
              onChange({ ...data, volumeM3: e.target.value ? parseFloat(e.target.value) : null })
            }
            placeholder="Ex: 0.05"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="supplier">Fornecedor</Label>
        <Select
          value={data.supplierId?.toString() || "none"}
          onValueChange={(v) =>
            onChange({ ...data, supplierId: v === "none" ? null : parseInt(v) })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione um fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id.toString()}>
                {s.name}
              </SelectItem>
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
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Busca e filtros facetados
  const [search, setSearch] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<number>>(new Set());
  const [selectedCriticidades, setSelectedCriticidades] = useState<Set<string>>(new Set());
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "price" | "date">("name");

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

  const buildPayload = () => ({
    name: formData.name,
    description: formData.description || undefined,
    ncmCode: formData.ncmCode,
    unit: formData.unit,
    weightKg: formData.weightKg ?? undefined,
    volumeM3: formData.volumeM3 ?? undefined,
    supplierId: formData.supplierId ?? undefined,
    classe: formData.classe || undefined,
    criticidade: formData.criticidade || undefined,
    categoria: formData.categoria || undefined,
    subcategoria: formData.subcategoria || undefined,
    aplicacao: formData.aplicacao || undefined,
    tags: formData.tags.length ? formData.tags : undefined,
  });

  const handleCreate = () => {
    createMutation.mutate(buildPayload());
  };



  const suppliersList = suppliers?.map((s) => ({ id: s.id, name: s.name })) || [];
  const supplierName = (id: number | null) =>
    id ? suppliers?.find((s) => s.id === id)?.name ?? null : null;

  // Coleta todos os valores únicos para filtros facetados
  const facets = useMemo(() => {
    const classes = new Set<string>();
    const categories = new Set<string>();
    const supplierIds = new Set<number>();
    let minPrice = Infinity;
    let maxPrice = 0;

    (products ?? []).forEach((p) => {
      if (p.classe) classes.add(p.classe);
      if (p.categoria) categories.add(p.categoria);
      if (p.supplierId) supplierIds.add(p.supplierId);
      if (p.latestPrice?.unitPriceCents) {
        minPrice = Math.min(minPrice, p.latestPrice.unitPriceCents);
        maxPrice = Math.max(maxPrice, p.latestPrice.unitPriceCents);
      }
    });

    return {
      classes: Array.from(classes).sort((a, b) => a.localeCompare(b, "pt-BR")),
      categories: Array.from(categories).sort((a, b) => a.localeCompare(b, "pt-BR")),
      supplierIds: Array.from(supplierIds),
      priceRange: minPrice === Infinity ? null : [minPrice / 100, maxPrice / 100],
    };
  }, [products]);

  // Aplica todos os filtros facetados + busca
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => {
        if (selectedClasses.size > 0 && !selectedClasses.has(p.classe || "")) return false;
        if (selectedCategories.size > 0 && !selectedCategories.has(p.categoria || "")) return false;
        if (selectedSuppliers.size > 0 && !selectedSuppliers.has(p.supplierId || -1)) return false;
        if (selectedCriticidades.size > 0 && !selectedCriticidades.has(p.criticidade || "")) return false;

        if (priceRange && p.latestPrice?.unitPriceCents) {
          const price = p.latestPrice.unitPriceCents / 100;
          if (price < priceRange[0] || price > priceRange[1]) return false;
        }

        if (!q) return true;
        const tags = ((p.tags as string[] | null) ?? []).join(" ");
        const haystack = [
          p.name,
          p.ncmCode,
          p.classe,
          p.categoria,
          p.subcategoria,
          p.aplicacao,
          p.description,
          supplierName(p.supplierId),
          p.latestPrice?.supplierName,
          tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
        if (sortBy === "price") {
          const aPrice = a.latestPrice?.unitPriceCents ?? Infinity;
          const bPrice = b.latestPrice?.unitPriceCents ?? Infinity;
          return aPrice - bPrice;
        }
        if (sortBy === "date") {
          const aDate = a.latestPrice?.quotationDate ?? "";
          const bDate = b.latestPrice?.quotationDate ?? "";
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        }
        return 0;
      });
  }, [
    products,
    search,
    selectedClasses,
    selectedCategories,
    selectedSuppliers,
    selectedCriticidades,
    priceRange,
    sortBy,
    suppliers,
  ]);

  const hasFilters =
    search.trim() !== "" ||
    selectedClasses.size > 0 ||
    selectedCategories.size > 0 ||
    selectedSuppliers.size > 0 ||
    selectedCriticidades.size > 0 ||
    priceRange !== null;

  const clearAllFilters = () => {
    setSearch("");
    setSelectedClasses(new Set());
    setSelectedCategories(new Set());
    setSelectedSuppliers(new Set());
    setSelectedCriticidades(new Set());
    setPriceRange(null);
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
        <Skeleton className="h-10" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b">
        <div>
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">
            Gerencie seu catálogo de produtos para importação
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-fit" onClick={() => setFormData(initialFormData)}>
              <Plus className="h-4 w-4" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cadastrar Produto</DialogTitle>
              <DialogDescription>Adicione um novo produto ao catálogo</DialogDescription>
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

      {/* Search + View Toggle */}
      {products && products.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center gap-3 py-4 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, NCM, classe, fornecedor…"
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="gap-2 md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </Button>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="md:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Ordenar por nome</SelectItem>
              <SelectItem value="price">Ordenar por preço</SelectItem>
              <SelectItem value="date">Mais recente primeiro</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <X className="mr-1 h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>
      )}

      {!products || products.length === 0 ? (
        <Card className="flex-1 flex items-center justify-center">
          <CardContent className="py-16 text-center">
            <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum produto cadastrado</h3>
            <p className="text-muted-foreground mb-4">Comece cadastrando seu primeiro produto</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Produto
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex-1 flex items-center justify-center">
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-1">Nenhum resultado</h3>
            <p className="text-muted-foreground">
              Ajuste a busca ou os filtros para encontrar o que procura.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6 flex-1 min-h-0 py-4">
          {/* Sidebar Filtros */}
          <aside
            className={`${
              sidebarOpen ? "w-64" : "hidden"
            } md:block md:w-64 flex-shrink-0 border-r pr-4 overflow-y-auto`}
          >
            <div className="space-y-6">
              {/* Classes */}
              {facets.classes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Classes
                  </h3>
                  <div className="space-y-2">
                    {facets.classes.map((cls) => {
                      const count = products?.filter((p) => p.classe === cls).length ?? 0;
                      return (
                        <label key={cls} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={selectedClasses.has(cls)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedClasses);
                              if (checked) newSet.add(cls);
                              else newSet.delete(cls);
                              setSelectedClasses(newSet);
                            }}
                          />
                          <span className="text-sm flex-1">{cls}</span>
                          <span className="text-xs text-muted-foreground">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Categories */}
              {facets.categories.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Categorias</h3>
                  <div className="space-y-2">
                    {facets.categories.map((cat) => {
                      const count = products?.filter((p) => p.categoria === cat).length ?? 0;
                      return (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={selectedCategories.has(cat)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedCategories);
                              if (checked) newSet.add(cat);
                              else newSet.delete(cat);
                              setSelectedCategories(newSet);
                            }}
                          />
                          <span className="text-sm flex-1">{cat}</span>
                          <span className="text-xs text-muted-foreground">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Criticidade */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Criticidade
                </h3>
                <div className="space-y-2">
                  {Object.entries(CRIT_META).map(([value, meta]) => {
                    const count = products?.filter((p) => p.criticidade === value).length ?? 0;
                    return (
                      <label key={value} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={selectedCriticidades.has(value)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedCriticidades);
                            if (checked) newSet.add(value);
                            else newSet.delete(value);
                            setSelectedCriticidades(newSet);
                          }}
                        />
                        <span className="text-sm flex-1">{meta.label}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Suppliers */}
              {facets.supplierIds.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Fornecedores
                  </h3>
                  <div className="space-y-2">
                    {facets.supplierIds.map((supplierId) => {
                      const name = supplierName(supplierId) || `Fornecedor ${supplierId}`;
                      const count = products?.filter((p) => p.supplierId === supplierId).length ?? 0;
                      return (
                        <label key={supplierId} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={selectedSuppliers.has(supplierId)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedSuppliers);
                              if (checked) newSet.add(supplierId);
                              else newSet.delete(supplierId);
                              setSelectedSuppliers(newSet);
                            }}
                          />
                          <span className="text-sm flex-1 truncate">{name}</span>
                          <span className="text-xs text-muted-foreground">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Main Table Area */}
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="text-sm text-muted-foreground mb-4">
              {filtered.length} {filtered.length === 1 ? "item" : "itens"}
              {hasFilters ? ` de ${products.length}` : ""}
            </p>
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50">
                  <TableRow>
                    <TableHead className="w-32">Produto</TableHead>
                    <TableHead className="w-24">Classe</TableHead>
                    <TableHead className="w-24">Categoria</TableHead>
                    <TableHead className="w-32">Fornecedor</TableHead>
                    <TableHead className="text-right w-28">Preço</TableHead>
                    <TableHead className="text-center w-24">Data</TableHead>
                    <TableHead className="text-center w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => {
                    const forn = supplierName(product.supplierId) ?? product.latestPrice?.supplierName ?? "—";
                    const crit = product.criticidade
                      ? CRIT_META[product.criticidade as "alta" | "media" | "baixa"]
                      : null;
                    return (
                      <TableRow key={product.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{product.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {product.ncmCode}
                            </div>
                            {crit && (
                              <Badge variant="outline" className={`mt-1 ${crit.badge}`}>
                                {crit.label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{product.classe || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {product.categoria || "—"}
                            {product.subcategoria && (
                              <div className="text-xs text-muted-foreground">{product.subcategoria}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm truncate max-w-[128px] block">{forn}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {product.latestPrice ? (
                            <div className="text-sm font-medium">
                              {fmtMoney(product.latestPrice.unitPriceCents, product.latestPrice.currency)}
                              <div className="text-xs text-muted-foreground">
                                /{product.unit}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem cotação</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {product.latestPrice ? fmtDate(product.latestPrice.quotationDate) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <ProductActionMenu
                              product={product}
                              onDelete={(id) => deleteMutation.mutate({ id })}
                              updateMutation={updateMutation}
                              suppliers={suppliersList}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ProductActionMenuProps {
  product: any;
  onDelete: (id: number) => void;
  updateMutation: any;
  suppliers: Array<{ id: number; name: string }>;
}

function ProductActionMenu({
  product,
  onDelete,
  updateMutation,
  suppliers,
}: ProductActionMenuProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<ProductFormData>(initialFormData);

  const handleOpenEdit = () => {
    setEditFormData({
      name: product.name,
      description: product.description || "",
      ncmCode: product.ncmCode,
      unit: product.unit,
      weightKg: product.weightKg,
      volumeM3: product.volumeM3,
      supplierId: product.supplierId,
      classe: product.classe || "",
      criticidade: (product.criticidade as Criticidade) || "",
      categoria: product.categoria || "",
      subcategoria: product.subcategoria || "",
      aplicacao: product.aplicacao || "",
      tags: (product.tags as string[] | null) ?? [],
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    const payload = {
      id: product.id,
      name: editFormData.name,
      description: editFormData.description || undefined,
      ncmCode: editFormData.ncmCode,
      unit: editFormData.unit,
      weightKg: editFormData.weightKg ?? undefined,
      volumeM3: editFormData.volumeM3 ?? undefined,
      supplierId: editFormData.supplierId ?? undefined,
      classe: editFormData.classe || undefined,
      criticidade: editFormData.criticidade || undefined,
      categoria: editFormData.categoria || undefined,
      subcategoria: editFormData.subcategoria || undefined,
      aplicacao: editFormData.aplicacao || undefined,
      tags: editFormData.tags.length ? editFormData.tags : undefined,
    };
    updateMutation.mutate(payload, {
      onSuccess: () => setIsEditOpen(false),
    });
  };

  return (
    <>
      <ProductPriceHistoryDialog productName={product.name} />
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenEdit}
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
            <DialogDescription>Atualize as informações do produto</DialogDescription>
          </DialogHeader>
          <ProductForm
            data={editFormData}
            onChange={setEditFormData}
            onSubmit={handleUpdate}
            loading={updateMutation.isPending}
            suppliers={suppliers}
            submitLabel="Salvar Alterações"
          />
        </DialogContent>
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" title="Excluir" className="text-destructive hover:text-destructive">
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
              onClick={() => onDelete(product.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
            Nenhuma cotação registrada para este produto ainda. Suba proformas para alimentar o
            histórico.
          </p>
        ) : (
          <PriceHistoryView points={data.points} />
        )}
      </DialogContent>
    </Dialog>
  );
}
