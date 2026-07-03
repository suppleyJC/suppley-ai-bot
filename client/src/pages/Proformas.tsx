import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Upload, Sparkles, Trash2, Plus, ArrowRight, Loader2, CheckCircle2, Building2, Package, Copy, Edit, Share2 } from "lucide-react";
import OperationCard, { type OperationCardAction } from "@/components/OperationCard";

type ItemDraft = {
  productName: string;
  description?: string; // especificações técnicas completas
  productNameOriginal?: string;
  ncmCode?: string;
  ncmConfidence?: number;
  quantity: number;
  unit: string;
  unitPrice: number; // em unidades da moeda (não centavos) — UX
};

// Setores do cadastro de fornecedores (industries.sector) com rótulos PT-BR.
const SECTOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "metals", label: "Metais" },
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

type Draft = {
  supplierName: string;
  supplierCountry: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierSector: string;
  /** true quando o setor veio da sugestão da IA (mostra o hint na revisão). */
  sectorSuggested?: boolean;
  currency: string;
  incoterm: string;
  paymentTerms: string;
  leadTimeDays?: number;
  moq?: number;
  quotationDate?: string; // YYYY-MM-DD
  items: ItemDraft[];
  confidence?: number;
  fileUrl?: string;
  fileName?: string;
};

const emptyDraft: Draft = {
  supplierName: "",
  supplierCountry: "",
  supplierEmail: "",
  supplierPhone: "",
  supplierSector: "",
  currency: "USD",
  incoterm: "FOB",
  paymentTerms: "",
  quotationDate: undefined,
  items: [],
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-700" },
  extraida: { label: "Extraída (revisar)", color: "bg-amber-100 text-amber-800" },
  revisada: { label: "Revisada", color: "bg-blue-100 text-blue-800" },
  distribuida: { label: "Distribuída", color: "bg-green-100 text-green-800" },
  arquivada: { label: "Arquivada", color: "bg-gray-100 text-gray-500" },
};

