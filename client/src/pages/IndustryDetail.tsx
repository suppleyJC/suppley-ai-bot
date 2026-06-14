import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ArrowLeft, Trash2, Plus, Star, Package, Users, Mail, Phone, MessageCircle, Globe } from "lucide-react";

const SECTORS_MAP: Record<string, string> = {
  metals: "Metais", construction: "Construção Civil", machinery: "Máquinas e Equipamentos",
  electronics: "Eletrônicos", chemicals: "Químicos", textiles: "Têxteis",
  food: "Alimentos", automotive: "Automotivo", plastics: "Plásticos",
  wood: "Madeira", packaging: "Embalagens", energy: "Energia", other: "Outros",
};

export default function IndustryDetail({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const industryId = parseInt(id);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddRating, setShowAddRating] = useState(false);

  const { data: industry, isLoading } = trpc.industries.get.useQuery({ id: industryId });
  const { data: products } = trpc.industries.products.list.useQuery({ industryId });
  const { data: contacts } = trpc.industries.contacts.list.useQuery({ industryId });
  const { data: ratings } = trpc.industries.ratings.list.useQuery({ industryId });
  const utils = trpc.useUtils();

  const addProductMutation = trpc.industries.products.create.useMutation({
    onSuccess: () => {
      utils.industries.products.list.invalidate({ industryId });
      setShowAddProduct(false);
      toast.success("Produto adicionado ao catálogo!");
    },
    onError: (err) => toast.error(err.message),
  });

  const addContactMutation = trpc.industries.contacts.create.useMutation({
    onSuccess: () => {
      utils.industries.contacts.list.invalidate({ industryId });
      setShowAddContact(false);
      toast.success("Contato adicionado!");
    },
    onError: (err) => toast.error(err.message),
  });

  const addRatingMutation = trpc.industries.ratings.create.useMutation({
    onSuccess: () => {
      utils.industries.ratings.list.invalidate({ industryId });
      utils.industries.get.invalidate({ id: industryId });
      setShowAddRating(false);
      toast.success("Avaliação registrada!");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.industries.delete.useMutation({
    onSuccess: () => {
      toast.success("Indústria removida");
      setLocation("/industries");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!industry) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Indústria não encontrada</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/industries")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/industries")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{industry.name}</h1>
            {industry.tradeName && <p className="text-muted-foreground">{industry.tradeName}</p>}
          </div>
          <StatusBadge status={industry.status} />
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={() => {
            if (confirm("Tem certeza que deseja remover esta indústria?")) {
              deleteMutation.mutate({ id: industryId });
            }
          }}>
            <Trash2 className="h-4 w-4 mr-1" /> Remover
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Localização</span>
            </div>
            <p className="text-sm">{industry.city ? `${industry.city}, ` : ""}{industry.state ? `${industry.state}, ` : ""}{industry.country}</p>
            {industry.address && <p className="text-xs text-muted-foreground mt-1">{industry.address}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Contato Principal</span>
            </div>
            <p className="text-sm">{industry.contactName || "—"} {industry.contactRole ? `(${industry.contactRole})` : ""}</p>
            <p className="text-xs text-muted-foreground">{industry.contactEmail || ""}</p>
            <p className="text-xs text-muted-foreground">{industry.contactPhone || ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-medium">Rating</span>
            </div>
            <p className="text-2xl font-bold">{Number(industry.overallRating) > 0 ? Number(industry.overallRating).toFixed(1) : "—"}<span className="text-sm text-muted-foreground">/5.0</span></p>
            <p className="text-xs text-muted-foreground">{industry.totalOrders || 0} pedidos realizados</p>
          </CardContent>
        </Card>
      </div>

      {/* Detalhes Comerciais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informações Comerciais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Setor</p>
              <p className="font-medium">{SECTORS_MAP[industry.sector] || industry.sector}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Incoterm</p>
              <p className="font-medium">{industry.preferredIncoterm}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Moeda</p>
              <p className="font-medium">{industry.preferredCurrency}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Lead Time</p>
              <p className="font-medium">{industry.leadTimeDays ? `${industry.leadTimeDays} dias` : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pedido Mínimo</p>
              <p className="font-medium">{industry.minOrderValue ? `USD ${Number(industry.minOrderValue).toLocaleString()}` : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pagamento</p>
              <p className="font-medium">{industry.paymentTerms || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Capacidade</p>
              <p className="font-medium">{industry.productionCapacity || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Certificações</p>
              <p className="font-medium">{industry.certifications || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Produtos, Contatos, Avaliações */}
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products" className="gap-2">
            <Package className="h-4 w-4" /> Catálogo ({products?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" /> Contatos ({contacts?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="ratings" className="gap-2">
            <Star className="h-4 w-4" /> Avaliações ({ratings?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Produtos */}
        <TabsContent value="products" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">Produtos oferecidos por esta indústria com preços EXW/FOB</p>
            <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Produto</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Adicionar Produto ao Catálogo</DialogTitle></DialogHeader>
                <ProductForm industryId={industryId} onSubmit={(data) => addProductMutation.mutate(data)} isLoading={addProductMutation.isPending} />
              </DialogContent>
            </Dialog>
          </div>

          {!products?.length ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum produto cadastrado ainda</CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Produto</th>
                    <th className="text-left p-3 font-medium">NCM</th>
                    <th className="text-right p-3 font-medium">EXW</th>
                    <th className="text-right p-3 font-medium">FOB</th>
                    <th className="text-right p-3 font-medium">MOQ</th>
                    <th className="text-left p-3 font-medium">Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <p className="font-medium">{p.name}</p>
                        {p.specifications && <p className="text-xs text-muted-foreground">{p.specifications}</p>}
                      </td>
                      <td className="p-3 text-muted-foreground">{p.ncmCode || "—"}</td>
                      <td className="p-3 text-right font-mono">{p.priceExw ? `${p.currency} ${Number(p.priceExw).toFixed(2)}` : "—"}</td>
                      <td className="p-3 text-right font-mono">{p.priceFob ? `${p.currency} ${Number(p.priceFob).toFixed(2)}` : "—"}</td>
                      <td className="p-3 text-right">{p.moq ? p.moq.toLocaleString() : "—"}</td>
                      <td className="p-3">{p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Contatos */}
        <TabsContent value="contacts" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">Contatos desta indústria</p>
            <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Contato</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Adicionar Contato</DialogTitle></DialogHeader>
                <ContactForm industryId={industryId} onSubmit={(data) => addContactMutation.mutate(data)} isLoading={addContactMutation.isPending} />
              </DialogContent>
            </Dialog>
          </div>

          {!contacts?.length ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum contato cadastrado</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {contacts.map(c => (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.role} {c.department ? `• ${c.department}` : ""}</p>
                      </div>
                      {c.isPrimary && <Badge variant="outline" className="text-xs">Principal</Badge>}
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      {c.email && <p className="flex items-center gap-2"><Mail className="h-3 w-3" />{c.email}</p>}
                      {c.phone && <p className="flex items-center gap-2"><Phone className="h-3 w-3" />{c.phone}</p>}
                      {c.whatsapp && <p className="flex items-center gap-2"><MessageCircle className="h-3 w-3" />{c.whatsapp}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Avaliações */}
        <TabsContent value="ratings" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">Histórico de avaliações desta indústria</p>
            <Dialog open={showAddRating} onOpenChange={setShowAddRating}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Avaliar</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova Avaliação</DialogTitle></DialogHeader>
                <RatingForm industryId={industryId} onSubmit={(data) => addRatingMutation.mutate(data)} isLoading={addRatingMutation.isPending} />
              </DialogContent>
            </Dialog>
          </div>

          {!ratings?.length ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma avaliação registrada</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {ratings.map(r => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{((r.priceScore + r.qualityScore + r.deliveryScore + r.communicationScore) / 4).toFixed(1)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Preço:</span> {r.priceScore}/5</div>
                      <div><span className="text-muted-foreground">Qualidade:</span> {r.qualityScore}/5</div>
                      <div><span className="text-muted-foreground">Entrega:</span> {r.deliveryScore}/5</div>
                      <div><span className="text-muted-foreground">Comunicação:</span> {r.communicationScore}/5</div>
                    </div>
                    {r.comment && <p className="text-sm mt-2 text-muted-foreground">{r.comment}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Ativa", className: "bg-green-500/10 text-green-500 border-green-500/20" },
    prospect: { label: "Prospecto", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
    inactive: { label: "Inativa", className: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
    blacklisted: { label: "Bloqueada", className: "bg-red-500/10 text-red-500 border-red-500/20" },
  };
  const c = config[status] || config.prospect;
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

// Sub-forms
function ProductForm({ industryId, onSubmit, isLoading }: { industryId: number; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    industryId,
    name: "", description: "", sku: "", ncmCode: "", hsCode: "",
    category: "", subcategory: "", specifications: "",
    unit: "UN", weightPerUnit: "",
    priceExw: undefined as number | undefined,
    priceFob: undefined as number | undefined,
    priceCif: undefined as number | undefined,
    currency: "USD",
    moq: undefined as number | undefined,
    leadTimeDays: undefined as number | undefined,
    packagingInfo: "", qualityGrade: "", certifications: "",
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome do Produto *</Label>
          <Input placeholder="Ex: Prego 17x27" value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} required />
        </div>
        <div className="space-y-2">
          <Label>SKU / Ref.</Label>
          <Input placeholder="Código interno" value={form.sku} onChange={(e) => setForm(p => ({...p, sku: e.target.value}))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>NCM</Label>
          <Input placeholder="Ex: 7317.00.10" value={form.ncmCode} onChange={(e) => setForm(p => ({...p, ncmCode: e.target.value}))} />
        </div>
        <div className="space-y-2">
          <Label>HS Code</Label>
          <Input placeholder="Ex: 7317.00" value={form.hsCode} onChange={(e) => setForm(p => ({...p, hsCode: e.target.value}))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Especificações</Label>
        <Input placeholder="Ex: Aço carbono, cabeça chata, polido" value={form.specifications} onChange={(e) => setForm(p => ({...p, specifications: e.target.value}))} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Preço EXW</Label>
          <Input type="number" step="0.01" placeholder="0.00" value={form.priceExw || ""} onChange={(e) => setForm(p => ({...p, priceExw: e.target.value ? Number(e.target.value) : undefined}))} />
        </div>
        <div className="space-y-2">
          <Label>Preço FOB</Label>
          <Input type="number" step="0.01" placeholder="0.00" value={form.priceFob || ""} onChange={(e) => setForm(p => ({...p, priceFob: e.target.value ? Number(e.target.value) : undefined}))} />
        </div>
        <div className="space-y-2">
          <Label>Moeda</Label>
          <Select value={form.currency} onValueChange={(v) => setForm(p => ({...p, currency: v}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="CNY">CNY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unidade</Label>
          <Select value={form.unit} onValueChange={(v) => setForm(p => ({...p, unit: v}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="UN">UN</SelectItem>
              <SelectItem value="KG">KG</SelectItem>
              <SelectItem value="TON">TON</SelectItem>
              <SelectItem value="M">Metro</SelectItem>
              <SelectItem value="M2">M²</SelectItem>
              <SelectItem value="M3">M³</SelectItem>
              <SelectItem value="CX">Caixa</SelectItem>
              <SelectItem value="PC">Peça</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>MOQ</Label>
          <Input type="number" placeholder="Qtd mínima" value={form.moq || ""} onChange={(e) => setForm(p => ({...p, moq: e.target.value ? Number(e.target.value) : undefined}))} />
        </div>
        <div className="space-y-2">
          <Label>Lead Time (dias)</Label>
          <Input type="number" placeholder="30" value={form.leadTimeDays || ""} onChange={(e) => setForm(p => ({...p, leadTimeDays: e.target.value ? Number(e.target.value) : undefined}))} />
        </div>
        <div className="space-y-2">
          <Label>Peso/Unidade</Label>
          <Input placeholder="Ex: 25kg" value={form.weightPerUnit} onChange={(e) => setForm(p => ({...p, weightPerUnit: e.target.value}))} />
        </div>
      </div>
      <Button type="submit" disabled={isLoading || !form.name} className="w-full">
        {isLoading ? "Salvando..." : "Adicionar Produto"}
      </Button>
    </form>
  );
}

function ContactForm({ industryId, onSubmit, isLoading }: { industryId: number; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    industryId,
    name: "", role: "", department: "",
    email: "", phone: "", whatsapp: "", wechat: "", skype: "",
    preferredChannel: "email" as const,
    language: "en" as const,
    isPrimary: false, notes: "",
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome *</Label>
          <Input placeholder="Nome completo" value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} required />
        </div>
        <div className="space-y-2">
          <Label>Cargo</Label>
          <Input placeholder="Ex: Sales Manager" value={form.role} onChange={(e) => setForm(p => ({...p, role: e.target.value}))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input type="email" placeholder="email@empresa.com" value={form.email} onChange={(e) => setForm(p => ({...p, email: e.target.value}))} />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input placeholder="+86 ..." value={form.phone} onChange={(e) => setForm(p => ({...p, phone: e.target.value}))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>WhatsApp</Label>
          <Input placeholder="+86 ..." value={form.whatsapp} onChange={(e) => setForm(p => ({...p, whatsapp: e.target.value}))} />
        </div>
        <div className="space-y-2">
          <Label>WeChat</Label>
          <Input placeholder="ID WeChat" value={form.wechat} onChange={(e) => setForm(p => ({...p, wechat: e.target.value}))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Canal Preferido</Label>
          <Select value={form.preferredChannel} onValueChange={(v: any) => setForm(p => ({...p, preferredChannel: v}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="wechat">WeChat</SelectItem>
              <SelectItem value="phone">Telefone</SelectItem>
              <SelectItem value="skype">Skype</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Idioma</Label>
          <Select value={form.language} onValueChange={(v: any) => setForm(p => ({...p, language: v}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">Inglês</SelectItem>
              <SelectItem value="zh">Chinês</SelectItem>
              <SelectItem value="pt">Português</SelectItem>
              <SelectItem value="es">Espanhol</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={isLoading || !form.name} className="w-full">
        {isLoading ? "Salvando..." : "Adicionar Contato"}
      </Button>
    </form>
  );
}

function RatingForm({ industryId, onSubmit, isLoading }: { industryId: number; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [form, setForm] = useState({
    industryId,
    priceScore: 3, qualityScore: 3, deliveryScore: 3, communicationScore: 3,
    comment: "", orderValue: undefined as number | undefined,
  });

  const ScoreInput = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <div className="space-y-2">
      <Label>{label}: {value}/5</Label>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} className="p-1">
            <Star className={`h-5 w-5 ${n <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ScoreInput label="Preço" value={form.priceScore} onChange={(v) => setForm(p => ({...p, priceScore: v}))} />
        <ScoreInput label="Qualidade" value={form.qualityScore} onChange={(v) => setForm(p => ({...p, qualityScore: v}))} />
        <ScoreInput label="Entrega" value={form.deliveryScore} onChange={(v) => setForm(p => ({...p, deliveryScore: v}))} />
        <ScoreInput label="Comunicação" value={form.communicationScore} onChange={(v) => setForm(p => ({...p, communicationScore: v}))} />
      </div>
      <div className="space-y-2">
        <Label>Valor do Pedido (USD)</Label>
        <Input type="number" placeholder="Opcional" value={form.orderValue || ""} onChange={(e) => setForm(p => ({...p, orderValue: e.target.value ? Number(e.target.value) : undefined}))} />
      </div>
      <div className="space-y-2">
        <Label>Comentário</Label>
        <Textarea placeholder="Observações sobre esta experiência..." value={form.comment} onChange={(e) => setForm(p => ({...p, comment: e.target.value}))} />
      </div>
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Salvando..." : "Registrar Avaliação"}
      </Button>
    </form>
  );
}
