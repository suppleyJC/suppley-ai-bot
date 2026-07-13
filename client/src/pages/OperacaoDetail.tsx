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
import React, { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import OperacaoTimeline from "@/components/OperacaoTimeline";
import OperacaoMarcos from "@/components/OperacaoMarcos";
import OperacaoTracking from "@/components/OperacaoTracking";
import OperacaoAnexos from "@/components/OperacaoAnexos";
import OperacaoFinanceiro from "@/components/OperacaoFinanceiro";
import {
  ProgressRing, CartaoAgora, CentralPendencias, MetricaTile,
  type JornadaResumoData,
} from "@/components/operacao/JornadaResumo";
import type { TipoMarco } from "@/lib/marcoLabels";
import {
  ArrowLeft, CalendarClock, Globe2, MessageCircle, Anchor, DollarSign, AlertTriangle,
} from "lucide-react";

const MODO_LABEL: Record<string, { txt: string; cls: string }> = {
  cotacao:        { txt: "Cotação pronta",  cls: "bg-blue-50 text-blue-700" },
  desenvolvimento:{ txt: "Desenvolvimento", cls: "bg-amber-50 text-amber-700" },
};
import { PRIORITY_ORDER, getPriorityMeta } from "@/lib/priorityLabels";

const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  ativa:     { txt: "Ativa",     cls: "bg-violet-50 text-violet-700" },
  go:        { txt: "GO",        cls: "bg-teal-50 text-teal-700" },
  no_go:     { txt: "NO-GO",     cls: "bg-red-50 text-red-700" },
  concluida: { txt: "Concluída", cls: "bg-teal-50 text-teal-700" },
  perdida:   { txt: "Perdida",   cls: "bg-muted text-muted-foreground" },
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

  // Invalida TAMBÉM a lista do Painel: ao mudar de estágio, o card precisa
  // migrar de coluna na hora (a coluna é derivada do estágio).
  const invalidate = () => {
    utils.operations.get.invalidate({ id });
    utils.operations.list.invalidate();
  };

  const advance = trpc.operations.advanceStage.useMutation({ onSuccess: invalidate });
  const decide = trpc.operations.decideGoNoGo.useMutation({ onSuccess: invalidate });
  const addEvento = trpc.operations.addEvento.useMutation({ onSuccess: invalidate });
  const update = trpc.operations.update.useMutation({ onSuccess: invalidate });

  // Ponte cartão "Agora"/pendências → formulário de marcos (abre prefilled).
  const [prefill, setPrefill] = useState<{ tipo: TipoMarco; nonce: number } | undefined>();
  const registrarMarcoDe = (tipo: string) =>
    setPrefill({ tipo: tipo as TipoMarco, nonce: Date.now() });

  if (!Number.isFinite(id)) {
    return <div className="p-8 text-sm text-muted-foreground">Operação inválida.</div>;
  }
  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando operação…</div>;
  }
  if (error || !data?.operacao) {
    return (
      <div className="p-8 text-sm text-red-500">
        Não foi possível carregar esta operação.
      </div>
    );
  }

  const { operacao, eventos } = data;
  const marcos = (data as any).marcos ?? [];
  const anexos = (data as any).anexos ?? [];
  const financeiro = (data as any).financeiro ?? [];
  const jornada = (data as any).jornada as JornadaResumoData | undefined;
  const st = STATUS_LABEL[operacao.status] ?? { txt: operacao.status, cls: "bg-muted text-muted-foreground" };
  const op = operacao as typeof operacao & {
    prioridade?: "baixa" | "media" | "alta" | "critica" | null;
    prazoDesejado?: string | Date | null;
    origemDesejada?: string | null;
    modo?: "cotacao" | "desenvolvimento" | null;
    trackingContainer?: string | null;
    trackingBl?: string | null;
    trackingArmador?: string | null;
    trackingNavio?: string | null;
    trackingEta?: string | Date | null;
    trackingStatus?: string | null;
  };
  const prio = getPriorityMeta(op.prioridade);
  const modoMeta = op.modo ? MODO_LABEL[op.modo] : null;
  // Rastreio é relevante a partir da produção/embarque.
  const mostraTracking = ["execute", "finance", "closed"].includes(operacao.estagioAtual);

  const brl = (cents: number) =>
    `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const conversar = () => navigate(`/excambia?operacao=${operacao.id}`);

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

  function handleBlurOrigem(e: React.FocusEvent<HTMLInputElement>) {
    const v = e.target.value.trim();
    if (v === (op.origemDesejada ?? "")) return; // sem mudança, não dispara
    update.mutate({ operacaoId: operacao.id, origemDesejada: v });
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <button
        onClick={() => navigate("/operacoes")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-violet-700"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
      </button>

      {/* cabeçalho */}
      <header className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{operacao.codigo}</p>
            <h1 className="text-xl font-bold text-foreground">{operacao.titulo}</h1>
            <p className="text-sm text-muted-foreground">
              {[operacao.clienteNome, operacao.fornecedorNome, operacao.origemPais]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            {/* Auditoria: quem criou a operação (no chat ou no painel), quando e a que horas */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Criada{(data as any).criadoPorNome ? ` por ${(data as any).criadoPorNome}` : ""}
              {operacao.criadaEm &&
                ` em ${new Date(operacao.criadaEm).toLocaleDateString("pt-BR")} às ${new Date(operacao.criadaEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {modoMeta && (
              <span className={`rounded-lg px-3 py-1 text-xs font-bold ${modoMeta.cls}`}>
                {modoMeta.txt}
              </span>
            )}
            <span className={`rounded-lg px-3 py-1 text-xs font-bold ${st.cls}`}>
              {st.txt}
            </span>
            {/* Porta PAINEL → CHAT: abre (ou cria) a conversa vinculada a esta operação */}
            <button
              onClick={() => navigate(`/excambia?operacao=${operacao.id}`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Conversar com a Excambia
            </button>
          </div>
        </div>

        {/* metadados editáveis: prioridade, prazo, origem desejada */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Prioridade</span>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${prio.dot}`} />
              <select
                value={op.prioridade ?? "media"}
                onChange={handleChangePrioridade}
                disabled={update.isPending}
                className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground disabled:opacity-60"
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>{getPriorityMeta(p).label}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="mr-1 inline h-3 w-3" /> Prazo desejado
            </span>
            <input
              type="date"
              value={op.prazoDesejado ? new Date(op.prazoDesejado).toISOString().slice(0, 10) : ""}
              onChange={handleChangePrazo}
              disabled={update.isPending}
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground disabled:opacity-60"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Globe2 className="mr-1 inline h-3 w-3" /> Origem
            </span>
            <input
              type="text"
              defaultValue={op.origemDesejada ?? ""}
              onBlur={handleBlurOrigem}
              disabled={update.isPending}
              placeholder="Ex.: China, Índia, Coreia do Sul…"
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            />
          </label>
        </div>

        {/* Faixa de métricas executivas: progresso, ETA, valor e riscos */}
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <ProgressRing pct={jornada?.progressoPct ?? 0} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Progresso</p>
              <p className="text-sm font-bold text-foreground">
                {jornada?.realizados ?? 0}/{jornada?.total ?? 13} marcos
              </p>
            </div>
          </div>
          <MetricaTile
            Icon={Anchor}
            label="ETA (chegada)"
            value={op.trackingEta ? new Date(op.trackingEta).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}
          />
          <MetricaTile
            Icon={DollarSign}
            label="Valor estimado"
            value={operacao.valorEstimadoBrlCents ? brl(operacao.valorEstimadoBrlCents) : "—"}
            accent="text-teal-500"
          />
          <MetricaTile
            Icon={AlertTriangle}
            label="Riscos"
            value={jornada?.riscos ? `${jornada.riscos} pendência${jornada.riscos === 1 ? "" : "s"}` : "nenhum"}
            accent={jornada?.riscos ? "text-red-500" : "text-teal-500"}
          />
        </div>
      </header>

      {/* Cartão "Agora" + central de pendências — o coração do redesenho */}
      {jornada && (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CartaoAgora
            proxima={jornada.proximaAcao}
            onRegistrar={registrarMarcoDe}
            onConversar={conversar}
          />
          <CentralPendencias pendencias={jornada.pendencias} onRegistrar={registrarMarcoDe} />
        </div>
      )}

      <div className="mb-6">
        <OperacaoMarcos operacaoId={operacao.id} marcos={marcos} onChange={invalidate} prefill={prefill} />
      </div>

      {mostraTracking && (
        <div className="mb-6">
          <OperacaoTracking operacao={op as any} onChange={invalidate} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OperacaoAnexos operacaoId={operacao.id} anexos={anexos} onChange={invalidate} />
        <OperacaoFinanceiro operacaoId={operacao.id} lancamentos={financeiro} onChange={invalidate} />
      </div>

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
