/**
 * OperacaoKanbanCard — o card de GOVERNANÇA do quadro (ponto focal do Kanban).
 *
 * Diferente do OperationCard genérico, este card conta a história do funil de
 * cada operação já na coluna: progresso da jornada, o que fazer AGORA (próxima
 * ação), quem responde por ela, a saúde do prazo e o risco. Os dados vêm de
 * operations.list → row.jornada (derivada no backend por compactJornada).
 *
 * A comunicação com a Excambia continua no chat principal — o card só faz
 * deep-link; nada de chat embutido.
 */
import React from "react";
import { MoreVertical, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStatusMeta, getPriorityMeta, formatCurrency, formatTimeAgo } from "@/lib/operationStatus";
import { responsavelMeta, saudeMeta, formatVencimento } from "@/lib/jornadaLabels";

export interface KanbanJornada {
  progressoPct: number;
  realizados: number;
  total: number;
  riscos: number;
  proximaAcao: {
    tipo: string;
    label: string;
    acao: string;
    estagio: string;
    responsavel: string;
    vencimento: string | null;
    saudePrazo: string;
  } | null;
}

export interface KanbanOperacao {
  id: number;
  codigo: string;
  titulo: string;
  estagioAtual: string;
  status: string;
  clienteNome?: string | null;
  fornecedorNome?: string | null;
  valorEstimadoBrlCents?: number | null;
  prioridade?: string | null;
  atualizadaEm?: string | Date | null;
  jornada?: KanbanJornada | null;
}

export interface KanbanCardAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
}

/** Avatar+rótulo do responsável (sigla em bolha da cor da marca vs. terceiros). */
function ResponsavelChip({ responsavel }: { responsavel: string }) {
  const m = responsavelMeta(responsavel);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${m.cls}`}>
        {m.sigla}
      </span>
      <span className="truncate text-[10px] font-semibold text-foreground">{m.label}</span>
    </span>
  );
}

export default function OperacaoKanbanCard({
  op, onClick, actions,
}: {
  op: KanbanOperacao;
  onClick?: () => void;
  actions?: KanbanCardAction[];
}) {
  const status = getStatusMeta(op.status);
  const priority = op.prioridade ? getPriorityMeta(op.prioridade) : null;
  const j = op.jornada ?? null;
  const prox = j?.proximaAcao ?? null;
  const saude = prox ? saudeMeta(prox.saudePrazo) : null;
  const pct = j?.progressoPct ?? 0;
  const lastUpdate = op.atualizadaEm ? new Date(op.atualizadaEm) : null;

  return (
    <div
      className="group w-full cursor-pointer rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-violet-300 hover:shadow-md"
      onClick={onClick}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && onClick) onClick(); }}
      role="button"
      tabIndex={0}
    >
      {/* topo: código + risco + menu */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold text-violet-700">
          {op.codigo}
        </p>
        <div className="flex flex-shrink-0 items-center gap-1">
          {j && j.riscos > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700"
              title={`${j.riscos} pendência(s) em risco (atrasada ou vencendo)`}
            >
              <AlertTriangle className="h-2.5 w-2.5" /> {j.riscos}
            </span>
          )}
          {op.status && op.status !== "ativa" && (
            <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-bold ${status.badgeClass}`}>
              {status.label}
            </span>
          )}
          {actions && actions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                  className="rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 data-[state=open]:opacity-100"
                  aria-label="Ações"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {actions.map((a) => (
                  <DropdownMenuItem
                    key={a.label}
                    onClick={a.onClick}
                    className={a.variant === "destructive" ? "text-red-600 focus:text-red-600" : ""}
                  >
                    {a.icon && <span className="mr-2 h-4 w-4">{a.icon}</span>}
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* título */}
      <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
        {op.titulo}
      </h3>

      {/* cliente / fornecedor */}
      {(op.clienteNome || op.fornecedorNome) && (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {[op.clienteNome, op.fornecedorNome].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* progresso da jornada */}
      {j && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground">
              Jornada · {j.realizados}/{j.total}
            </span>
            <span className="text-[10px] font-bold text-teal-700">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
        </div>
      )}

      {/* AGORA — próxima ação, responsável, prazo (o coração do card) */}
      {prox ? (
        <div className="mt-2.5 rounded-lg border border-violet-100 bg-violet-50/60 px-2.5 py-2">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 flex-shrink-0 text-violet-500" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-violet-600">Agora</span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-foreground" title={prox.acao}>
            {prox.acao}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <ResponsavelChip responsavel={prox.responsavel} />
            {saude && (
              <span className={`inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold ${saude.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${saude.dot}`} />
                {prox.vencimento ? formatVencimento(prox.vencimento) : "sem prazo"}
              </span>
            )}
          </div>
        </div>
      ) : j ? (
        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/60 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Jornada completa
        </div>
      ) : null}

      {/* rodapé: prioridade · valor · atualização */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-slate-50 pt-2 text-[10px]">
        {priority && (
          <span className={`inline-flex items-center gap-1 font-semibold ${priority.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} /> {priority.label}
          </span>
        )}
        {op.valorEstimadoBrlCents ? (
          <span className="font-semibold text-foreground">{formatCurrency(op.valorEstimadoBrlCents)}</span>
        ) : null}
        {lastUpdate && (
          <span className="ml-auto text-muted-foreground">{formatTimeAgo(lastUpdate)}</span>
        )}
      </div>
    </div>
  );
}
