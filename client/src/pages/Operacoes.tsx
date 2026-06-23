/**
 * Operacoes — Painel de Operações (rota /operacoes).
 *
 * Kanban por estágio da esteira, consumindo o router que JÁ EXISTE:
 *   trpc.operations.list  → lista as operações do usuário
 *   trpc.operations.create → cria uma nova operação (Nova importação)
 *
 * Cada card linka para a esteira individual em /operacao/:id.
 * Registro de rota (wouter) em App.tsx:
 *   import Operacoes from "@/pages/Operacoes";
 *   <Route path="/operacoes" component={Operacoes} />
 */
import React, { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Plus, Loader2, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STAGE_ORDER, STAGE_META, type Estagio } from "@/lib/stageLabels";
import OperationCard from "@/components/OperationCard";

const COLUNAS = STAGE_ORDER.map((key) => ({
  key,
  label: STAGE_META[key].label,
  Icon: STAGE_META[key].Icon,
}));

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
}

export default function Operacoes() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.operations.list.useQuery();

  const [delTarget, setDelTarget] = useState<OperacaoRow | null>(null);

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

  const operacoes = (data ?? []) as OperacaoRow[];
  const ativas = operacoes.filter((o) => !["closed", "lost"].includes(o.estagioAtual));
  const encerradas = operacoes.filter((o) => ["closed", "lost"].includes(o.estagioAtual));

  function handleNova() {
    const titulo = window.prompt("Título da nova operação (ex.: Importação de válvulas — China):");
    if (!titulo?.trim()) return;
    create.mutate({ titulo: titulo.trim() });
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* cabeçalho */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Painel de Operações</h1>
          <p className="text-sm text-slate-500">
            {ativas.length} ativa{ativas.length === 1 ? "" : "s"} · {encerradas.length} finalizada{encerradas.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={handleNova}
          disabled={create.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Nova operação
        </button>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 p-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando operações…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-600">
          Não foi possível carregar as operações.
        </div>
      ) : operacoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-sm font-semibold text-slate-700">Nenhuma operação ainda</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
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
          {/* KANBAN — 5 colunas da esteira */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {COLUNAS.map((col) => {
              const itens = ativas.filter((o) => o.estagioAtual === col.key);
              const Icon = col.Icon;
              return (
                <div key={col.key} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <Icon className="h-4 w-4 text-violet-600" />
                    <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                    <span className="ml-auto rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-500">
                      {itens.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {itens.length === 0 ? (
                      <p className="px-1 py-4 text-center text-xs text-slate-300">—</p>
                    ) : (
                      itens.map((o) => (
                        <OperationCard
                          key={o.id}
                          entity={{
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
                            avatar: {
                              initials: o.codigo.substring(0, 2).toUpperCase(),
                              color: "violet",
                            },
                          }}
                          compact={true}
                          onClick={() => navigate(`/operacao/${o.id}`)}
                          actions={[
                            { label: "Duplicar", icon: <Copy className="h-4 w-4" />, onClick: () => duplicate.mutate({ operacaoId: o.id }) },
                            { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDelTarget(o), variant: "destructive" },
                          ]}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ENCERRADAS */}
          {encerradas.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Encerradas
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {encerradas.map((o) => (
                  <OperationCard
                    key={o.id}
                    entity={{
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
                      avatar: {
                        initials: o.codigo.substring(0, 2).toUpperCase(),
                        color: "violet",
                      },
                    }}
                    compact={false}
                    onClick={() => navigate(`/operacao/${o.id}`)}
                    actions={[
                      { label: "Duplicar", icon: <Copy className="h-4 w-4" />, onClick: () => duplicate.mutate({ operacaoId: o.id }) },
                      { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDelTarget(o), variant: "destructive" },
                    ]}
                  />
                ))}
              </div>
            </section>
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
