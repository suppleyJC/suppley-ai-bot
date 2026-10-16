/**
 * Operacoes — Painel de Operações (rota /operacoes).
 *
 * Projetado para escalar a MILHARES de operações:
 *  - Barra de pipeline no topo: contagem por etapa, clicável (vira filtro).
 *  - Busca por código / título / cliente / fornecedor.
 *  - Visão LISTA (padrão): tabela densa, ordenada por última atualização,
 *    com paginação progressiva ("Mostrar mais") — escaneável em volume.
 *  - Visão QUADRO (Kanban): colunas flexíveis que cabem na tela, com
 *    arrastar-e-soltar entre etapas e teto de cards por coluna (o excedente
 *    aponta para a lista).
 *
 * Backend: trpc.operations.list / create / duplicate / delete / setStage.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList, Plus, Loader2, Copy, Trash2, Search, LayoutGrid, List,
  CheckCircle2, MoreVertical, ChevronDown, MessageCircle, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAGE_ORDER, STAGE_META, STAGE_LABELS, type Estagio } from "@/lib/stageLabels";
import { getPriorityMeta, formatCurrency, formatTimeAgo } from "@/lib/operationStatus";
import OperationCard from "@/components/OperationCard";
import OperacaoKanbanCard, { type KanbanJornada } from "@/components/operacao/OperacaoKanbanCard";

const COLUNAS = STAGE_ORDER.map((key) => ({
  key,
  label: STAGE_META[key].label,
  Icon: STAGE_META[key].Icon,
}));

/** Acento por coluna: funil que migra do "estudo" (violeta) à "entrega" (turquesa). */
const COL_ACCENT: Record<Estagio, string> = {
  demand: "bg-violet-300", source: "bg-violet-400", analyze: "bg-violet-500",
  execute: "bg-teal-400", finance: "bg-teal-500",
  closed: "bg-slate-400", lost: "bg-slate-300",
};

/** Teto de cards renderizados por coluna no quadro (excedente vai p/ lista). */
const KANBAN_CAP = 30;
/** Tamanho da página na visão lista (paginação progressiva). */
const PAGE = 50;

type ViewMode = "lista" | "quadro";
type StageFilter = "todas" | Estagio | "encerradas";

interface OperacaoRow {
  id: number;
  codigo: string;
  titulo: string;
  estagioAtual: Estagio;
  status: string;
  clienteNome?: string | null;
  fornecedorNome?: string | null;
  valorEstimadoBrlCents?: number | null;
  margemEstimada?: number | null;
  prioridade?: string | null;
  prazoDesejado?: string | Date | null;
  origemDesejada?: string | null;
  atualizadaEm?: Date | null;
  criadaEm?: string | Date | null;
  criadoPorNome?: string | null;
  jornada?: KanbanJornada | null;
}

function toEntity(o: OperacaoRow) {
  return {
    id: o.id,
    title: o.titulo,
    code: o.codigo,
    clientName: o.clienteNome ?? undefined,
    supplierName: o.fornecedorNome ?? undefined,
    status: o.status,
    stage: o.estagioAtual,
    estimatedValue: o.valorEstimadoBrlCents ?? undefined,
    margin: o.margemEstimada ?? undefined,
    priority: o.prioridade ?? undefined,
    deadline: o.prazoDesejado,
    origin: o.origemDesejada ?? undefined,
    lastUpdated: o.atualizadaEm,
    createdAt: o.criadaEm ?? undefined,
    creatorName: o.criadoPorNome ?? undefined,
    avatar: { initials: o.codigo.substring(0, 2).toUpperCase(), color: "violet" },
  };
}

