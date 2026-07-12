import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Upload, Sparkles, Trash2, Plus, ArrowRight, Loader2, Building2, Package, Edit, Share2, Search, X, MapPin, CalendarDays, ChevronRight } from "lucide-react";

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
  /** Chave permanente no storage — o link do arquivo é re-assinado no detalhe. */
  fileKey?: string;
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
  rascunho: { label: "Rascunho", color: "bg-muted text-foreground" },
  extraida: { label: "Extraída (revisar)", color: "bg-amber-100 text-amber-800" },
  revisada: { label: "Revisada", color: "bg-blue-100 text-blue-800" },
  distribuida: { label: "Distribuída", color: "bg-green-100 text-green-800" },
  arquivada: { label: "Arquivada", color: "bg-muted text-muted-foreground" },
};

/** Item da fila do upload em LOTE (escala: centenas/milhares de cotações). */
type BatchItem = {
  name: string;
  status: "aguardando" | "enviando" | "extraindo" | "salvando" | "ok" | "erro";
  numero?: string;
  itens?: number;
  erro?: string;
};

/** Formatos aceitos no intake de proformas (mesmo pipeline multi-formato do chat). */
const PROFORMA_ACCEPT = ".pdf,.xlsx,.xls,.csv,.docx,.txt,image/jpeg,image/png,image/webp";

/** MIME pela extensão — fallback quando o navegador não preenche file.type (csv/xls). */
function proformaMime(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".csv")) return "text/csv";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".txt")) return "text/plain";
  return "application/pdf";
}

/**
 * Erro legível para a fila: quando o proxy (nginx) responde HTML (413/504),
 * o parse de JSON falha com mensagens crípticas do navegador. Traduz.
 */
function erroLegivel(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err ?? "");
  const pareceParseDeHtml =
    m.includes("did not match the expected pattern") || // Safari
    m.includes("Unexpected token") ||                   // Chrome/Firefox
    m.includes("JSON");
  if (pareceParseDeHtml) {
    return "O servidor interrompeu a requisição (arquivo grande ou extração demorada). " +
      "Ajuste no nginx: client_max_body_size 25m e proxy_read_timeout 300s.";
  }
  return m || "falha ao processar";
}

/** File → base64 puro (em blocos, sem estourar a pilha com arquivos grandes). */
async function fileToB64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

