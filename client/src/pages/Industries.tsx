import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Plus, Search, Factory, Star, MapPin, Phone, Mail, Filter, Building2, ArrowUpDown } from "lucide-react";

const SECTORS = [
  { value: "metals", label: "Metais (ferro, aço, alumínio)" },
  { value: "construction", label: "Construção Civil" },
  { value: "machinery", label: "Máquinas e Equipamentos" },
  { value: "electronics", label: "Eletrônicos" },
  { value: "chemicals", label: "Químicos" },
  { value: "textiles", label: "Têxteis" },
  { value: "food", label: "Alimentos" },
  { value: "automotive", label: "Automotivo" },
  { value: "plastics", label: "Plásticos" },
  { value: "wood", label: "Madeira" },
  { value: "packaging", label: "Embalagens" },
  { value: "energy", label: "Energia" },
  { value: "other", label: "Outros" },
];

const REGIONS = [
  { value: "asia_china", label: "China" },
  { value: "asia_india", label: "Índia" },
  { value: "asia_southeast", label: "Sudeste Asiático" },
  { value: "asia_other", label: "Outros Ásia" },
  { value: "europe_west", label: "Europa Ocidental" },
  { value: "europe_east", label: "Europa Oriental" },
  { value: "north_america", label: "América do Norte" },
  { value: "south_america", label: "América do Sul" },
  { value: "middle_east", label: "Oriente Médio" },
  { value: "africa", label: "África" },
  { value: "oceania", label: "Oceania" },
];

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const CHANNELS = [
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "wechat", label: "WeChat" },
  { value: "phone", label: "Telefone" },
  { value: "alibaba", label: "Alibaba" },
  { value: "other", label: "Outro" },
];
const LANGUAGES = [
  { value: "pt", label: "Português" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
  { value: "zh", label: "Chinês" },
  { value: "ar", label: "Árabe" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "Japonês" },
  { value: "ko", label: "Coreano" },
];

export default function Industries({ tipoEntidade }: { tipoEntidade?: "fornecedor" | "comprador" } = {}) {
  const [, setLocation] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterSector, setFilterSector] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Quando recebe tipoEntidade, usa a query unificada filtrada; senão, lista tudo
  const listAll = trpc.industries.list.useQuery(undefined, { enabled: !tipoEntidade });
  const listByType = trpc.industries.listByType.useQuery(
    { tipoEntidade: tipoEntidade ?? "fornecedor" },
    { enabled: !!tipoEntidade }
  );
  const industriesList = tipoEntidade ? listByType.data : listAll.data;
  const isLoading = tipoEntidade ? listByType.isLoading : listAll.isLoading;
  const { data: stats } = trpc.industries.stats.useQuery();
  const utils = trpc.useUtils();

  const label = tipoEntidade === "comprador" ? "Comprador" : tipoEntidade === "fornecedor" ? "Fornecedor" : "Indústria";

  const createMutation = trpc.industries.create.useMutation({
    onSuccess: () => {
      utils.industries.list.invalidate();
      utils.industries.listByType.invalidate();
      utils.industries.stats.invalidate();
      setShowCreateDialog(false);
      toast.success(`${label} cadastrado com sucesso!`);
    },
    onError: (err) => {
      toast.error(err.message || `Erro ao cadastrar ${label.toLowerCase()}`);
    },
  });

  const deleteMutation = trpc.industries.delete.useMutation({
    onSuccess: () => {
      utils.industries.list.invalidate();
      utils.industries.listByType.invalidate();
      utils.industries.stats.invalidate();
      toast.success(`${label} removido`);
    },
  });

  // Ambiente limpo (como Ativos): a lista só aparece quando há busca/filtro ativo.
  const hasFilters = searchQuery.trim() !== "" || filterSector !== "all" || filterStatus !== "all";

  // Filtrar e ordenar
  const filteredIndustries = (industriesList || [])
    .filter(ind => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!ind.name.toLowerCase().includes(q) && 
            !ind.country?.toLowerCase().includes(q) &&
            !ind.subsector?.toLowerCase().includes(q) &&
            !ind.tags?.toLowerCase().includes(q)) return false;
      }
      if (filterSector !== "all" && ind.sector !== filterSector) return false;
      if (filterStatus !== "all" && ind.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "rating") return Number(b.overallRating) - Number(a.overallRating);
      if (sortBy === "recent") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return 0;
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {tipoEntidade === "comprador" ? "Compradores nacionais" : tipoEntidade === "fornecedor" ? "Cadeia Global de Suprimentos" : "Indústrias"}
          </h1>
          <p className="text-muted-foreground">
            {tipoEntidade === "comprador"
              ? "Cadastro e gestão de compradores nacionais / setores"
              : "Fábricas e fornecedores internacionais da sua cadeia de abastecimento"}
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo {label}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cadastrar Novo {label}</DialogTitle>
            </DialogHeader>
            <IndustryForm
              onSubmit={(data) => createMutation.mutate({ ...data, ...(tipoEntidade ? { tipoEntidade } : {}) })}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-500">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Ativas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-500">{stats.prospect}</p>
              <p className="text-xs text-muted-foreground">Prospectos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.totalProducts}</p>
              <p className="text-xs text-muted-foreground">Produtos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-[#28E7C5]">{stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—"}</p>
              <p className="text-xs text-muted-foreground">Rating Médio</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros e Busca */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, país, setor, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterSector} onValueChange={setFilterSector}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Setores</SelectItem>
                {SECTORS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="prospect">Prospectos</SelectItem>
                <SelectItem value="inactive">Inativas</SelectItem>
                <SelectItem value="blacklisted">Bloqueadas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nome A-Z</SelectItem>
                <SelectItem value="rating">Melhor Rating</SelectItem>
                <SelectItem value="recent">Mais Recente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Indústrias */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-48" />
            </Card>
          ))}
        </div>
      ) : !hasFilters ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <Search className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Busque por nome, país ou tags — ou filtre por setor/status — para listar
              {stats?.total ? ` os ${stats.total} cadastros` : " os cadastros"}.
            </p>
          </CardContent>
        </Card>
      ) : filteredIndustries.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Factory className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma indústria encontrada</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || filterSector !== "all" || filterStatus !== "all"
                ? "Tente ajustar os filtros de busca"
                : "Cadastre sua primeira indústria para começar"}
            </p>
            {!searchQuery && filterSector === "all" && (
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Cadastrar Indústria
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredIndustries.map(industry => (
            <Card 
              key={industry.id} 
              className="cursor-pointer hover:border-[#28E7C5]/50 transition-colors"
              onClick={() => setLocation(`/industries/${industry.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{industry.name}</h3>
                    {industry.tradeName && (
                      <p className="text-xs text-muted-foreground truncate">{industry.tradeName}</p>
                    )}
                  </div>
                  <StatusBadge status={industry.status} />
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{industry.city ? `${industry.city}, ` : ""}{industry.country}</span>
                  </div>
                  {industry.contactEmail && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{industry.contactEmail}</span>
                    </div>
                  )}
                  {industry.contactPhone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{industry.contactPhone}</span>
                    </div>
                  )}
                  {industry.subsector && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{industry.subsector}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <div className="flex items-center gap-1">
                    {Number(industry.overallRating) > 0 ? (
                      <>
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium text-sm">{Number(industry.overallRating).toFixed(1)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem avaliação</span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {SECTORS.find(s => s.value === industry.sector)?.label || industry.sector}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Ativa", className: "bg-green-500/10 text-green-500 border-green-500/20" },
    prospect: { label: "Prospecto", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
    inactive: { label: "Inativa", className: "bg-gray-500/10 text-muted-foreground border-gray-500/20" },
    blacklisted: { label: "Bloqueada", className: "bg-red-500/10 text-red-500 border-red-500/20" },
  };
  const c = config[status] || config.prospect;
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

// Formulário de criação de indústria - organizado em tabs para eficiência
function IndustryForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({
    name: "",
    tradeName: "",
    registrationNumber: "",
    website: "",
    sector: "metals" as const,
    subsector: "",
    country: "",
    state: "",
    city: "",
    address: "",
    postalCode: "",
    region: "asia_china" as const,
    contactName: "",
    contactRole: "",
    contactEmail: "",
    contactPhone: "",
    contactWhatsapp: "",
    contactWechat: "",
    isMercosul: false,
    preferredIncoterm: "FOB" as const,
    preferredCurrency: "USD",
    paymentTerms: "",
    minOrderValue: undefined as number | undefined,
    leadTimeDays: undefined as number | undefined,
    productionCapacity: "",
    certifications: "",
    yearEstablished: undefined as number | undefined,
    employeeCount: undefined as number | undefined,
    preferredLanguage: "en" as const,
    preferredChannel: "email" as const,
    status: "prospect" as const,
    notes: "",
    tags: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.country) {
      return;
    }
    onSubmit(formData);
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit}>
      <Tabs defaultValue="identification" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="identification">Identificação</TabsTrigger>
          <TabsTrigger value="contact">Contato</TabsTrigger>
          <TabsTrigger value="commercial">Comercial</TabsTrigger>
          <TabsTrigger value="details">Detalhes</TabsTrigger>
        </TabsList>

        {/* Tab 1: Identificação */}
        <TabsContent value="identification" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Empresa *</Label>
              <Input 
                placeholder="Ex: Tianjin Steel Co., Ltd."
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Nome Fantasia</Label>
              <Input 
                placeholder="Nome comercial/fantasia"
                value={formData.tradeName}
                onChange={(e) => updateField("tradeName", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CNPJ / Tax ID</Label>
              <Input 
                placeholder="Número de registro"
                value={formData.registrationNumber}
                onChange={(e) => updateField("registrationNumber", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input 
                placeholder="https://..."
                value={formData.website}
                onChange={(e) => updateField("website", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Setor *</Label>
              <Select value={formData.sector} onValueChange={(v) => updateField("sector", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTORS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subsetor</Label>
              <Input 
                placeholder="Ex: pregos e parafusos, escoras metálicas"
                value={formData.subsector}
                onChange={(e) => updateField("subsector", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>País *</Label>
              <Input 
                placeholder="Ex: China"
                value={formData.country}
                onChange={(e) => updateField("country", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Estado/Província</Label>
              <Input 
                placeholder="Ex: Tianjin"
                value={formData.state}
                onChange={(e) => updateField("state", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input 
                placeholder="Ex: Tianjin"
                value={formData.city}
                onChange={(e) => updateField("city", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Região Comercial</Label>
              <Select value={formData.region} onValueChange={(v) => updateField("region", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Endereço Completo</Label>
              <Input 
                placeholder="Endereço da fábrica"
                value={formData.address}
                onChange={(e) => updateField("address", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => updateField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">Prospecto</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="inactive">Inativa</SelectItem>
                  <SelectItem value="blacklisted">Bloqueada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input 
                placeholder="Ex: pregos, aço, confiável, rápido"
                value={formData.tags}
                onChange={(e) => updateField("tags", e.target.value)}
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Contato */}
        <TabsContent value="contact" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Contato</Label>
              <Input 
                placeholder="Ex: Wang Wei"
                value={formData.contactName}
                onChange={(e) => updateField("contactName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input 
                placeholder="Ex: Sales Manager"
                value={formData.contactRole}
                onChange={(e) => updateField("contactRole", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input 
                type="email"
                placeholder="contato@empresa.com"
                value={formData.contactEmail}
                onChange={(e) => updateField("contactEmail", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input 
                placeholder="+86 22 1234 5678"
                value={formData.contactPhone}
                onChange={(e) => updateField("contactPhone", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input 
                placeholder="+86 138 0000 0000"
                value={formData.contactWhatsapp}
                onChange={(e) => updateField("contactWhatsapp", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>WeChat</Label>
              <Input 
                placeholder="ID do WeChat"
                value={formData.contactWechat}
                onChange={(e) => updateField("contactWechat", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Canal Preferido</Label>
              <Select value={formData.preferredChannel} onValueChange={(v) => updateField("preferredChannel", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Idioma Preferido</Label>
              <Select value={formData.preferredLanguage} onValueChange={(v) => updateField("preferredLanguage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Comercial */}
        <TabsContent value="commercial" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Incoterm Preferido</Label>
              <Select value={formData.preferredIncoterm} onValueChange={(v) => updateField("preferredIncoterm", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCOTERMS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Moeda</Label>
              <Select value={formData.preferredCurrency} onValueChange={(v) => updateField("preferredCurrency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - Dólar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="CNY">CNY - Yuan</SelectItem>
                  <SelectItem value="BRL">BRL - Real</SelectItem>
                  <SelectItem value="GBP">GBP - Libra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mercosul?</Label>
              <Select value={formData.isMercosul ? "yes" : "no"} onValueChange={(v) => updateField("isMercosul", v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Não</SelectItem>
                  <SelectItem value="yes">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Condições de Pagamento</Label>
              <Input 
                placeholder="Ex: 30% advance, 70% before shipment"
                value={formData.paymentTerms}
                onChange={(e) => updateField("paymentTerms", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor Mínimo de Pedido (USD)</Label>
              <Input 
                type="number"
                placeholder="Ex: 5000"
                value={formData.minOrderValue || ""}
                onChange={(e) => updateField("minOrderValue", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Lead Time (dias)</Label>
              <Input 
                type="number"
                placeholder="Ex: 30"
                value={formData.leadTimeDays || ""}
                onChange={(e) => updateField("leadTimeDays", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div className="space-y-2">
              <Label>Capacidade Produtiva</Label>
              <Input 
                placeholder="Ex: 5000 tons/mês"
                value={formData.productionCapacity}
                onChange={(e) => updateField("productionCapacity", e.target.value)}
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Detalhes */}
        <TabsContent value="details" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ano de Fundação</Label>
              <Input 
                type="number"
                placeholder="Ex: 2005"
                value={formData.yearEstablished || ""}
                onChange={(e) => updateField("yearEstablished", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nº de Funcionários</Label>
              <Input 
                type="number"
                placeholder="Ex: 500"
                value={formData.employeeCount || ""}
                onChange={(e) => updateField("employeeCount", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Certificações</Label>
            <Input 
              placeholder="Ex: ISO 9001, CE, SGS, BV"
              value={formData.certifications}
              onChange={(e) => updateField("certifications", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea 
              placeholder="Notas internas sobre este fornecedor..."
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={4}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        <Button type="submit" disabled={isLoading || !formData.name || !formData.country}>
          {isLoading ? "Salvando..." : "Cadastrar Indústria"}
        </Button>
      </div>
    </form>
  );
}
