/**
 * RFQ Dashboard - Pipeline visual de gestão de cotações
 * 
 * Mostra todas as RFQs em um pipeline com status,
 * métricas, e ações rápidas. Integra com Excambia para insights.
 * 
 * SUPPLEY Calc - Ferramenta Inteligente de Importação
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  Plus,
  Search,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Package,
  Globe,
  DollarSign,
  Send,
  Zap,
  MessageSquare,
  Eye,
  Loader2,
} from "lucide-react";

// ============================================================
// STATUS CONFIG
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  draft: { label: "Rascunho", color: "text-slate-400", bgColor: "bg-slate-500/10", icon: FileText },
  submitted: { label: "Enviada", color: "text-blue-400", bgColor: "bg-blue-500/10", icon: Send },
  sourcing: { label: "Buscando", color: "text-purple-400", bgColor: "bg-purple-500/10", icon: Search },
  quotes_sent: { label: "Cotações Enviadas", color: "text-amber-400", bgColor: "bg-amber-500/10", icon: Globe },
  quotes_received: { label: "Respostas", color: "text-cyan-400", bgColor: "bg-cyan-500/10", icon: MessageSquare },
  analyzing: { label: "Analisando", color: "text-orange-400", bgColor: "bg-orange-500/10", icon: Sparkles },
  ready: { label: "Pronta", color: "text-emerald-400", bgColor: "bg-emerald-500/10", icon: CheckCircle },
  presented: { label: "Apresentada", color: "text-indigo-400", bgColor: "bg-indigo-500/10", icon: Eye },
  accepted: { label: "Aceita", color: "text-green-400", bgColor: "bg-green-500/10", icon: CheckCircle },
  rejected: { label: "Rejeitada", color: "text-red-400", bgColor: "bg-red-500/10", icon: XCircle },
  converted: { label: "Convertida", color: "text-emerald-300", bgColor: "bg-emerald-500/20", icon: TrendingUp },
  expired: { label: "Expirada", color: "text-slate-500", bgColor: "bg-slate-500/10", icon: Clock },
};

const VERDICT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  GO: { label: "GO", color: "text-emerald-400", bgColor: "bg-emerald-500/20" },
  NEGOTIATE: { label: "NEGOCIAR", color: "text-amber-400", bgColor: "bg-amber-500/20" },
  NO_GO: { label: "NO GO", color: "text-red-400", bgColor: "bg-red-500/20" },
  WAIT: { label: "AGUARDAR", color: "text-blue-400", bgColor: "bg-blue-500/20" },
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function RfqDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Buscar dados reais do backend
  const { data: rfqList, isLoading: isLoadingList } = trpc.rfq.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
    offset: 0,
  });

  const { data: stats, isLoading: isLoadingStats } = trpc.rfq.stats.useQuery();

  // Filtrar por busca local
  const filteredRfqs = (rfqList || []).filter(rfq => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return rfq.title.toLowerCase().includes(q) ||
      rfq.rfqNumber.toLowerCase().includes(q) ||
      (rfq.clientName && rfq.clientName.toLowerCase().includes(q));
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Solicitações de Cotação</h1>
                <p className="text-sm text-slate-400">Gerencie suas RFQs e acompanhe o pipeline</p>
              </div>
            </div>
            <a
              href="/rfq/new"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
            >
              <Plus className="w-4 h-4" /> Nova RFQ
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs text-slate-400">Total RFQs</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {isLoadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.totalRfqs || 0}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-xs text-slate-400">Ativas</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {isLoadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.activeRfqs || 0}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-xs text-slate-400">Convertidas</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {isLoadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.convertedRfqs || 0}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-xs text-slate-400">Score Médio</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {isLoadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : stats?.averageScore || 0}
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, número ou cliente..."
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 transition-all"
            >
              <option value="all">Todos os status</option>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading State */}
        {isLoadingList && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            <span className="ml-3 text-slate-400">Carregando RFQs...</span>
          </div>
        )}

        {/* RFQ List */}
        {!isLoadingList && (
          <div className="space-y-4">
            {filteredRfqs.map(rfq => {
              const statusConf = STATUS_CONFIG[rfq.status] || STATUS_CONFIG.draft;
              const StatusIcon = statusConf.icon;
              const verdictConf = rfq.excambiaVerdict ? VERDICT_CONFIG[rfq.excambiaVerdict] : null;
              const preferredCountries = rfq.preferredCountries ? JSON.parse(rfq.preferredCountries) : [];

              return (
                <a
                  key={rfq.id}
                  href={`/rfq/${rfq.id}`}
                  className="block bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 hover:border-slate-600 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-mono text-slate-500">{rfq.rfqNumber}</span>
                        <span className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full ${statusConf.bgColor} ${statusConf.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConf.label}
                        </span>
                        {rfq.urgency === "urgent" && (
                          <span className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-400">
                            <AlertTriangle className="w-3 h-3" /> Urgente
                          </span>
                        )}
                        {rfq.urgency === "fast" && (
                          <span className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-400">
                            <Clock className="w-3 h-3" /> Rápido
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-emerald-400 transition-colors">
                        {rfq.title}
                      </h3>

                      {/* Meta */}
                      <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" />
                          {preferredCountries.length > 0
                            ? preferredCountries.map((c: string) => 
                                c === "CN" ? "China" : c === "IN" ? "Índia" : c === "TR" ? "Turquia" : c === "VN" ? "Vietnã" : c
                              ).join(", ")
                            : "Qualquer país"
                          }
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" />
                          {rfq.preferredIncoterm || "FOB"}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          {rfq.currency}
                        </span>
                        {rfq.clientName && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {rfq.clientName}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          {new Date(rfq.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>

                    {/* Right side: Score + Verdict */}
                    <div className="flex items-center gap-4 ml-6">
                      {rfq.excambiaScore !== null && rfq.excambiaScore !== undefined && (
                        <div className="text-center">
                          <div className="relative w-16 h-16">
                            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-700" />
                              <circle
                                cx="32" cy="32" r="28" fill="none" strokeWidth="4"
                                strokeDasharray={`${(rfq.excambiaScore / 100) * 175.9} 175.9`}
                                strokeLinecap="round"
                                className={rfq.excambiaScore >= 70 ? "text-emerald-500" : rfq.excambiaScore >= 50 ? "text-amber-500" : "text-red-500"}
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                              {rfq.excambiaScore}
                            </span>
                          </div>
                        </div>
                      )}
                      {verdictConf && (
                        <span className={`text-sm font-bold px-4 py-2 rounded-xl ${verdictConf.bgColor} ${verdictConf.color}`}>
                          {verdictConf.label}
                        </span>
                      )}
                      <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <div className="flex items-center gap-2">
                      {["submitted", "sourcing", "quotes_sent", "quotes_received", "analyzing", "ready"].map((step) => {
                        const stepOrder = ["draft", "submitted", "sourcing", "quotes_sent", "quotes_received", "analyzing", "ready", "presented", "accepted", "converted"];
                        const currentOrder = stepOrder.indexOf(rfq.status);
                        const stepOrderIndex = stepOrder.indexOf(step);
                        const isCompleted = stepOrderIndex <= currentOrder;
                        const isCurrent = step === rfq.status;
                        
                        return (
                          <div key={step} className="flex items-center flex-1">
                            <div className={`
                              h-1.5 flex-1 rounded-full transition-all
                              ${isCompleted ? "bg-emerald-500" : "bg-slate-700"}
                              ${isCurrent ? "bg-emerald-400 animate-pulse" : ""}
                            `} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-slate-500">Enviada</span>
                      <span className="text-[10px] text-slate-500">Pronta</span>
                    </div>
                  </div>
                </a>
              );
            })}

            {filteredRfqs.length === 0 && !isLoadingList && (
              <div className="text-center py-16">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-2">
                  {searchQuery || statusFilter !== "all" 
                    ? "Nenhuma RFQ encontrada com esses filtros" 
                    : "Nenhuma RFQ criada ainda"}
                </p>
                <p className="text-sm text-slate-500 mb-6">
                  Crie sua primeira solicitação de cotação para começar
                </p>
                <a
                  href="/rfq/new"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-semibold hover:shadow-lg transition-all"
                >
                  <Plus className="w-4 h-4" /> Criar primeira RFQ
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