export default function Proformas() {
  const [draft, setDraft] = useState<Draft | null>(null);
  // id da proforma em edição (null = criando uma nova).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: proformas, isLoading } = trpc.proforma.list.useQuery();

  const uploadMutation = trpc.calculations.uploadQuotation.useMutation();
  const extractMutation = trpc.proforma.extract.useMutation();
  const createMutation = trpc.proforma.create.useMutation();
  const updateMutation = trpc.proforma.update.useMutation();
  const distributeMutation = trpc.proforma.distribute.useMutation();
  const deleteMutation = trpc.proforma.delete.useMutation({
    onSuccess: (res) => {
      const n = res?.deletedProductIds?.length ?? 0;
      toast.success(
        n > 0
          ? `Proforma excluída · ${n} produto(s) removido(s) de Ativos & Insumos`
          : "Proforma excluída",
      );
      // Atualiza ambas as listas (proformas + produtos vinculados)
      utils.proforma.list.invalidate();
      utils.products.list.invalidate();
    },
    onError: (err) => toast.error(err?.message || "Erro ao excluir proforma"),
  });

  async function handleDeleteProforma(id: number, label: string) {
    const ok = window.confirm(
      `Excluir a proforma ${label}?\n\nIsto também remove os produtos que ela cadastrou em Ativos & Insumos. Esta ação não pode ser desfeita.`,
    );
    if (ok) deleteMutation.mutate({ proformaId: id });
  }

  // ---- Abrir uma proforma existente para edição ----
  async function openForEdit(id: number) {
    setLoadingEditId(id);
    try {
      const detail = await utils.proforma.get.fetch({ id });
      if (!detail) {
        toast.error("Proforma não encontrada");
        return;
      }
      const { proforma: p, items } = detail;
      setEditingId(id);
      setDraft({
        supplierName: p.supplierName ?? "",
        supplierCountry: p.supplierCountry ?? "",
        supplierEmail: p.supplierEmail ?? "",
        supplierPhone: p.supplierPhone ?? "",
        supplierSector: (p as any).supplierSector ?? "",
        currency: p.currency ?? "USD",
        incoterm: p.incoterm ?? "FOB",
        paymentTerms: p.paymentTerms ?? "",
        leadTimeDays: p.leadTimeDays ?? undefined,
        moq: p.moq ?? undefined,
        quotationDate: p.quotationDate
          ? new Date(p.quotationDate).toISOString().slice(0, 10)
          : undefined,
        items: (items ?? []).map((it) => ({
          productName: it.productName,
          description: it.description || undefined,
          ncmCode: it.ncmCode || undefined,
          quantity: it.quantity,
          unit: it.unit || "UN",
          unitPrice: (it.unitPriceCents || 0) / 100,
        })),
      });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao abrir a proforma");
    } finally {
      setLoadingEditId(null);
    }
  }

  // ---- Upload + extração via Excambia ----
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 16MB.");
      return;
    }

    setIsUploading(true);
    try {
      // 1) upload → fileUrl (reusa endpoint existente)
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const uploaded = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type || "application/pdf",
      });

      toast.info("Excambia analisando a proforma...");

      // 2) extração IA
      const extracted = await extractMutation.mutateAsync({
        fileUrl: uploaded.fileUrl,
        mimeType: file.type || "application/pdf",
      });

      setEditingId(null);
      setDraft({
        supplierName: extracted.supplierName || "",
        supplierCountry: extracted.supplierCountry || "",
        supplierEmail: extracted.supplierEmail || "",
        supplierPhone: extracted.supplierPhone || "",
        supplierSector: (extracted as any).supplierSector || "",
        sectorSuggested: Boolean((extracted as any).supplierSector),
        currency: extracted.currency || "USD",
        incoterm: extracted.incoterm || "FOB",
        paymentTerms: extracted.paymentTerms || "",
        leadTimeDays: extracted.leadTimeDays ?? undefined,
        moq: extracted.moq ?? undefined,
        quotationDate: extracted.quotationDate ?? undefined,
        items: (extracted.items || []).map((it) => ({
          productName: it.productName,
          description: it.description || undefined,
          productNameOriginal: it.productNameOriginal || undefined,
          ncmCode: it.ncmCode || undefined,
          ncmConfidence: it.ncmConfidence ?? undefined,
          quantity: it.quantity,
          unit: it.unit || "UN",
          unitPrice: (it.unitPriceCents || 0) / 100,
        })),
        confidence: extracted.confidence,
        fileUrl: uploaded.fileUrl,
        fileName: file.name,
      });
      toast.success(`Proforma extraída (confiança ${extracted.confidence}%). Revise antes de salvar.`);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao processar a proforma");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  function startManual() {
    setEditingId(null);
    setDraft({ ...emptyDraft, items: [{ productName: "", quantity: 1, unit: "UN", unitPrice: 0 }] });
  }

  // ---- Salvar + distribuir ----
  async function handleSaveAndDistribute() {
    if (!draft) return;
    if (!draft.supplierName.trim()) {
      toast.error("Informe o nome do fornecedor");
      return;
    }
    if (draft.items.length === 0 || draft.items.some((i) => !i.productName.trim())) {
      toast.error("Inclua ao menos um item com nome");
      return;
    }

    const items = draft.items.map((i) => ({
      productName: i.productName,
      description: i.description?.trim() || undefined,
      ncmCode: i.ncmCode || undefined,
      quantity: i.quantity,
      unit: i.unit,
      unitPriceCents: Math.round(i.unitPrice * 100),
    }));

    try {
      // Modo edição: apenas salva as alterações (não redistribui).
      if (editingId != null) {
        await updateMutation.mutateAsync({
          id: editingId,
          supplierName: draft.supplierName,
          supplierCountry: draft.supplierCountry,
          supplierEmail: draft.supplierEmail || undefined,
          supplierPhone: draft.supplierPhone || undefined,
          supplierSector: draft.supplierSector || undefined,
          currency: draft.currency,
          incoterm: draft.incoterm,
          paymentTerms: draft.paymentTerms || undefined,
          leadTimeDays: draft.leadTimeDays,
          moq: draft.moq,
          quotationDate: draft.quotationDate || undefined,
          items,
        });
        toast.success("Alterações salvas. Use “Distribuir” no card quando quiser enviar para a Base.");
        setDraft(null);
        setEditingId(null);
        utils.proforma.list.invalidate();
        return;
      }

      // Modo criação: cria e já distribui para a Base.
      const created = await createMutation.mutateAsync({
        supplierName: draft.supplierName,
        supplierCountry: draft.supplierCountry,
        supplierEmail: draft.supplierEmail || undefined,
        supplierPhone: draft.supplierPhone || undefined,
        supplierSector: draft.supplierSector || undefined,
        currency: draft.currency,
        incoterm: draft.incoterm,
        paymentTerms: draft.paymentTerms || undefined,
        leadTimeDays: draft.leadTimeDays,
        moq: draft.moq,
        quotationDate: draft.quotationDate || undefined,
        fileUrl: draft.fileUrl,
        fileName: draft.fileName,
        extractionConfidence: draft.confidence,
        items,
      });

      toast.success(`Proforma ${created.numero} criada. Distribuindo para a Base...`);

      const dist = await distributeMutation.mutateAsync({ proformaId: created.id });
      toast.success(
        `✓ Fornecedor enviado para Indústrias & Fornecedores · ${dist.productIds.length} produto(s) em Ativos & Insumos`
      );

      setDraft(null);
      setEditingId(null);
      utils.proforma.list.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar proforma");
    }
  }

  const busy = createMutation.isPending || updateMutation.isPending || distributeMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Proformas & Invoices</h1>
        <p className="text-muted-foreground">
          Suba a proforma — a Excambia estrutura os dados e distribui: fabricante → Indústrias &amp;
          Fornecedores, produtos/valores → Ativos &amp; Insumos.
        </p>
      </div>

      {/* Entrada */}
      {!draft && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-[#682ABA]" /> Subir proforma (PDF/imagem)
              </CardTitle>
              <CardDescription>A Excambia extrai fornecedor, itens, preços e condições.</CardDescription>
            </CardHeader>
            <CardContent>
              <label
                htmlFor="proforma-file"
                className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition"
              >
                {isUploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-[#682ABA] mb-2" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                )}
                <p className="text-sm font-medium">{isUploading ? "Processando..." : "Clique para enviar"}</p>
                <p className="text-xs text-muted-foreground">PDF, JPG ou PNG · até 16MB</p>
                <input
                  id="proforma-file"
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" /> Cadastro manual
              </CardTitle>
              <CardDescription>Preencha os dados da proforma manualmente.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={startManual}>
                Começar cadastro manual
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revisão / edição do rascunho */}
      {draft && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> {editingId != null ? "Editar proforma" : "Revisar proforma"}
              </CardTitle>
              {draft.confidence != null && (
                <Badge className="bg-amber-100 text-amber-800">Confiança IA: {draft.confidence}%</Badge>
              )}
            </div>
            <CardDescription>
              {editingId != null
                ? "Ajuste os dados e salve. A distribuição para a Base continua sendo uma ação separada."
                : "Confira e ajuste os dados antes de distribuir para a Base."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Fornecedor */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Fornecedor / Fabricante
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nome *">
                  <Input value={draft.supplierName} onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })} />
                </Field>
                <Field label="País">
                  <Input value={draft.supplierCountry} onChange={(e) => setDraft({ ...draft, supplierCountry: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input value={draft.supplierEmail} onChange={(e) => setDraft({ ...draft, supplierEmail: e.target.value })} />
                </Field>
                <Field label="Telefone">
                  <Input value={draft.supplierPhone} onChange={(e) => setDraft({ ...draft, supplierPhone: e.target.value })} />
                </Field>
                <Field label="Setor">
                  <Select
                    value={draft.supplierSector || "none"}
                    onValueChange={(v) =>
                      setDraft({ ...draft, supplierSector: v === "none" ? "" : v, sectorSuggested: false })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o setor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não definido</SelectItem>
                      {SECTOR_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {draft.sectorSuggested && draft.supplierSector && (
                    <p className="text-[10px] text-violet-600 mt-0.5">
                      Sugerido pela Excambia — ajuste se necessário. Aplicado ao fornecedor na distribuição.
                    </p>
                  )}
                </Field>
              </div>
            </div>

            {/* Condições */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Condições comerciais</h3>
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Data da proforma">
                  <Input
                    type="date"
                    value={draft.quotationDate ?? ""}
                    onChange={(e) => setDraft({ ...draft, quotationDate: e.target.value || undefined })}
                  />
                </Field>
                <Field label="Moeda">
                  <Input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Incoterm">
                  <Input value={draft.incoterm} onChange={(e) => setDraft({ ...draft, incoterm: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Lead time (dias)">
                  <Input
                    type="number"
                    value={draft.leadTimeDays ?? ""}
                    onChange={(e) => setDraft({ ...draft, leadTimeDays: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </Field>
                <Field label="MOQ">
                  <Input
                    type="number"
                    value={draft.moq ?? ""}
                    onChange={(e) => setDraft({ ...draft, moq: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </Field>
                <div className="md:col-span-4">
                  <Field label="Condições de pagamento">
                    <Input value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} />
                  </Field>
                </div>
              </div>
            </div>

            {/* Itens */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" /> Itens
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({ ...draft, items: [...draft.items, { productName: "", quantity: 1, unit: "UN", unitPrice: 0 }] })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Item
                </Button>
              </div>
              <div className="space-y-3">
                {draft.items.map((item, idx) => (
                  <div key={idx} className="space-y-2 rounded-lg border border-slate-200 p-2.5">
                    <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Label className="text-xs">Produto (nome curto)</Label>
                      <Input
                        value={item.productName}
                        onChange={(e) => updateItem(idx, { productName: e.target.value })}
                        placeholder="Ex.: Escora de aço 4m, tubo 60, galv. a fogo"
                      />
                      {item.productNameOriginal && item.productNameOriginal !== item.productName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={item.productNameOriginal}>
                          Original: {item.productNameOriginal}
                        </p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">NCM</Label>
                      <Input value={item.ncmCode ?? ""} onChange={(e) => updateItem(idx, { ncmCode: e.target.value, ncmConfidence: undefined })} placeholder="auto" />
                      {item.ncmCode && item.ncmConfidence != null && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Sugerida · {item.ncmConfidence}% — confirme
                        </p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qtd</Label>
                      <Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs">Un</Label>
                      <Input value={item.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Preço unit. ({draft.currency})</Label>
                      <Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-1">
                      <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    </div>
                    <div>
                      <Label className="text-xs">Especificações técnicas (vão para a descrição do produto)</Label>
                      <Textarea
                        value={item.description ?? ""}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder="Ex.: Tubo interno 48x2,2x2200mm; Placa de base 120x120x5mm; Galvanizado a fogo; Peso bruto 13kg"
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => { setDraft(null); setEditingId(null); }} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={handleSaveAndDistribute} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                {editingId != null ? "Salvar alterações" : "Salvar e distribuir para a Base"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle>Proformas cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !proformas || proformas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma proforma ainda. Suba a primeira acima.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {proformas.map((p) => (
                <OperationCard
                  key={p.id}
                  entity={{
                    id: p.id,
                    title: `PF-${p.numero || p.id}`,
                    supplierName: p.supplierName ?? undefined,
                    status: p.status,
                    estimatedValue: p.totalFobCents ?? undefined,
                    origin: p.supplierCountry ?? undefined,
                    // Mostra data de distribuição se já foi distribuída, senão mostra atualização
                    lastUpdated: p.status === "distribuida" ? (p.distributedAt ?? p.updatedAt) : p.updatedAt,
                    avatar: {
                      initials: (p.supplierName || "PF").substring(0, 2).toUpperCase(),
                      color: "teal",
                    },
                  }}
                  compact={false}
                  actions={(() => {
                    const acts: OperationCardAction[] = [
                      {
                        label: loadingEditId === p.id ? "Abrindo..." : "Revisar",
                        icon: <Edit className="h-4 w-4" />,
                        onClick: async () => { await openForEdit(p.id); },
                      },
                    ];
                    if (p.status !== "distribuida") {
                      acts.push({
                        label: "Distribuir",
                        icon: <Share2 className="h-4 w-4" />,
                        onClick: async () => { distributeMutation.mutate({ proformaId: p.id }); },
                      });
                    }
                    acts.push({
                      label: "Excluir",
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: "destructive",
                      onClick: () => handleDeleteProforma(p.id, `PF-${p.numero || p.id}`),
                    });
                    return acts;
                  })()}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    if (!draft) return;
    const items = draft.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setDraft({ ...draft, items });
  }
  function removeItem(idx: number) {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) });
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
