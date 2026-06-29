import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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
  Loader2,
  TrendingUp,
  Search,
  X,
  Layers,
  AlertTriangle,
  Building2,
  Tag as TagIcon,
  SlidersHorizontal,
  ChevronRight,
  Boxes,
  Scale,
  Box,
  Barcode,
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

/**
 * Normaliza nome para AGRUPAR variações do mesmo modelo (mesmo item de
 * fornecedores/preços diferentes). Tira acentos, unifica × / * → x, colapsa
 * espaços. Itens "parecidos mas com especificidades" (medidas/cores) têm nomes
 * diferentes e por isso continuam como modelos separados — sempre sob a mesma
 * classe macro.
 */
function normalizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[×✕*]/g, "x")
    .replace(/\s+/g, " ")
    .trim();
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

/** Um "modelo" = todas as variações com o mesmo nome normalizado. */
interface ModelGroup {
  key: string;
  name: string;
  ncmCode: string;
  classe: string | null;
  criticidade: string | null;
  description: string | null;
  primary: any;
  variants: any[];
  price: { unitPriceCents: number; currency: string; quotationDate: string | Date; supplierName: string | null } | null;
  suppliersCount: number;
}

export default function Products() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Busca + navegação por classe (macro) + criticidade + seleção do modelo
  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(null); // chave normalizada
  const [selectedCrit, setSelectedCrit] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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
    onError: (error) => toast.error(`Erro ao cadastrar: ${error.message}`),
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success("Produto atualizado com sucesso");
      setFormData(initialFormData);
      utils.products.list.invalidate();
    },
    onError: (error) => toast.error(`Erro ao atualizar: ${error.message}`),
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success("Produto excluído com sucesso");
      utils.products.list.invalidate();
    },
    onError: (error) => toast.error(`Erro ao excluir: ${error.message}`),
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

  const handleCreate = () => createMutation.mutate(buildPayload());

  const suppliersList = suppliers?.map((s) => ({ id: s.id, name: s.name })) || [];
  const supplierName = (id: number | null) =>
    id ? suppliers?.find((s) => s.id === id)?.name ?? null : null;

  // CLASSE MACRO — deduplicada por chave (trim + minúsculas), resolve "Pregos" x "Pregos ".
  const classFacets = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const p of products ?? []) {
      const raw = (p.classe || "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const e = m.get(key) ?? { label: raw, count: 0 };
      e.count++;
      m.set(key, e);
    }
    return Array.from(m.entries())
      .map(([key, v]) => ({ key, label: v.label, count: v.count }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [products]);

  const semClasse = useMemo(
    () => (products ?? []).filter((p) => !(p.classe || "").trim()).length,
    [products],
  );

  // Filtro: classe + criticidade + busca textual
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      const cls = (p.classe || "").trim().toLowerCase();
      if (selectedClass === "__none__" && cls) return false;
      if (selectedClass && selectedClass !== "__none__" && cls !== selectedClass) return false;
      if (selectedCrit.size > 0 && !selectedCrit.has(p.criticidade || "")) return false;
      if (!q) return true;
      const tags = ((p.tags as string[] | null) ?? []).join(" ");
      const haystack = [
        p.name, p.ncmCode, p.classe, p.categoria, p.subcategoria,
        p.aplicacao, p.description, supplierName(p.supplierId),
        p.latestPrice?.supplierName, tags,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [products, search, selectedClass, selectedCrit, suppliers]);

  // CAMADA MODELO — agrupa variações pelo nome normalizado.
  const models = useMemo<ModelGroup[]>(() => {
    const m = new Map<string, any[]>();
    for (const p of filtered) {
      const key = normalizeName(p.name);
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    const list = Array.from(m.entries()).map(([key, variants]) => {
      const primary = variants.find((v) => v.description) ?? variants[0];
      const price = variants.find((v) => v.latestPrice)?.latestPrice ?? null;
      const supplierIds = new Set(variants.map((v) => v.supplierId).filter(Boolean));
      const crit = variants.find((v) => v.criticidade)?.criticidade ?? null;
      return {
        key,
        name: variants[0].name,
        ncmCode: variants[0].ncmCode,
        classe: variants.find((v) => v.classe)?.classe ?? null,
        criticidade: crit,
        description: primary.description ?? null,
        primary,
        variants,
        price,
        suppliersCount: supplierIds.size,
      };
    });
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "price") {
        return (a.price?.unitPriceCents ?? Infinity) - (b.price?.unitPriceCents ?? Infinity);
      }
      if (sortBy === "date") {
        return new Date(b.price?.quotationDate ?? 0).getTime() - new Date(a.price?.quotationDate ?? 0).getTime();
      }
      return 0;
    });
    return list;
  }, [filtered, sortBy]);

  const selected = models.find((mo) => mo.key === selectedKey) ?? null;

  const hasFilters = search.trim() !== "" || selectedClass !== null || selectedCrit.size > 0;
  const clearAllFilters = () => {
    setSearch("");
    setSelectedClass(null);
    setSelectedCrit(new Set());
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

  const detail = selected ? (
    <ModelDetail
      model={selected}
      supplierName={supplierName}
      suppliers={suppliersList}
      onClose={() => setSelectedKey(null)}
      onDelete={(id) => {
        deleteMutation.mutate({ id });
        setSelectedKey(null);
      }}
      updateMutation={updateMutation}
    />
  ) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b">
        <div>
          <h1 className="text-3xl font-bold">Ativos</h1>
          <p className="text-muted-foreground">
            Catálogo de itens por classe — selecione um item para ver ficha técnica e fornecedores
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-fit" onClick={() => setFormData(initialFormData)}>
              <Plus className="h-4 w-4" />
              Novo Ativo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cadastrar Ativo</DialogTitle>
              <DialogDescription>Adicione um novo item ao catálogo</DialogDescription>
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

      {/* Busca + ordenação */}
      {products && products.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center gap-3 py-4 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, NCM, classe, especificação…"
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="gap-2 lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Classes
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
            <h3 className="text-lg font-semibold mb-2">Nenhum ativo cadastrado</h3>
            <p className="text-muted-foreground mb-4">Comece cadastrando seu primeiro item</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Ativo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6 flex-1 min-h-0 py-4">
          {/* CAMADA 1 — Classe macro (navegação) */}
          <aside
            className={`${sidebarOpen ? "block" : "hidden"} lg:block w-full lg:w-56 flex-shrink-0 border-r pr-4 overflow-y-auto`}
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Classes
                </h3>
                <div className="space-y-1">
                  <ClassButton
                    label="Todas"
                    count={products.length}
                    active={selectedClass === null}
                    onClick={() => { setSelectedClass(null); setSidebarOpen(false); }}
                  />
                  {classFacets.map((c) => (
                    <ClassButton
                      key={c.key}
                      label={c.label}
                      count={c.count}
                      active={selectedClass === c.key}
                      onClick={() => { setSelectedClass(c.key); setSidebarOpen(false); }}
                    />
                  ))}
                  {semClasse > 0 && (
                    <ClassButton
                      label="Sem classe"
                      count={semClasse}
                      active={selectedClass === "__none__"}
                      onClick={() => { setSelectedClass("__none__"); setSidebarOpen(false); }}
                    />
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Criticidade
                </h3>
                <div className="space-y-1">
                  {(["alta", "media", "baixa"] as const).map((value) => {
                    const meta = CRIT_META[value];
                    const count = products.filter((p) => p.criticidade === value).length;
                    const active = selectedCrit.has(value);
                    return (
                      <button
                        key={value}
                        onClick={() => {
                          const next = new Set(selectedCrit);
                          if (active) next.delete(value); else next.add(value);
                          setSelectedCrit(next);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                          active ? "bg-violet-50 text-violet-700" : "hover:bg-muted"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                        <span className="flex-1 text-left">{meta.label}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* CAMADA 2 — Modelos (lista) */}
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="text-sm text-muted-foreground mb-3">
              {models.length} {models.length === 1 ? "item" : "itens"}
              {hasFilters ? ` · filtro ativo` : ""}
            </p>
            {models.length === 0 ? (
              <Card className="flex-1 flex items-center justify-center">
                <CardContent className="py-16 text-center">
                  <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-1">Nenhum resultado</h3>
                  <p className="text-muted-foreground">Ajuste a busca, a classe ou a criticidade.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex-1 overflow-auto pr-1 space-y-1.5">
                {models.map((mo) => {
                  const crit = mo.criticidade ? CRIT_META[mo.criticidade as "alta" | "media" | "baixa"] : null;
                  const isSel = mo.key === selectedKey;
                  return (
                    <button
                      key={mo.key}
                      onClick={() => setSelectedKey(mo.key)}
                      className={`w-full rounded-xl border p-3 text-left transition-all ${
                        isSel
                          ? "border-violet-400 bg-violet-50/60 ring-1 ring-violet-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-slate-800 truncate">{mo.name}</span>
                            {mo.variants.length > 1 && (
                              <Badge variant="secondary" className="gap-1 text-[10px]">
                                <Boxes className="h-3 w-3" /> {mo.variants.length} variações
                              </Badge>
                            )}
                            {crit && (
                              <Badge variant="outline" className={`text-[10px] ${crit.badge}`}>{crit.label}</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="font-mono">{mo.ncmCode}</span>
                            {mo.classe && <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />{mo.classe.trim()}</span>}
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {mo.suppliersCount > 0 ? `${mo.suppliersCount} fornecedor${mo.suppliersCount > 1 ? "es" : ""}` : "sem fornecedor"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            {mo.price ? (
                              <>
                                <div className="text-sm font-semibold text-slate-800">
                                  {fmtMoney(mo.price.unitPriceCents, mo.price.currency)}
                                </div>
                                <div className="text-[11px] text-muted-foreground">{fmtDate(mo.price.quotationDate)}</div>
                              </>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Sem cotação</span>
                            )}
                          </div>
                          <ChevronRight className={`h-4 w-4 ${isSel ? "text-violet-500" : "text-slate-300"}`} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* CAMADA 3 — detalhe inline (telas menores) */}
            {detail && <div className="lg:hidden mt-4">{detail}</div>}
          </div>

          {/* CAMADA 3 — detalhe lateral (desktop) */}
          <aside className="hidden lg:block w-[380px] flex-shrink-0 overflow-y-auto">
            {detail ?? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                <Box className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-400">Selecione um item para ver a ficha técnica e os fornecedores.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function ClassButton({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
        active ? "bg-violet-600 text-white" : "hover:bg-muted text-slate-700"
      }`}
    >
      <span className="flex-1 truncate text-left">{label}</span>
      <span className={`text-xs ${active ? "text-violet-100" : "text-muted-foreground"}`}>{count}</span>
    </button>
  );
}

/** CAMADA 3 — ficha técnica do modelo + fornecedores e preços. */
function ModelDetail({
  model, suppliers, supplierName, onClose, onDelete, updateMutation,
}: {
  model: ModelGroup;
  suppliers: Array<{ id: number; name: string }>;
  supplierName: (id: number | null) => string | null;
  onClose: () => void;
  onDelete: (id: number) => void;
  updateMutation: any;
}) {
  const crit = model.criticidade ? CRIT_META[model.criticidade as "alta" | "media" | "baixa"] : null;
  const p = model.primary;
  const tags = (p.tags as string[] | null) ?? [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {/* cabeçalho */}
      <div className="flex items-start gap-2 border-b border-slate-100 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{model.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{model.ncmCode}</span>
            {model.classe && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
                <Layers className="h-3 w-3" /> {model.classe.trim()}
              </span>
            )}
            {crit && <Badge variant="outline" className={`text-[10px] ${crit.badge}`}>{crit.label}</Badge>}
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" title="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* ações */}
        <div className="flex items-center gap-2">
          <ProductActionMenu
            product={p}
            onDelete={onDelete}
            updateMutation={updateMutation}
            suppliers={suppliers}
          />
        </div>

        {/* descrição */}
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Ficha técnica</p>
          <p className="text-sm leading-relaxed text-slate-600">
            {model.description || <span className="text-slate-400">Sem descrição cadastrada.</span>}
          </p>
        </div>

        {/* specs */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Spec icon={<Box className="h-3.5 w-3.5" />} label="Unidade" value={p.unit} />
          <Spec icon={<Scale className="h-3.5 w-3.5" />} label="Peso" value={p.weightKg != null ? `${p.weightKg} kg` : "—"} />
          <Spec icon={<Barcode className="h-3.5 w-3.5" />} label="Volume" value={p.volumeM3 != null ? `${p.volumeM3} m³` : "—"} />
          <Spec icon={<Layers className="h-3.5 w-3.5" />} label="Categoria" value={[p.categoria, p.subcategoria].filter(Boolean).join(" · ") || "—"} />
        </div>
        {p.aplicacao && (
          <div className="text-sm">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Aplicação</span>
            <p className="text-slate-600">{p.aplicacao}</p>
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5 text-slate-400" />
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        )}

        {/* fornecedores & preços */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Fornecedores e preços
          </p>
          <SupplierPrices productName={model.name} fallbackSupplier={supplierName(p.supplierId)} unit={p.unit} />
        </div>
      </div>
    </div>
  );
}

function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {icon} {label}
      </div>
      <div className="text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

/** Lista fornecedores com o ÚLTIMO preço de cada um (camada de variações). */
function SupplierPrices({
  productName, fallbackSupplier, unit,
}: { productName: string; fallbackSupplier: string | null; unit: string }) {
  const { data, isLoading } = trpc.proforma.productPriceHistory.useQuery({ productName });

  const rows = useMemo(() => {
    const m = new Map<string, { supplier: string; unitPriceCents: number; currency: string; date: string | Date }>();
    for (const pt of data?.points ?? []) {
      const k = pt.supplierName || "—";
      const cur = m.get(k);
      if (!cur || new Date(pt.quotationDate).getTime() > new Date(cur.date).getTime()) {
        m.set(k, { supplier: k, unitPriceCents: pt.unitPriceCents, currency: pt.currency, date: pt.quotationDate });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando fornecedores…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
        {fallbackSupplier
          ? `Fornecedor cadastrado: ${fallbackSupplier}. Sem cotação no histórico ainda — suba proformas para alimentar os preços.`
          : "Sem cotações no histórico ainda. Suba proformas para ver fornecedores e preços."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Fornecedor</th>
            <th className="px-3 py-2 text-right font-semibold">Último preço</th>
            <th className="px-3 py-2 text-right font-semibold">Data</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.supplier} className="border-t border-slate-100">
              <td className="px-3 py-2">
                <span className="text-slate-700">{r.supplier}</span>
                {i === 0 && rows.length > 1 && (
                  <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    Mais competitivo
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-medium text-slate-800">
                {fmtMoney(r.unitPriceCents, r.currency)}
                <span className="text-[11px] text-muted-foreground">/{unit}</span>
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-slate-100 px-3 py-2">
        <ProductPriceHistoryDialog productName={productName} />
      </div>
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
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" onClick={handleOpenEdit} className="gap-1">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Ativo</DialogTitle>
            <DialogDescription>Atualize as informações do item</DialogDescription>
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
          <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O item "{product.name}" será permanentemente excluído.
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
        <Button variant="ghost" size="sm" className="w-full gap-1 text-violet-700 hover:text-violet-800">
          <TrendingUp className="h-4 w-4" /> Ver histórico de preços
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
