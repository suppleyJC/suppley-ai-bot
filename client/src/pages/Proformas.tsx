import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Upload, Sparkles, Trash2, Plus, ArrowRight, Loader2, CheckCircle2, Building2, Package, Copy, Edit } from "lucide-react";
import OperationCard from "@/components/OperationCard";

type ItemDraft = {
  productName: string;
  productNameOriginal?: string;
  ncmCode?: string;
  ncmConfidence?: number;
  quantity: number;
  unit: string;
  unitPrice: number; // em unidades da moeda (não centavos) — UX
};

type Draft = {
  supplierName: string;
  supplierCountry: string;
  supplierEmail: string;
  supplierPhone: string;
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
  const [isUploading, setIsUploading] = useState(false);

  const utils = trpc.useUtils();
  const { data: proformas, isLoading } = trpc.proforma.list.useQuery();

  const uploadMutation = trpc.calculations.uploadQuotation.useMutation();
  const extractMutation = trpc.proforma.extract.useMutation();
  const createMutation = trpc.proforma.create.useMutation();
  const distributeMutation = trpc.proforma.distribute.useMutation();

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

      setDraft({
        supplierName: extracted.supplierName || "",
        supplierCountry: extracted.supplierCountry || "",
        supplierEmail: extracted.supplierEmail || "",
        supplierPhone: extracted.supplierPhone || "",
        currency: extracted.currency || "USD",
        incoterm: extracted.incoterm || "FOB",
        paymentTerms: extracted.paymentTerms || "",
        leadTimeDays: extracted.leadTimeDays ?? undefined,
        moq: extracted.moq ?? undefined,
        quotationDate: extracted.quotationDate ?? undefined,
        items: (extracted.items || []).map((it) => ({
          productName: it.productName,
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

    try {
      const created = await createMutation.mutateAsync({
        supplierName: draft.supplierName,
        supplierCountry: draft.supplierCountry,
        supplierEmail: draft.supplierEmail || undefined,
        supplierPhone: draft.supplierPhone || undefined,
        currency: draft.currency,
        incoterm: draft.incoterm,
        paymentTerms: draft.paymentTerms || undefined,
        leadTimeDays: draft.leadTimeDays,
        moq: draft.moq,
        quotationDate: draft.quotationDate || undefined,
        fileUrl: draft.fileUrl,
        fileName: draft.fileName,
        extractionConfidence: draft.confidence,
        items: draft.items.map((i) => ({
          productName: i.productName,
          ncmCode: i.ncmCode || undefined,
          quantity: i.quantity,
          unit: i.unit,
          unitPriceCents: Math.round(i.unitPrice * 100),
        })),
      });

      toast.success(`Proforma ${created.numero} criada. Distribuindo para a Base...`);

      const dist = await distributeMutation.mutateAsync({ proformaId: created.id });
      toast.success(
        `✓ Fornecedor enviado para Indústrias & Fornecedores · ${dist.productIds.length} produto(s) em Ativos & Insumos`
      );

      setDraft(null);
      utils.proforma.list.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar proforma");
    }
  }

  const busy = createMutation.isPending || distributeMutation.isPending;

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
                <FileText className="h-5 w-5" /> Revisar proforma
              </CardTitle>
              {draft.confidence != null && (
                <Badge className="bg-amber-100 text-amber-800">Confiança IA: {draft.confidence}%</Badge>
              )}
            </div>
            <CardDescription>Confira e ajuste os dados antes de distribuir para a Base.</CardDescription>
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
              <div className="space-y-2">
                {draft.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Label className="text-xs">Produto</Label>
                      <Input
                        value={item.productName}
                        onChange={(e) => updateItem(idx, { productName: e.target.value })}
                        placeholder="Nome do produto"
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
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={handleSaveAndDistribute} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Salvar e distribuir para a Base
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
                    lastUpdated: p.updatedAt,
                    avatar: {
                      initials: (p.supplierName || "PF").substring(0, 2).toUpperCase(),
                      color: "teal",
                    },
                  }}
                  compact={false}
                  actions={[
                    { label: "Revisar", icon: <Edit className="h-4 w-4" />, onClick: () => alert("Abrir edição de " + p.id) },
                    { label: "Distribuir", onClick: () => distributeMutation.mutate({ proformaId: p.id }) },
                  ]}
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
