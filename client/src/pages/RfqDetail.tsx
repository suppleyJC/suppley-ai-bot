/**
 * RFQ Detail - Detalhes completos de uma RFQ com gestão de cotações
 * 
 * Mostra informações da RFQ, itens, cotações de fornecedores recebidas,
 * e permite adicionar novas cotações e converter para cálculo de importação.
 */

import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Globe,
  Ship,
  Clock,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Plus,
  Loader2,
  Building2,
  User,
  MapPin,
  FileText,
  Calculator,
  X,
} from "lucide-react";

// ============================================================
// STATUS CONFIG
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: "Rascunho", color: "text-slate-400", bgColor: "bg-slate-500/10" },
  submitted: { label: "Enviada", color: "text-blue-400", bgColor: "bg-blue-500/10" },
  sourcing: { label: "Buscando Fornecedores", color: "text-purple-400", bgColor: "bg-purple-500/10" },
  quotes_sent: { label: "Cotações Enviadas", color: "text-amber-400", bgColor: "bg-amber-500/10" },
  quotes_received: { label: "Respostas Recebidas", color: "text-cyan-400", bgColor: "bg-cyan-500/10" },
  analyzing: { label: "Analisando", color: "text-orange-400", bgColor: "bg-orange-500/10" },
  ready: { label: "Pronta", color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  presented: { label: "Apresentada ao Cliente", color: "text-indigo-400", bgColor: "bg-indigo-500/10" },
  accepted: { label: "Aceita", color: "text-green-400", bgColor: "bg-green-500/10" },
  rejected: { label: "Rejeitada", color: "text-red-400", bgColor: "bg-red-500/10" },
  converted: { label: "Convertida em Pedido", color: "text-emerald-300", bgColor: "bg-emerald-500/20" },
  expired: { label: "Expirada", color: "text-slate-500", bgColor: "bg-slate-500/10" },
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function RfqDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const rfqId = parseInt(params.id || "0");
  const [showAddQuote, setShowAddQuote] = useState(false);

  const { data: rfq, isLoading, error } = trpc.rfq.getById.useQuery(
    { id: rfqId },
    { enabled: rfqId > 0 }
  );

  const trpcUtils = trpc.useUtils();

  // Form state for adding supplier quote
  const [quoteForm, setQuoteForm] = useState({
    supplierName: "",
    supplierCountry: "CN",
    supplierEmail: "",
    supplierPhone: "",
    incoterm: "FOB",
    paymentTerms: "",
    leadTimeDays: 30,
    communicationChannel: "email" as const,
    items: [] as Array<{ rfqItemId: number; unitPriceCents: number; quantity: number; unit: string }>,
  });

  const addQuoteMutation = trpc.rfq.addSupplierQuote.useMutation({
    onSuccess: () => {
      toast.success("Cotação do fornecedor adicionada com sucesso!");
      setShowAddQuote(false);
      trpcUtils.rfq.getById.invalidate({ id: rfqId });
      // Reset form
      setQuoteForm({
        supplierName: "",
        supplierCountry: "CN",
        supplierEmail: "",
        supplierPhone: "",
        incoterm: "FOB",
        paymentTerms: "",
        leadTimeDays: 30,
        communicationChannel: "email",
        items: [],
      });
    },
    onError: (error) => {
      toast.error(`Erro ao adicionar cotação: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || !rfq) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white text-lg mb-2">RFQ não encontrada</p>
          <button onClick={() => setLocation("/rfq")} className="text-emerald-400 hover:underline">
            Voltar para lista
          </button>
        </div>
      </div>
    );
  }

  const statusConf = STATUS_CONFIG[rfq.status] || STATUS_CONFIG.draft;
  const preferredCountries = rfq.preferredCountries ? JSON.parse(rfq.preferredCountries) : [];

  const handleAddQuote = () => {
    if (!quoteForm.supplierName || quoteForm.items.length === 0) {
      toast.error("Preencha o nome do fornecedor e pelo menos um item");
      return;
    }
    addQuoteMutation.mutate({
      rfqId,
      supplierName: quoteForm.supplierName,
      supplierCountry: quoteForm.supplierCountry,
      supplierEmail: quoteForm.supplierEmail || undefined,
      supplierPhone: quoteForm.supplierPhone || undefined,
      incoterm: quoteForm.incoterm,
      paymentTerms: quoteForm.paymentTerms || undefined,
      leadTimeDays: quoteForm.leadTimeDays || undefined,
      communicationChannel: quoteForm.communicationChannel,
      items: quoteForm.items.map(item => ({
        rfqItemId: item.rfqItemId,
        unitPriceCents: Math.round(item.unitPriceCents * 100), // Convert to cents
        quantity: item.quantity,
        unit: item.unit,
      })),
    });
  };

  // Initialize quote items from RFQ items
  const initializeQuoteItems = () => {
    if (rfq.items && quoteForm.items.length === 0) {
      setQuoteForm(prev => ({
        ...prev,
        items: rfq.items.map(item => ({
          rfqItemId: item.id,
          unitPriceCents: 0,
          quantity: item.quantity,
          unit: item.unit,
        })),
      }));
    }
    setShowAddQuote(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setLocation("/rfq")}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-slate-300" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-slate-500">{rfq.rfqNumber}</span>
                <span className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full ${statusConf.bgColor} ${statusConf.color}`}>
                  {statusConf.label}
                </span>
                {rfq.urgency === "urgent" && (
                  <span className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-400">
                    <AlertTriangle className="w-3 h-3" /> Urgente
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white">{rfq.title}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">Países</span>
            </div>
            <p className="text-sm text-white font-medium">
              {preferredCountries.length > 0 ? preferredCountries.join(", ") : "Qualquer"}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Ship className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">Incoterm</span>
            </div>
            <p className="text-sm text-white font-medium">{rfq.preferredIncoterm || "FOB"}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">Destino</span>
            </div>
            <p className="text-sm text-white font-medium">
              {rfq.destinationPort ? `${rfq.destinationPort} (${rfq.destinationState})` : rfq.destinationState}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">Criada em</span>
            </div>
            <p className="text-sm text-white font-medium">
              {new Date(rfq.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        {/* Client Info (if for client) */}
        {rfq.requesterType === "client" && rfq.clientName && (
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
            <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" /> Dados do Cliente
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-500">Nome</span>
                <p className="text-white">{rfq.clientName}</p>
              </div>
              {rfq.clientCompany && (
                <div>
                  <span className="text-xs text-slate-500">Empresa</span>
                  <p className="text-white">{rfq.clientCompany}</p>
                </div>
              )}
              {rfq.clientEmail && (
                <div>
                  <span className="text-xs text-slate-500">Email</span>
                  <p className="text-white">{rfq.clientEmail}</p>
                </div>
              )}
              {rfq.clientCnpj && (
                <div>
                  <span className="text-xs text-slate-500">CNPJ</span>
                  <p className="text-white">{rfq.clientCnpj}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            Itens Solicitados ({rfq.items?.length || 0})
          </h3>
          <div className="space-y-3">
            {rfq.items?.map((item: any) => (
              <div key={item.id} className="bg-slate-900/50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{item.productName}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>{item.quantity?.toLocaleString()} {item.unit}</span>
                    {item.ncmCode && <span className="text-amber-400">NCM: {item.ncmCode}</span>}
                    {item.description && <span className="truncate max-w-[200px]">{item.description}</span>}
                  </div>
                </div>
                {item.targetUnitPriceCents && (
                  <span className="text-sm text-slate-300">
                    Alvo: ${(item.targetUnitPriceCents / 100).toFixed(2)}/un
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Supplier Quotes */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Cotações de Fornecedores ({rfq.supplierQuotes?.length || 0})
            </h3>
            <button
              onClick={initializeQuoteItems}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-500/20 transition-all text-sm"
            >
              <Plus className="w-4 h-4" /> Adicionar Cotação
            </button>
          </div>

          {rfq.supplierQuotes && rfq.supplierQuotes.length > 0 ? (
            <div className="space-y-3">
              {rfq.supplierQuotes.map((quote: any) => (
                <div key={quote.id} className="bg-slate-900/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                      <span className="text-white font-medium">{quote.supplierName}</span>
                      <span className="text-xs text-slate-400">{quote.supplierCountry}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {quote.totalFobCents && (
                        <span className="text-emerald-400 font-bold">
                          ${(quote.totalFobCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {quote.excambiaScore && (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          quote.excambiaScore >= 70 ? "bg-emerald-500/20 text-emerald-400" :
                          quote.excambiaScore >= 50 ? "bg-amber-500/20 text-amber-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>
                          Score: {quote.excambiaScore}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{quote.incoterm}</span>
                    {quote.paymentTerms && <span>{quote.paymentTerms}</span>}
                    {quote.leadTimeDays && <span>{quote.leadTimeDays} dias</span>}
                    <span>{quote.communicationChannel}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Nenhuma cotação recebida ainda</p>
              <p className="text-xs text-slate-500 mt-1">Adicione cotações conforme receber respostas dos fornecedores</p>
            </div>
          )}
        </div>

        {/* Add Quote Modal */}
        {showAddQuote && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Adicionar Cotação de Fornecedor</h3>
                <button onClick={() => setShowAddQuote(false)} className="p-2 rounded-lg hover:bg-slate-800">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Supplier Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nome do Fornecedor *</label>
                    <input
                      value={quoteForm.supplierName}
                      onChange={(e) => setQuoteForm(prev => ({ ...prev, supplierName: e.target.value }))}
                      placeholder="Ex: Tianjin Steel Co."
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">País *</label>
                    <select
                      value={quoteForm.supplierCountry}
                      onChange={(e) => setQuoteForm(prev => ({ ...prev, supplierCountry: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-all"
                    >
                      <option value="CN">China</option>
                      <option value="IN">Índia</option>
                      <option value="TR">Turquia</option>
                      <option value="VN">Vietnã</option>
                      <option value="KR">Coreia do Sul</option>
                      <option value="PY">Paraguai</option>
                      <option value="DE">Alemanha</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Email</label>
                    <input
                      value={quoteForm.supplierEmail}
                      onChange={(e) => setQuoteForm(prev => ({ ...prev, supplierEmail: e.target.value }))}
                      placeholder="supplier@company.com"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Prazo de Entrega (dias)</label>
                    <input
                      type="number"
                      value={quoteForm.leadTimeDays}
                      onChange={(e) => setQuoteForm(prev => ({ ...prev, leadTimeDays: parseInt(e.target.value) || 30 }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Incoterm</label>
                    <select
                      value={quoteForm.incoterm}
                      onChange={(e) => setQuoteForm(prev => ({ ...prev, incoterm: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-all"
                    >
                      <option value="EXW">EXW</option>
                      <option value="FOB">FOB</option>
                      <option value="CFR">CFR</option>
                      <option value="CIF">CIF</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Condições de Pagamento</label>
                    <input
                      value={quoteForm.paymentTerms}
                      onChange={(e) => setQuoteForm(prev => ({ ...prev, paymentTerms: e.target.value }))}
                      placeholder="Ex: 30% TT + 70% BL"
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Items pricing */}
                <div className="border-t border-slate-700 pt-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Preços por Item</h4>
                  <div className="space-y-3">
                    {quoteForm.items.map((item, index) => {
                      const rfqItem = rfq.items?.find((i: any) => i.id === item.rfqItemId);
                      return (
                        <div key={index} className="bg-slate-800/50 rounded-xl p-4">
                          <p className="text-sm text-white mb-2">{rfqItem?.productName || `Item ${index + 1}`}</p>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Preço Unit. (USD)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={item.unitPriceCents || ""}
                                onChange={(e) => {
                                  const newItems = [...quoteForm.items];
                                  newItems[index].unitPriceCents = parseFloat(e.target.value) || 0;
                                  setQuoteForm(prev => ({ ...prev, items: newItems }));
                                }}
                                placeholder="0.00"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Quantidade</label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => {
                                  const newItems = [...quoteForm.items];
                                  newItems[index].quantity = parseInt(e.target.value) || 0;
                                  setQuoteForm(prev => ({ ...prev, items: newItems }));
                                }}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Total</label>
                              <p className="px-3 py-2 text-emerald-400 font-medium text-sm">
                                ${((item.unitPriceCents || 0) * (item.quantity || 0)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                  <button
                    onClick={() => setShowAddQuote(false)}
                    className="px-6 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddQuote}
                    disabled={addQuoteMutation.isPending}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {addQuoteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Salvar Cotação
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
          <a
            href={`/calculate?rfqId=${rfqId}`}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
          >
            <Calculator className="w-4 h-4" /> Calcular Custo de Importação
          </a>
          <a
            href="/excambia"
            className="flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700 transition-all"
          >
            <Sparkles className="w-4 h-4" /> Analisar com Excambia
          </a>
        </div>

        {/* Notes */}
        {rfq.notes && (
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Observações</h3>
            <p className="text-slate-400 text-sm whitespace-pre-wrap">{rfq.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
