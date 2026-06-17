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
import { ArrowLeft } from "lucide-react";

const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  ativa:     { txt: "Ativa",     cls: "bg-violet-50 text-violet-700" },
  go:        { txt: "GO",        cls: "bg-teal-50 text-teal-700" },
  no_go:     { txt: "NO-GO",     cls: "bg-red-50 text-red-700" },
  concluida: { txt: "Concluída", cls: "bg-teal-50 text-teal-700" },
  perdida:   { txt: "Perdida",   cls: "bg-slate-100 text-slate-500" },
  pausada:   { txt: "Pausada",   cls: "bg-amber-50 text-amber-700" },
};

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

  function handleAddNote() {
    const titulo = window.prompt("Nota para a operação:");
    if (!titulo) return;
    addEvento.mutate({ operacaoId: operacao.id, tipo: "nota_interna", estagio: operacao.estagioAtual, titulo });
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