export default function Operacoes() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.operations.list.useQuery();

  const [view, setView] = useState<ViewMode>(() =>
    (localStorage.getItem("operacoes:view") as ViewMode) || "lista",
  );
  const [stageFilter, setStageFilter] = useState<StageFilter>("todas");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [delTarget, setDelTarget] = useState<OperacaoRow | null>(null);

  useEffect(() => localStorage.setItem("operacoes:view", view), [view]);
  // Reset da paginação quando filtro/busca mudam.
  useEffect(() => setLimit(PAGE), [stageFilter, query, view]);

  const create = trpc.operations.create.useMutation({
    onSuccess: (op) => {
      utils.operations.list.invalidate();
      if (op?.id) navigate(`/operacao/${op.id}`);
    },
    onError: (e) => toast.error(e.message || "Erro ao criar operação"),
  });

  const duplicate = trpc.operations.duplicate.useMutation({
    onSuccess: (op) => {
      utils.operations.list.invalidate();
      toast.success("Operação duplicada");
      if (op?.id) navigate(`/operacao/${op.id}`);
    },
    onError: (e) => toast.error(e.message || "Erro ao duplicar operação"),
  });

  const remove = trpc.operations.delete.useMutation({
    onSuccess: () => {
      utils.operations.list.invalidate();
      setDelTarget(null);
      toast.success("Operação excluída");
    },
    onError: (e) => toast.error(e.message || "Erro ao excluir operação"),
  });

  // Mover card entre colunas (drag-and-drop), com atualização otimista.
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<Estagio | null>(null);

  const setStage = trpc.operations.setStage.useMutation({
    onError: (e) => {
      utils.operations.list.invalidate();
      toast.error(e.message || "Não foi possível mover a operação");
    },
    onSettled: () => utils.operations.list.invalidate(),
  });

  function handleDrop(toCol: Estagio) {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (id == null) return;
    const atual = (utils.operations.list.getData() as OperacaoRow[] | undefined)?.find((o) => o.id === id);
    if (!atual || atual.estagioAtual === toCol) return;
    utils.operations.list.setData(undefined, (old) =>
      (old as OperacaoRow[] | undefined)?.map((o) =>
        o.id === id ? { ...o, estagioAtual: toCol } : o,
      ) as any,
    );
    setStage.mutate({ operacaoId: id, to: toCol });
  }

  const operacoes = (data ?? []) as OperacaoRow[];
  const ativas = useMemo(() => operacoes.filter((o) => !["closed", "lost"].includes(o.estagioAtual)), [operacoes]);
  const encerradas = useMemo(() => operacoes.filter((o) => ["closed", "lost"].includes(o.estagioAtual)), [operacoes]);

  // Contagens por etapa (sempre sobre o conjunto completo — a barra é o mapa).
  const countByStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ativas) m.set(o.estagioAtual, (m.get(o.estagioAtual) ?? 0) + 1);
    return m;
  }, [ativas]);

  // Busca + filtro de etapa (compõem).
  const filtradas = useMemo(() => {
    let base: OperacaoRow[];
    if (stageFilter === "todas") base = ativas;
    else if (stageFilter === "encerradas") base = encerradas;
    else base = ativas.filter((o) => o.estagioAtual === stageFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      base = base.filter((o) =>
        [o.codigo, o.titulo, o.clienteNome, o.fornecedorNome]
          .some((s) => s?.toLowerCase().includes(q)),
      );
    }
    // Mais recentes primeiro — em volume, o que mexeu por último importa mais.
    return [...base].sort((a, b) => {
      const ta = a.atualizadaEm ? new Date(a.atualizadaEm).getTime() : 0;
      const tb = b.atualizadaEm ? new Date(b.atualizadaEm).getTime() : 0;
      return tb - ta;
    });
  }, [ativas, encerradas, stageFilter, query]);

  // No quadro, as colunas JÁ SÃO a etapa — aplica só a busca, não o filtro de etapa.
  const buscadas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ativas;
    return ativas.filter((o) =>
      [o.codigo, o.titulo, o.clienteNome, o.fornecedorNome].some((s) => s?.toLowerCase().includes(q)),
    );
  }, [ativas, query]);

  function handleNova() {
    const titulo = window.prompt("Título da nova operação (ex.: Importação de válvulas — China):");
    if (!titulo?.trim()) return;
    create.mutate({ titulo: titulo.trim() });
  }

  const cardActions = (o: OperacaoRow) => [
    { label: "Conversar no chat", icon: <MessageCircle className="h-4 w-4" />, onClick: () => navigate(`/excambia?operacao=${o.id}`) },
    { label: "Duplicar", icon: <Copy className="h-4 w-4" />, onClick: () => duplicate.mutate({ operacaoId: o.id }) },
    { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDelTarget(o), variant: "destructive" as const },
  ];

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* cabeçalho */}
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel de Operações</h1>
          <p className="text-sm text-muted-foreground">
            {ativas.length} ativa{ativas.length === 1 ? "" : "s"} · {encerradas.length} finalizada{encerradas.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* alternador de visão */}
          <div className="flex rounded-xl border border-border bg-card p-0.5">
            <button
              onClick={() => setView("lista")}
              className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "lista" ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              onClick={() => setView("quadro")}
              className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "quadro" ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Quadro
            </button>
          </div>
          <button
            onClick={handleNova}
            disabled={create.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Nova operação
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando operações…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-600">
          Não foi possível carregar as operações.
        </div>
      ) : operacoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
          <h3 className="text-sm font-semibold text-foreground">Nenhuma operação ainda</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Crie a primeira operação para acompanhar toda a esteira — da demanda à entrega.
          </p>
          <button
            onClick={handleNova}
            disabled={create.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> Criar primeira operação
          </button>
        </div>
      ) : (
        <>
          {/* BARRA DE PIPELINE — mapa da esteira + filtro por etapa */}
          <div className="mb-3 flex flex-wrap items-stretch gap-1.5">
            <button
              onClick={() => setStageFilter("todas")}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                stageFilter === "todas"
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-border bg-card text-muted-foreground hover:border-violet-300"
              }`}
            >
              Todas
              <span className={`rounded-full px-1.5 text-[11px] ${stageFilter === "todas" ? "bg-card/20" : "bg-muted text-muted-foreground"}`}>
                {ativas.length}
              </span>
            </button>
            {COLUNAS.map((col, i) => {
              const count = countByStage.get(col.key) ?? 0;
              const active = stageFilter === col.key;
              const Icon = col.Icon;
              return (
                <React.Fragment key={col.key}>
                  {i > 0 && <span className="self-center text-muted-foreground/60">›</span>}
                  <button
                    onClick={() => setStageFilter(active ? "todas" : col.key)}
                    title={STAGE_META[col.key].descricao}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? "border-violet-600 bg-violet-600 text-white"
                        : count > 0
                          ? "border-border bg-card text-muted-foreground hover:border-violet-300"
                          : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-white" : "text-violet-500"}`} />
                    <span className="hidden lg:inline">{col.label}</span>
                    <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-card/20" : "bg-muted text-muted-foreground"}`}>
                      {count}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
            {encerradas.length > 0 && (
              <button
                onClick={() => setStageFilter(stageFilter === "encerradas" ? "todas" : "encerradas")}
                className={`ml-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  stageFilter === "encerradas"
                    ? "border-slate-700 bg-slate-700 text-white"
                    : "border-border bg-card text-muted-foreground hover:border-slate-400"
                }`}
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${stageFilter === "encerradas" ? "text-white" : "text-muted-foreground"}`} />
                Encerradas
                <span className={`rounded-full px-1.5 text-[11px] ${stageFilter === "encerradas" ? "bg-card/20" : "bg-muted text-muted-foreground"}`}>
                  {encerradas.length}
                </span>
              </button>
            )}
            {/* busca */}
            <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar código, título, cliente…"
                className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          {view === "lista" ? (
            /* ===================== VISÃO LISTA ===================== */
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              {filtradas.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  Nenhuma operação encontrada{query ? ` para “${query}”` : ""}.
                </p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">Código</th>
                        <th className="px-4 py-2.5">Operação</th>
                        <th className="px-4 py-2.5">Etapa</th>
                        <th className="hidden px-4 py-2.5 md:table-cell">Prioridade</th>
                        <th className="hidden px-4 py-2.5 text-right lg:table-cell">Valor est.</th>
                        <th className="hidden px-4 py-2.5 text-right xl:table-cell">Margem</th>
                        <th className="hidden px-4 py-2.5 text-right md:table-cell">Atualizada</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.slice(0, limit).map((o) => {
                        const pr = o.prioridade ? getPriorityMeta(o.prioridade) : null;
                        const StageIcon = STAGE_META[o.estagioAtual as (typeof STAGE_ORDER)[number]]?.Icon;
                        return (
                          <tr
                            key={o.id}
                            onClick={() => navigate(`/operacao/${o.id}`)}
                            className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-violet-50/40"
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-violet-700">
                              {o.codigo}
                            </td>
                            <td className="max-w-[360px] px-4 py-3">
                              <p className="truncate font-medium text-foreground">{o.titulo}</p>
                              {(o.clienteNome || o.fornecedorNome) && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {[o.clienteNome, o.fornecedorNome].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                                {StageIcon ? <StageIcon className="h-3 w-3" /> : null}
                                {STAGE_LABELS[o.estagioAtual] ?? o.estagioAtual}
                              </span>
                            </td>
                            <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">
                              {pr ? (
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${pr.cls}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${pr.dot}`} /> {pr.label}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground/60">—</span>
                              )}
                            </td>
                            <td className="hidden whitespace-nowrap px-4 py-3 text-right font-medium text-foreground lg:table-cell">
                              {o.valorEstimadoBrlCents ? formatCurrency(o.valorEstimadoBrlCents) : <span className="text-muted-foreground/60">—</span>}
                            </td>
                            <td className="hidden whitespace-nowrap px-4 py-3 text-right text-muted-foreground xl:table-cell">
                              {o.margemEstimada != null ? `${(o.margemEstimada / 100).toFixed(1)}%` : <span className="text-muted-foreground/60">—</span>}
                            </td>
                            <td className="hidden whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground md:table-cell">
                              {o.atualizadaEm ? formatTimeAgo(new Date(o.atualizadaEm)) : "—"}
                            </td>
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="rounded-lg p-1.5 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground">
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => navigate(`/excambia?operacao=${o.id}`)}>
                                    <MessageCircle className="mr-2 h-4 w-4" /> Conversar no chat
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => duplicate.mutate({ operacaoId: o.id })}>
                                    <Copy className="mr-2 h-4 w-4" /> Duplicar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() => setDelTarget(o)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtradas.length > limit && (
                    <button
                      onClick={() => setLimit((l) => l + PAGE)}
                      className="flex w-full items-center justify-center gap-1.5 border-t border-border py-3 text-xs font-semibold text-violet-600 hover:bg-violet-50/50"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      Mostrar mais ({filtradas.length - limit} restantes)
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            /* ===================== VISÃO QUADRO ===================== */
            <>
              <div className="flex gap-3 overflow-x-auto pb-3">
                {COLUNAS.map((col) => {
                  const itens = buscadas.filter((o) => o.estagioAtual === col.key);
                  const visiveis = itens.slice(0, KANBAN_CAP);
                  const Icon = col.Icon;
                  const isOver = overCol === col.key;
                  // Governança agregada da coluna: soma de riscos das operações nela.
                  const riscosCol = itens.reduce((s, o) => s + (o.jornada?.riscos ?? 0), 0);
                  return (
                    <div
                      key={col.key}
                      onDragOver={(e) => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key); }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((c) => (c === col.key ? null : c));
                      }}
                      onDrop={() => handleDrop(col.key)}
                      className={`flex min-w-[248px] flex-1 flex-col overflow-hidden rounded-2xl border transition-colors ${
                        isOver ? "border-violet-400 bg-violet-50/70 ring-2 ring-violet-200" : "border-border bg-muted/50"
                      }`}
                    >
                      {/* acento do funil */}
                      <div className={`h-1 w-full ${COL_ACCENT[col.key] ?? "bg-violet-400"}`} />
                      <div className="flex flex-col p-2.5">
                        <div className="mb-2.5 flex items-center gap-2 px-1">
                          <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate text-[13px] font-semibold text-foreground" title={col.label}>{col.label}</span>
                          {riscosCol > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700"
                              title={`${riscosCol} pendência(s) em risco nesta etapa`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" /> {riscosCol}
                            </span>
                          )}
                          <span className="ml-auto rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
                            {itens.length}
                          </span>
                        </div>
                        <div className="flex max-h-[calc(100vh-320px)] min-h-[40px] flex-col gap-2 overflow-y-auto pr-0.5">
                          {itens.length === 0 ? (
                            <p className={`px-1 py-4 text-center text-xs ${isOver ? "text-violet-400" : "text-muted-foreground/60"}`}>
                              {isOver ? "Soltar aqui" : "—"}
                            </p>
                          ) : (
                            <>
                              {visiveis.map((o) => (
                                <div
                                  key={o.id}
                                  draggable
                                  onDragStart={(e) => { setDragId(o.id); e.dataTransfer.effectAllowed = "move"; }}
                                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                                  className={`cursor-grab active:cursor-grabbing ${dragId === o.id ? "opacity-50" : ""}`}
                                >
                                  <OperacaoKanbanCard
                                    op={o}
                                    onClick={() => navigate(`/operacao/${o.id}`)}
                                    actions={cardActions(o)}
                                  />
                                </div>
                              ))}
                              {itens.length > KANBAN_CAP && (
                                <button
                                  onClick={() => { setStageFilter(col.key); setView("lista"); }}
                                  className="rounded-xl border border-dashed border-violet-200 py-2 text-xs font-semibold text-violet-600 hover:bg-violet-50"
                                >
                                  +{itens.length - KANBAN_CAP} — ver na lista
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Encerradas (resumo no quadro; a lista completa fica no filtro) */}
              {encerradas.length > 0 && stageFilter !== "encerradas" && (
                <section className="mt-6">
                  <div className="mb-3 flex items-center gap-3">
                    <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Encerradas</h2>
                    {encerradas.length > 4 && (
                      <button
                        onClick={() => { setStageFilter("encerradas"); setView("lista"); }}
                        className="text-[11px] font-semibold text-violet-600 hover:underline"
                      >
                        ver todas ({encerradas.length})
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {encerradas.slice(0, 4).map((o) => (
                      <OperationCard
                        key={o.id}
                        entity={toEntity(o)}
                        compact={true}
                        onClick={() => navigate(`/operacao/${o.id}`)}
                        actions={cardActions(o)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir operação?</AlertDialogTitle>
            <AlertDialogDescription>
              A operação <strong>{delTarget?.codigo} — {delTarget?.titulo}</strong> e toda a sua
              esteira (eventos, anexos, financeiro, marcos) serão removidos permanentemente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delTarget && remove.mutate({ operacaoId: delTarget.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
