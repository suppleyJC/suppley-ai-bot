/**
 * OperacaoDetail — página da operação (rota /operacao/:id).
 *
 * Consome o router que JÁ EXISTE (operationsRouter):
 *   trpc.operations.get / advanceStage / decideGoNoGo / addEvento
 *
 * Registro de rota (wouter) em App.tsx:
 *   import OperacaoDetail from "@/pages/OperacaoDetail";
 *   <Route path="/operacao/:id" component={OperacaoDetail} />
 *
 * Acessível a partir do card no Painel de Operações e da lista da Excambia.
 */
import React from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import OperacaoTimeline from "@/components/OperacaoTimeline";
import { ArrowLeft, CalendarClock, Globe2 } from "lucide-react";
import { PRIORITY_ORDER, getPriorityMeta } from "@/lib/priorityLabels";

const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  ativa:     { txt: "Ativa",     cls: "bg-violet-50 text-violet-700" },
  go:        { txt: "GO",        cls: "bg-teal-50 text-teal-700" },
  no_go:     { txt: "NO-GO",     cls: "bg-red-50 text-red-700" },
  concluida: { txt: "Concluída", cls: "bg-teal-50 text-teal-700" },
  perdida:   { txt: "Perdida",   cls: "bg-slate-100 text-slate-500" },
  pausada:   { txt: "Pausada",   cls: "bg-amber-50 text-amber-700" },
};

function fmtPrazo(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OperacaoDetail() {
  const [, params] = useRoute("/operacao/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.operations.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) },
  );

  const invalidate = () => utils.operations.get.invalidate({ id });

  const advance = trpc.operations.advanceStage.useMutation({ onSuccess: invalidate });
  const decide = trpc.operations.decideGoNoGo.useMutation({ onSuccess: invalidate });
  const addEvento = trpc.operations.addEvento.useMutation({ onSuccess: invalidate });
  const update = trpc.operations.update.useMutation({ onSuccess: invalidate });

  if (!Number.isFinite(id)) {
    return <div className="p-8 text-sm text-slate-500">Operação inválida.</div>;
  }
  if (isLoading) {
    return <div className="p-8 text-sm text-slate-400">Carregando operação…</div>;
  }
  if (error || !data?.operacao) {
    return (
      <div className="p-8 text-sm text-red-500">
        Não foi possível carregar esta operação.
      </div>
    );
  }

  const { operacao, eventos } = data;
  const st = STATUS_LABEL[operacao.status] ?? { txt: operacao.status, cls: "bg-slate-100 text-slate-500" };
  const op = operacao as typeof operacao & {
    prioridade?: "baixa" | "media" | "alta" | "critica" | null;
    prazoDesejado?: string | Date | null;
    origemDesejada?: string | null;
  };
  const prio = getPriorityMeta(op.prioridade);

  function handleAddNote() {
    const titulo = window.prompt("Nota para a operação:");
    if (!titulo) return;
    addEvento.mutate({ operacaoId: operacao.id, tipo: "nota_interna", estagio: operacao.estagioAtual, titulo });
  }

  function handleChangePrioridade(e: React.ChangeEvent<HTMLSelectElement>) {
    update.mutate({ operacaoId: operacao.id, prioridade: e.target.value as any });
  }

  function handleChangePrazo(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    update.mutate({ operacaoId: operacao.id, prazoDesejado: v ? new Date(v) : null });
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <button
        onClick={() => navigate("/")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-violet-700"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      {/* cabeçalho */}
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-400">{operacao.codigo}</p>
            <h1 className="text-xl font-bold text-slate-900">{operacao.titulo}</h1>
            <p className="text-sm text-slate-500">
              {[operacao.clienteNome, operacao.fornecedorNome, operacao.origemPais]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
          <span className={`ml-auto rounded-lg px-3 py-1 text-xs font-bold ${st.cls}`}>
            {st.txt}
          </span>
        </div>

        {/* metadados editáveis: prioridade, prazo, origem desejada */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Prioridade</span>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${prio.dot}`} />
              <select
                value={op.prioridade ?? "media"}
                onChange={handleChangePrioridade}
                disabled={update.isPending}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>{getPriorityMeta(p).label}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <CalendarClock className="mr-1 inline h-3 w-3" /> Prazo desejado
            </span>
            <input
              type="date"
              value={op.prazoDesejado ? new Date(op.prazoDesejado).toISOString().slice(0, 10) : ""}
              onChange={handleChangePrazo}
              disabled={update.isPending}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <Globe2 className="mr-1 inline h-3 w-3" /> Origem desejada
            </span>
            <p className="px-2 py-1.5 text-sm font-medium text-slate-700">
              {op.origemDesejada || "—"}
            </p>
          </div>
        </div>
      </header>

      <OperacaoTimeline
        operacao={operacao as any}
        eventos={eventos as any}
        onAddNote={handleAddNote}
        onAdvanceStage={() => advance.mutate({ operacaoId: operacao.id })}
        onDecideGoNoGo={(d) => decide.mutate({ operacaoId: operacao.id, decision: d })}
      />
    </div>
  );
}
