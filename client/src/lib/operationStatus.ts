import {
  FileText, Zap, MessageCircle, CheckCircle, ShoppingCart, Package,
  FileCheck, CheckCircle2, X, Archive, AlertCircle, Clock, TrendingUp,
} from "lucide-react";

export type OperationStatus =
  | "rascunho"
  | "analisando"
  | "negociando"
  | "aprovado"
  | "pedido"
  | "embarcado"
  | "desembaraco"
  | "entregue"
  | "cancelado"
  | "arquivado";

export type Priority = "baixa" | "media" | "alta" | "critica";

export const OPERATION_STATUS = {
  rascunho: {
    label: "Rascunho",
    color: "slate",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    Icon: FileText,
  },
  analisando: {
    label: "Analisando",
    color: "amber",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    Icon: Zap,
  },
  negociando: {
    label: "Negociando",
    color: "orange",
    badgeClass: "bg-orange-100 text-orange-700 border-orange-200",
    Icon: MessageCircle,
  },
  aprovado: {
    label: "Aprovado",
    color: "teal",
    badgeClass: "bg-teal-100 text-teal-700 border-teal-200",
    Icon: CheckCircle,
  },
  pedido: {
    label: "Pedido feito",
    color: "blue",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    Icon: ShoppingCart,
  },
  embarcado: {
    label: "Embarcado",
    color: "indigo",
    badgeClass: "bg-indigo-100 text-indigo-700 border-indigo-200",
    Icon: Package,
  },
  desembaraco: {
    label: "Desembaraço",
    color: "purple",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
    Icon: FileCheck,
  },
  entregue: {
    label: "Entregue",
    color: "green",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    Icon: CheckCircle2,
  },
  cancelado: {
    label: "Cancelado",
    color: "red",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    Icon: X,
  },
  arquivado: {
    label: "Arquivado",
    color: "gray",
    badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
    Icon: Archive,
  },
} as const;

export const PRIORITY_META: Record<Priority, { label: string; cls: string; dot: string }> = {
  baixa: {
    label: "Baixa",
    cls: "bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  media: {
    label: "Média",
    cls: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  alta: {
    label: "Alta",
    cls: "bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
  },
  critica: {
    label: "Crítica",
    cls: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
};

export function getStatusMeta(status: string | null | undefined) {
  if (!status) return OPERATION_STATUS.rascunho;
  const key = status.toLowerCase().replace(/_/g, "") as OperationStatus;
  return OPERATION_STATUS[key] || OPERATION_STATUS.rascunho;
}

export function getPriorityMeta(priority: string | null | undefined) {
  if (!priority) return PRIORITY_META.media;
  const key = priority.toLowerCase() as Priority;
  return PRIORITY_META[key] || PRIORITY_META.media;
}

export function formatCurrency(cents?: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDate(date?: string | Date | null) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function formatTimeAgo(date?: Date | null) {
  if (!date) return "";
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "agora";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
