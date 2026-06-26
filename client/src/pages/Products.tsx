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
  TrendingUp,
  Search,
  X,
  Layers,
  AlertTriangle,
  Building2,
  Tag as TagIcon,
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);

  // Busca e filtros
  const [search, setSearch] = useState("");
  const [classeFilter, setClasseFilter] = useState("all");
  const [critFilter, setCritFilter] = useState("all");

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

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, ...buildPayload() });
  };

  const openEdit = (product: NonNullable<typeof products>[number]) => {
    if (!product) return;
    setFormData({
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
    setEditingId(product.id);
  };

  const suppliersList = suppliers?.map((s) => ({ id: s.id, name: s.name })) || [];
  const supplierName = (id: number | null) =>
    id ? suppliers?.find((s) => s.id === id)?.name ?? null : null;

  // Classes presentes nos dados (para o filtro dinâmico).
  const classesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p) => p.classe && set.add(p.classe));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  // Aplica busca + filtros.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (classeFilter !== "all" && (p.classe || "") !== classeFilter) return false;
      if (critFilter !== "all" && (p.criticidade || "") !== critFilter) return false;
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
    });
  }, [products, search, classeFilter, critFilter, suppliers]);

  const hasFilters = search.trim() !== "" || classeFilter !== "all" || critFilter !== "all";

  // Agrupa o catálogo por CATEGORIA (fallback: classe → "Sem categoria"),
  // para Ativos & Insumos ficar organizado por seções em vez de itens soltos.
  // "Sem categoria" sempre por último.
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const key = p.categoria?.trim() || p.classe?.trim() || "Sem categoria";
      const arr = groups.get(key);
      if (arr) arr.push(p);
      else groups.set(key, [p]);
    }
    return Array.from(groups.entries())
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => {
        if (a.key === "Sem categoria") return 1;
        if (b.key === "Sem categoria") return -1;
        return a.key.localeCompare(b.key, "pt-BR");
      });
  }, [filtered]);

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
    <div className="space-y-6">
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

      {/* Barra de busca + filtros */}
      {products && products.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, NCM, classe, fornecedor, tag…"
              className="pl-9"
            />
          </div>
          <Select value={classeFilter} onValueChange={setClasseFilter}>
            <SelectTrigger className="sm:w-52">
              <Layers className="mr-1 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Classe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as classes</SelectItem>
              {classesDisponiveis.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={critFilter} onValueChange={setCritFilter}>
            <SelectTrigger className="sm:w-44">
              <AlertTriangle className="mr-1 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Criticidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda criticidade</SelectItem>
              <SelectItem value="alta">Alta (crítico)</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setClasseFilter("all");
                setCritFilter("all");
              }}
            >
              <X className="mr-1 h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>
      )}

      {!products || products.length === 0 ? (
        <Card>
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
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-1">Nenhum resultado</h3>
            <p className="text-muted-foreground">
              Ajuste a busca ou os filtros para encontrar o que procura.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "item" : "itens"}
            {hasFilters ? ` de ${products.length}` : ""}
          </p>
          {groupedProducts.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-center gap-2 border-b pb-1.5">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{group.key}</h2>
                <Badge variant="secondary" className="ml-1">
                  {group.items.length}
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((product) => {
              const crit = product.criticidade
                ? CRIT_META[product.criticidade as "alta" | "media" | "baixa"]
                : null;
              const tags = (product.tags as string[] | null) ?? [];
              const forn = supplierName(product.supplierId) ?? product.latestPrice?.supplierName ?? null;
              return (
                <Card key={product.id} className="flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base leading-snug">{product.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Barcode className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground font-mono">
                            {product.ncmCode}
                          </span>
                        </div>
                      </div>
                      {crit && (
                        <Badge variant="outline" className={`flex-shrink-0 ${crit.badge}`}>
                          {crit.label}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col space-y-3">
                    {/* Classe / categoria */}
                    {(product.classe || product.categoria) && (
                      <div className="flex flex-wrap gap-2">
                        {product.classe && (
                          <Badge variant="secondary" className="gap-1">
                            <Layers className="h-3 w-3" />
                            {product.classe}
                          </Badge>
                        )}
                        {product.categoria && (
                          <Badge variant="outline">
                            {product.categoria}
                            {product.subcategoria ? ` › ${product.subcategoria}` : ""}
                          </Badge>
                        )}
                      </div>
                    )}

                    {product.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    {/* Preço (última cotação) + formato */}
                    <div className="flex items-end justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Última cotação
                        </p>
                        {product.latestPrice ? (
                          <>
                            <p className="text-lg font-semibold leading-tight">
                              {fmtMoney(product.latestPrice.unitPriceCents, product.latestPrice.currency)}
                              <span className="text-xs font-normal text-muted-foreground">
                                {" "}
                                /{product.unit}
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {fmtDate(product.latestPrice.quotationDate)}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem cotação</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline">{product.unit}</Badge>
                        {product.weightKg ? (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Scale className="h-3 w-3" />
                            {product.weightKg} kg
                          </span>
                        ) : product.volumeM3 ? (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Box className="h-3 w-3" />
                            {product.volumeM3} m³
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Fornecedor */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{forn ?? "Fornecedor não informado"}</span>
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TagIcon className="h-3 w-3 text-muted-foreground" />
                        {tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700"
                          >
                            {t}
                          </span>
                        ))}
                        {tags.length > 4 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-auto flex gap-2 pt-3 border-t">
                      <ProductPriceHistoryDialog productName={product.name} />
                      <Dialog
                        open={editingId === product.id}
                        onOpenChange={(open) => !open && setEditingId(null)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openEdit(product)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Editar Produto</DialogTitle>
                            <DialogDescription>Atualize as informações do produto</DialogDescription>
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. O produto "{product.name}" será
                              permanentemente excluído.
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
              );
                })}
              </div>
            </section>
          ))}
        </>
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