export default function Proformas() {
  const [draft, setDraft] = useState<Draft | null>(null);
  // id da proforma em edição (null = criando uma nova).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null);
  // Fila do upload em lote (null = sem lote em andamento/exibido).
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  // Ambiente limpo tipo Ativos: busca + filtro por status ("classe" da proforma) + seleção.
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: proformas, isLoading } = trpc.proforma.list.useQuery();

  const hasFilters = search.trim() !== "" || filterStatus !== "all";

  const statusFacets = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of proformas ?? []) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return Array.from(m.entries()).map(([status, count]) => ({ status, count }));
  }, [proformas]);

  const filteredProformas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (proformas ?? []).filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (!q) return true;
      // numero já vem com prefixo "PF-"; o prefixo manual é só para o fallback pelo id.
      const hay = [p.numero || `PF-${p.id}`, p.supplierName, p.supplierCountry, p.status]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [proformas, search, filterStatus]);

  const uploadMutation = trpc.calculations.uploadQuotation.useMutation();
  const extractStartMutation = trpc.proforma.extractStart.useMutation();
  const createMutation = trpc.proforma.create.useMutation();
  const updateMutation = trpc.proforma.update.useMutation();
  // Feedback imediato + reatividade: toast com o resultado e invalidação de
  // TUDO que a distribuição toca (lista/detalhe da proforma, Ativos, Fornecedores).
  const distributeMutation = trpc.proforma.distribute.useMutation({
    onSuccess: (dist, vars) => {
      toast.success(
        `✓ Distribuída: fornecedor em Indústrias & Fornecedores · ${dist.productIds.length} produto(s) em Ativos & Insumos`,
      );
      utils.proforma.list.invalidate();
      utils.proforma.get.invalidate({ id: vars.proformaId });
      utils.products.list.invalidate();
      utils.industries.list.invalidate();
    },
    onError: (err) => toast.error(erroLegivel(err)),
  });
  const deleteMutation = trpc.proforma.delete.useMutation({
    onSuccess: (res, vars) => {
      const n = res?.deletedProductIds?.length ?? 0;
      toast.success(
        n > 0
          ? `Proforma excluída · ${n} produto(s) removido(s) de Ativos & Insumos`
          : "Proforma excluída",
      );
      // O painel direito acompanha NA HORA: sem isto, o item excluído ficava
      // visível na coluna de detalhe até um reload manual.
      setSelectedId((atual) => (atual === vars.proformaId ? null : atual));
      // Atualiza ambas as listas (proformas + produtos vinculados)
      utils.proforma.list.invalidate();
      utils.products.list.invalidate();
    },
    onError: (err) => toast.error(err?.message || "Erro ao excluir proforma"),
  });

  /**
   * Extração via JOB assíncrono: dispara no servidor e faz polling curto até
   * concluir. Requisições longas morriam no proxy (nginx 504) com arquivos
   * grandes — aqui nenhuma chamada dura mais que milissegundos.
   */
  async function extrairComPolling(fileUrl: string, mimeType: string, fileName: string) {
    const { jobId } = await extractStartMutation.mutateAsync({ fileUrl, mimeType, fileName });
    const inicio = Date.now();
    const LIMITE_MS = 15 * 60 * 1000;
    for (;;) {
      await new Promise((r) => setTimeout(r, 4000));
      const st = await utils.client.proforma.extractStatus.query({ jobId });
      if (st.status === "concluida" && st.result) return st.result;
      if (st.status === "erro") throw new Error(st.error || "Falha na extração do documento");
      if (Date.now() - inicio > LIMITE_MS) {
        throw new Error("A extração passou de 15 minutos. Tente novamente ou divida o arquivo.");
      }
    }
  }

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
  // 1 arquivo → fluxo com REVISÃO humana (modal). Vários → fila em LOTE:
  // upload → extração → salvamento automático (status "extraída"), um a um,
  // com progresso por arquivo. A distribuição para a Base segue por card.
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const grandes = files.filter((f) => f.size > 16 * 1024 * 1024);
    if (grandes.length) {
      toast.error(`Arquivo(s) acima de 16MB: ${grandes.map((f) => f.name).join(", ")}`);
      return;
    }

    if (files.length > 1) {
      await processBatch(files);
      return;
    }

    const file = files[0];
    setIsUploading(true);
    try {
      // 1) upload → fileUrl (reusa endpoint existente)
      const base64 = await fileToB64(file);
      const uploaded = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: proformaMime(file),
      });

      toast.info("Excambia analisando a proforma...");

      // 2) extração IA (job + polling — arquivos grandes levam minutos)
      const extracted = await extrairComPolling(uploaded.fileUrl, proformaMime(file), file.name);

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
        fileKey: uploaded.fileKey,
        fileName: file.name,
      });
      toast.success(`Proforma extraída (confiança ${extracted.confidence}%). Revise antes de salvar.`);
    } catch (err: any) {
      toast.error(erroLegivel(err));
    } finally {
      setIsUploading(false);
    }
  }

  // ---- LOTE: fila sequencial com progresso (preparado para centenas de arquivos) ----
  async function processBatch(files: File[]) {
    setBatchRunning(true);
    setBatch(files.map((f) => ({ name: f.name, status: "aguardando" })));
    const marca = (i: number, patch: Partial<BatchItem>) =>
      setBatch((prev) => prev?.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) ?? prev);

    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        marca(i, { status: "enviando" });
        const base64 = await fileToB64(file);
        const uploaded = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileData: base64,
          contentType: proformaMime(file),
        });

        marca(i, { status: "extraindo" });
        const ext = await extrairComPolling(uploaded.fileUrl, proformaMime(file), file.name);

        marca(i, { status: "salvando" });
        const created = await createMutation.mutateAsync({
          supplierName: ext.supplierName || file.name.replace(/\.[^.]+$/, ""),
          supplierCountry: ext.supplierCountry || undefined,
          supplierEmail: ext.supplierEmail || undefined,
          supplierPhone: ext.supplierPhone || undefined,
          supplierSector: (ext as any).supplierSector || undefined,
          currency: ext.currency || "USD",
          incoterm: ext.incoterm || "FOB",
          paymentTerms: ext.paymentTerms || undefined,
          leadTimeDays: ext.leadTimeDays ?? undefined,
          moq: ext.moq ?? undefined,
          quotationDate: ext.quotationDate ?? undefined,
          fileUrl: uploaded.fileUrl,
          fileKey: uploaded.fileKey,
          fileName: file.name,
          extractionConfidence: ext.confidence,
          rawExtraction: ext,
          // TODOS os itens entram — sem preço vira null (sinalizado), nunca descartado.
          items: (ext.items || []).map((it) => ({
            productName: it.productName,
            description: it.description || undefined,
            ncmCode: it.ncmCode || undefined,
            quantity: it.quantity,
            unit: it.unit || "UN",
            unitPriceCents:
              it.unitPriceCents != null && it.unitPriceCents > 0 ? Math.round(it.unitPriceCents) : null,
          })),
        });
        ok++;
        marca(i, { status: "ok", numero: created.numero, itens: ext.items?.length ?? 0 });
      } catch (err: any) {
        marca(i, { status: "erro", erro: erroLegivel(err) });
      }
      // A lista vai se populando conforme o lote avança.
      utils.proforma.list.invalidate();
    }

    setBatchRunning(false);
    toast.success(
      `Lote concluído: ${ok}/${files.length} proforma(s) salvas como "Extraída". ` +
      `Revise e use "Distribuir" para enviar à Base.`,
    );
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
      // Preço zerado = item cotado SEM preço → null (sinalizado na base;
      // não entra no histórico de preços como "0").
      unitPriceCents: i.unitPrice > 0 ? Math.round(i.unitPrice * 100) : null,
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
        fileKey: draft.fileKey,
        fileName: draft.fileName,
        extractionConfidence: draft.confidence,
        items,
      });

      toast.success(`Proforma ${created.numero} criada. Distribuindo para a Base...`);

      // O toast de sucesso/erro e as invalidações vêm do onSuccess/onError da
      // mutação; se a distribuição falhar, a proforma segue na lista como
      // "Extraída" para redistribuir pelo card.
      await distributeMutation.mutateAsync({ proformaId: created.id }).catch(() => {});

      setDraft(null);
      setEditingId(null);
      utils.proforma.list.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar proforma");
    }
  }

  const busy = createMutation.isPending || updateMutation.isPending || distributeMutation.isPending;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* input de arquivo (oculto) — acionado pelo botão do cabeçalho */}
      <input
        id="proforma-file"
        type="file"
        multiple
        accept={PROFORMA_ACCEPT}
        className="hidden"
        onChange={handleFileUpload}
        disabled={isUploading || batchRunning}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proformas &amp; Invoices</h1>
          <p className="text-muted-foreground text-sm">
            Suba a proforma — a Excambia estrutura e distribui: fabricante → Fornecedores, itens/valores → Ativos.
          </p>
        </div>
        {!draft && (
          <div className="flex gap-2 flex-shrink-0">
            <Button
              onClick={() => document.getElementById("proforma-file")?.click()}
              disabled={isUploading || batchRunning}
              className="gap-2"
              title="PDF, planilha (XLSX/XLS/CSV), Word, texto ou imagem — selecione VÁRIOS arquivos para processar em lote"
            >
              {isUploading || batchRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isUploading || batchRunning ? "Processando…" : "Subir proformas"}
            </Button>
            <Button variant="outline" onClick={startManual} className="gap-2">
              <Plus className="h-4 w-4" /> Manual
            </Button>
          </div>
        )}
      </div>

      {/* Progresso do LOTE — cada arquivo com seu status, sem travar a tela */}
      {batch && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                Lote de proformas ({batch.filter((b) => b.status === "ok").length}/{batch.length} concluídas)
              </CardTitle>
              {!batchRunning && (
                <Button variant="ghost" size="sm" onClick={() => setBatch(null)} className="gap-1">
                  <X className="h-4 w-4" /> Fechar
                </Button>
              )}
            </div>
            <CardDescription>
              Cada arquivo é enviado, lido pela Excambia e salvo como “Extraída”. Depois revise e distribua para a Base.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto space-y-1.5">
            {batch.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {b.status === "ok" ? (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                ) : b.status === "erro" ? (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                ) : b.status === "aguardando" ? (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-300" />
                ) : (
                  <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-violet-500" />
                )}
                <span className="truncate flex-1">{b.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {b.status === "ok"
                    ? `${b.numero} · ${b.itens} item(ns)`
                    : b.status === "erro"
                      ? (b.erro ?? "erro").slice(0, 80)
                      : b.status === "aguardando" ? "na fila"
                      : b.status === "enviando" ? "enviando…"
                      : b.status === "extraindo" ? "Excambia lendo…"
                      : "salvando…"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
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
                  <div key={idx} className="space-y-2 rounded-lg border border-border p-2.5">
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
                      <Input type="number" step="any" min={0} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
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

      {/* Lista limpa tipo Ativos (oculta durante a edição de um rascunho) */}
      {!draft && (
        <>
          {proformas && proformas.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center gap-3 py-1 border-b pb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por número, fornecedor, país…"
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status ({proformas.length})</SelectItem>
                  {statusFacets.map((f) => (
                    <SelectItem key={f.status} value={f.status}>
                      {STATUS_LABEL[f.status]?.label ?? f.status} ({f.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterStatus("all"); }} className="h-9 px-2 text-xs">
                  <X className="mr-1 h-3.5 w-3.5" /> Limpar
                </Button>
              )}
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !proformas || proformas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma proforma ainda. Suba a primeira no botão acima.</p>
            </div>
          ) : (
            <div className="flex gap-6 flex-1 min-h-0">
              {/* esquerda: lista (limpa até haver busca/filtro) */}
              <div className="flex-1 min-w-0 flex flex-col">
                {hasFilters && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {filteredProformas.length} {filteredProformas.length === 1 ? "proforma" : "proformas"} · filtro ativo
                  </p>
                )}
                {!hasFilters ? (
                  <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center">
                    <div>
                      <Search className="mb-3 h-10 w-10 mx-auto text-muted-foreground/60" />
                      <p className="text-sm text-muted-foreground">
                        Busque por número/fornecedor — ou filtre por status — para listar as proformas.
                      </p>
                    </div>
                  </div>
                ) : filteredProformas.length === 0 ? (
                  <Card className="flex-1 flex items-center justify-center">
                    <CardContent className="py-16 text-center">
                      <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-semibold mb-1">Nenhum resultado</h3>
                      <p className="text-muted-foreground">Ajuste a busca ou o status.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex-1 overflow-auto pr-1 space-y-1.5">
                    {filteredProformas.map((p) => {
                      const st = STATUS_LABEL[p.status];
                      const isSel = p.id === selectedId;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedId(p.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-all ${
                            isSel
                              ? "border-violet-400 bg-violet-50/60 ring-1 ring-violet-200"
                              : "border-border bg-card hover:border-border hover:bg-muted/60"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold text-foreground">{p.numero || `PF-${p.id}`}</span>
                                {st && <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1 truncate">
                                  <Building2 className="h-3 w-3" />{p.supplierName || "Fornecedor n/d"}
                                </span>
                                {p.supplierCountry && (
                                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.supplierCountry}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                {p.totalFobCents != null ? (
                                  <div className="text-sm font-semibold text-foreground">{fmtCents(p.totalFobCents, p.currency)}</div>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">sem total</span>
                                )}
                                <div className="text-[11px] text-muted-foreground">{fmtDate(p.quotationDate ?? p.updatedAt)}</div>
                              </div>
                              <ChevronRight className={`h-4 w-4 ${isSel ? "text-violet-500" : "text-muted-foreground/60"}`} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* detalhe inline (telas menores) */}
                {selectedId && (
                  <div className="lg:hidden mt-4">
                    <ProformaDetail
                      id={selectedId}
                      loadingEditId={loadingEditId}
                      onEdit={openForEdit}
                      onDistribute={(id) => distributeMutation.mutate({ proformaId: id })}
                      distributing={distributeMutation.isPending}
                      deleting={deleteMutation.isPending}
                      onDelete={handleDeleteProforma}
                      onClose={() => setSelectedId(null)}
                    />
                  </div>
                )}
              </div>

              {/* direita: detalhe da proforma selecionada */}
              <aside className="hidden lg:block w-[400px] flex-shrink-0 overflow-y-auto">
                {selectedId ? (
                  <ProformaDetail
                    id={selectedId}
                    loadingEditId={loadingEditId}
                    onEdit={openForEdit}
                    onDistribute={(id) => distributeMutation.mutate({ proformaId: id })}
                    distributing={distributeMutation.isPending}
                    deleting={deleteMutation.isPending}
                    onDelete={handleDeleteProforma}
                    onClose={() => setSelectedId(null)}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center">
                    <FileText className="mb-3 h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">Selecione uma proforma para ver fornecedor, itens e condições.</p>
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}
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

function fmtCents(cents?: number | null, currency?: string | null): string {
  if (cents == null) return "—";
  const v = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${v}` : `R$ ${v}`;
}
function fmtDate(d?: string | Date | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
}

/** Painel de detalhe da proforma selecionada — abre ao clicar no card. */
function ProformaDetail({
  id, loadingEditId, onEdit, onDistribute, distributing, deleting, onDelete, onClose,
}: {
  id: number;
  loadingEditId: number | null;
  onEdit: (id: number) => void | Promise<void>;
  onDistribute: (id: number) => void;
  distributing?: boolean;
  deleting?: boolean;
  onDelete: (id: number, label: string) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.proforma.get.useQuery({ id });

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!data) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Proforma não encontrada.</div>;
  }

  const p = data.proforma as any;
  const items = (data.items ?? []) as any[];
  const st = STATUS_LABEL[p.status];
  const label = p.numero || `PF-${p.id}`;
  const sectorLabel = SECTOR_OPTIONS.find((s) => s.value === p.supplierSector)?.label;
  const total = items.reduce((s, it) => s + (it.unitPriceCents || 0) * (it.quantity || 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-start gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-foreground">{label}</h2>
            {st && <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{p.supplierName || "Fornecedor não informado"}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(id)} disabled={loadingEditId === id} className="gap-1.5">
            <Edit className="h-3.5 w-3.5" /> {loadingEditId === id ? "Abrindo…" : "Revisar"}
          </Button>
          {p.status !== "distribuida" && (
            <Button size="sm" variant="outline" onClick={() => onDistribute(id)} disabled={distributing} className="gap-1.5">
              {distributing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
              {distributing ? "Distribuindo…" : "Distribuir"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(id, label)}
            disabled={deleting || distributing}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {deleting ? "Excluindo…" : "Excluir"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Spec label="País" value={p.supplierCountry || "—"} />
          <Spec label="Setor" value={sectorLabel || "—"} />
          <Spec label="Email" value={p.supplierEmail || "—"} />
          <Spec label="Telefone" value={p.supplierPhone || "—"} />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Condições comerciais</p>
          <div className="grid grid-cols-2 gap-2">
            <Spec label="Data" value={fmtDate(p.quotationDate)} icon={<CalendarDays className="h-3 w-3" />} />
            <Spec label="Moeda" value={p.currency || "—"} />
            <Spec label="Incoterm" value={p.incoterm || "—"} />
            <Spec label="Lead time" value={p.leadTimeDays != null ? `${p.leadTimeDays} dias` : "—"} />
            <Spec label="MOQ" value={p.moq != null ? String(p.moq) : "—"} />
            <Spec label="Pagamento" value={p.paymentTerms || "—"} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Itens ({items.length})</p>
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/60 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{it.productName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {it.quantity} {it.unit || "UN"}{it.ncmCode ? ` · NCM ${it.ncmCode}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold text-foreground shrink-0">
                    {fmtCents(it.unitPriceCents, p.currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">Total FOB</span>
              <span className="font-semibold text-foreground">{fmtCents(total, p.currency)}</span>
            </div>
          )}
        </div>

        {p.fileUrl && (
          <a href={p.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline">
            <FileText className="h-3.5 w-3.5" /> Abrir arquivo original
          </a>
        )}
      </div>
    </div>
  );
}

function Spec({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/60 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-sm font-medium text-foreground truncate">{value}</div>
    </div>
  );
}
