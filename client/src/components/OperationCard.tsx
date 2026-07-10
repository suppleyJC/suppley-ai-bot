import React from "react";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  getStatusMeta,
  getPriorityMeta,
  formatCurrency,
  formatDate,
  formatTimeAgo,
  type Priority,
} from "@/lib/operationStatus";
import { STAGE_LABELS } from "@/lib/stageLabels";

export interface OperationCardEntity {
  id: number;
  title: string;
  code?: string;
  clientName?: string;
  supplierName?: string;
  status: string;
  stage?: string;
  estimatedValue?: number;
  margin?: number;
  priority?: Priority | string;
  deadline?: Date | string | null;
  origin?: string;
  itemCount?: number;
  lastUpdated?: Date | string | null;
  /** Auditoria: quando a operação foi criada (data + hora exibidas no card). */
  createdAt?: Date | string | null;
  /** Auditoria: nome do usuário que criou a operação (no chat ou no painel). */
  creatorName?: string;
  avatar?: { initials: string; color: string };
}

export interface OperationCardAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
}

export interface OperationCardProps {
  entity: OperationCardEntity;
  compact?: boolean;
  onClick?: () => void;
  actions?: OperationCardAction[];
  className?: string;
}

export default function OperationCard({
  entity,
  compact = true,
  onClick,
  actions,
  className = "",
}: OperationCardProps) {
  const statusMeta = getStatusMeta(entity.status);
  const StatusIcon = statusMeta.Icon;
  const priorityMeta = entity.priority ? getPriorityMeta(entity.priority) : null;

  const lastUpdate = entity.lastUpdated
    ? typeof entity.lastUpdated === "string"
      ? new Date(entity.lastUpdated)
      : entity.lastUpdated
    : null;

  return (
    <div
      className={`group w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-violet-300 hover:shadow-sm ${className}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) onClick();
      }}
      role="button"
      tabIndex={0}
    >
      {/* Header: código + badges + menu */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          {entity.code && (
            <p className="font-mono text-[10px] text-slate-400 truncate">
              {entity.code}
            </p>
          )}
          <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 leading-tight">
            {entity.code && <span className="text-slate-500">{entity.code} — </span>}
            {entity.title}
          </h3>
        </div>

        {/* Status badge + menu */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge className={`text-[10px] font-bold whitespace-nowrap ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </Badge>

          {actions && actions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                asChild
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="rounded-md p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 data-[state=open]:opacity-100"
                  aria-label="Ações"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    onClick={action.onClick}
                    className={
                      action.variant === "destructive" ? "text-red-600 focus:text-red-600" : ""
                    }
                  >
                    {action.icon && (
                      <span className="mr-2 h-4 w-4">{action.icon}</span>
                    )}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Subtítulo: cliente/fornecedor */}
      {(entity.clientName || entity.supplierName) && (
        <p className="text-xs text-slate-500 truncate mb-2">
          {[entity.clientName, entity.supplierName]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* Detalhes: valores, estágio, etc. (apenas em modo não-compact) */}
      {!compact && (
        <div className="grid grid-cols-2 gap-2 text-xs mb-2 py-2 border-y border-slate-100">
          {entity.estimatedValue !== undefined && (
            <div>
              <span className="text-slate-500 block">Valor</span>
              <p className="font-semibold text-slate-900">
                {formatCurrency(entity.estimatedValue)}
              </p>
            </div>
          )}
          {entity.margin !== undefined && (
            <div>
              <span className="text-slate-500 block">Margem</span>
              <p className="font-semibold text-slate-900">
                {(entity.margin / 100).toFixed(1)}%
              </p>
            </div>
          )}
          {entity.itemCount !== undefined && (
            <div>
              <span className="text-slate-500 block">Itens</span>
              <p className="font-semibold text-slate-900">{entity.itemCount}</p>
            </div>
          )}
          {entity.deadline && (
            <div>
              <span className="text-slate-500 block">Prazo</span>
              <p className="font-semibold text-slate-900">
                {formatDate(entity.deadline)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rodapé: badges + tempo */}
      <div className="flex flex-wrap gap-1 items-center text-xs">
        {priorityMeta && (
          <Badge variant="outline" className="text-[10px]">
            {priorityMeta.label}
          </Badge>
        )}
        {entity.origin && (
          <Badge variant="outline" className="text-[10px]">
            {entity.origin}
          </Badge>
        )}
        {/* No kanban (compact) a coluna já indica o estágio — evita badge cru/redundante. */}
        {!compact && entity.stage && (
          <Badge variant="outline" className="text-[10px]">
            {(STAGE_LABELS as Record<string, string>)[entity.stage] ?? entity.stage}
          </Badge>
        )}
        {lastUpdate && (
          <span className="text-slate-400 ml-auto">
            {formatTimeAgo(lastUpdate)}
          </span>
        )}
      </div>

      {/* Auditoria: quem criou a operação, em que dia e a que horas */}
      {(entity.creatorName || entity.createdAt) && (
        <p className="mt-1.5 border-t border-slate-50 pt-1.5 text-[10px] text-slate-400 truncate">
          {entity.creatorName ? `por ${entity.creatorName}` : "criada"}
          {entity.createdAt &&
            ` · ${new Date(entity.createdAt).toLocaleDateString("pt-BR")} às ${new Date(entity.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
      )}
    </div>
  );
}
