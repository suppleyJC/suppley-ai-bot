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
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import OperacaoTimeline from "@/components/OperacaoTimeline";
import OperacaoTracking from "@/components/OperacaoTracking";
import OperacaoAnexos from "@/components/OperacaoAnexos";
import OperacaoFinanceiro from "@/components/OperacaoFinanceiro";
import JornadaTrilho from "@/components/operacao/JornadaTrilho";
import OperacaoNotas from "@/components/operacao/OperacaoNotas";
import {
  ProgressRing, CartaoAgora, CentralPendencias, MetricaTile,
  type JornadaResumoData, type MarcoRegistroInput,
} from "@/components/operacao/JornadaResumo";
import type { TipoMarco } from "@/lib/marcoLabels";
import {
  ArrowLeft, CalendarClock, Globe2, MessageCircle, Anchor, DollarSign, AlertTriangle,
  LayoutDashboard, Route, ListChecks, Paperclip, StickyNote,
} from "lucide-react";

type TabKey = "geral" | "jornada" | "pendencias" | "documentos" | "custos" | "notas";

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
  const [tab, setTab] = useState<TabKey>("geral");
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

  // MARCOS: uma única fonte de escrita para o cartão "Agora" e o bloco
  // "Jornada · marcos". Concluir de um clique OU registro detalhado usam a
  // mesma mutation — o contador e o banco atualizam na hora.
  const [concluindoTipo, setConcluindoTipo] = useState<string | null>(null);
  const registrarMarco = trpc.operations.registrarMarco.useMutation({
    onSuccess: () => { invalidate(); toast.success("Marco registrado."); },
    onError: (e) => toast.error(e.message || "Não foi possível registrar o marco."),
    onSettled: () => setConcluindoTipo(null),
  });

  /** Um clique: conclui o marco (realizado, agora). */
  const concluirMarco = (tipo: string) => {
    setConcluindoTipo(tipo);
    registrarMarco.mutate({
      operacaoId: id,
      tipo: tipo as any,
      status: "realizado",
      dataReferencia: new Date(),
    });
  };

  /** Registro detalhado (planejamento com responsável/prazo/descrição). */
  const registrarMarcoDetalhado = (m: MarcoRegistroInput) => {
    registrarMarco.mutate({
      operacaoId: id,
      tipo: m.tipo as any,
      status: m.status,
      dataReferencia: m.dataReferencia,
      responsavel: m.responsavel,
      vencimento: m.vencimento ?? undefined,
      descricao: m.descricao,
    });
  };

  /** Nota ancorada (opcionalmente) a um marco — reusa operacao_eventos. */
  const adicionarNota = (texto: string, marcoTipo?: TipoMarco) => {
    if (!data?.operacao) return;
    addEvento.mutate({
      operacaoId: data.operacao.id,
      tipo: "nota_interna",
      estagio: data.operacao.estagioAtual,
      titulo: texto,
      payload: marcoTipo ? { marcoTipo } : undefined,
    });
  };

  if (!Number.isFinite(id)) {
    return <div className="p-8 text-sm text-muted-foreground">Operação inválida.</div>;
  }
  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando operação…</div>;
  }
  if (error || !data?.operacao) {
    return (
      <div className="p-8">
        <p className="text-sm font-semibold text-red-500">
          Não foi possível carregar esta operação.
        </p>
        {error?.message && (
          <p className="mt-2 max-w-2xl whitespace-pre-wrap break-words rounded-lg bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700">
            {error.message}
          </p>
        )}
        <button
          onClick={() => utils.operations.get.invalidate({ id })}
          className="mt-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { operacao, eventos } = data;
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
  const marcos = (data as any).marcos ?? [];
  const notasCount = (eventos as any[]).filter((e) => e.tipo === "nota_interna").length;

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

      </header>

      {/* ABAS — o detalhe da operação organizado por seção */}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {([
          { key: "geral",      label: "Visão geral", Icon: LayoutDashboard, count: null },
          { key: "jornada",    label: "Jornada",     Icon: Route,           count: null },
          { key: "pendencias", label: "Pendências",  Icon: ListChecks,      count: jornada?.pendencias.length ?? 0 },
          { key: "documentos", label: "Documentos",  Icon: Paperclip,       count: anexos.length },
          { key: "custos",     label: "Custos",      Icon: DollarSign,      count: financeiro.length },
          { key: "notas",      label: "Notas",       Icon: StickyNote,      count: notasCount },
        ] as { key: TabKey; label: string; Icon: typeof Route; count: number | null }[]).map((t) => {
          const active = tab === t.key;
          const Icon = t.Icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
              {t.count != null && t.count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-violet-100 text-violet-700" : "bg-muted text-muted-foreground"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ---------------- VISÃO GERAL ---------------- */}
      {tab === "geral" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            {/* metadados editáveis: prioridade, prazo, origem desejada */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          </div>

          {jornada && (
            <CartaoAgora
              proxima={jornada.proximaAcao}
              onRegistrar={concluirMarco}
              onConversar={conversar}
            />
          )}

          {mostraTracking && (
            <OperacaoTracking operacao={op as any} onChange={invalidate} />
          )}
        </div>
      )}

      {/* ---------------- JORNADA (substitui a esteira) ---------------- */}
      {tab === "jornada" && (
        <div className="space-y-6">
          <JornadaTrilho marcos={marcos} proximaTipo={jornada?.proximaAcao?.tipo ?? null} />
          <OperacaoTimeline
            operacao={operacao as any}
            eventos={eventos as any}
            showEsteira={false}
            onAdvanceStage={() => advance.mutate({ operacaoId: operacao.id })}
            onDecideGoNoGo={(d) => decide.mutate({ operacaoId: operacao.id, decision: d })}
          />
        </div>
      )}

      {/* ---------------- PENDÊNCIAS ---------------- */}
      {tab === "pendencias" && (
        jornada ? (
          <CentralPendencias
            pendencias={jornada.pendencias}
            realizados={jornada.realizados}
            total={jornada.total}
            onConcluir={concluirMarco}
            onSubmit={registrarMarcoDetalhado}
            registrando={registrarMarco.isPending}
            concluindoTipo={concluindoTipo}
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Sem jornada disponível para esta operação.</p>
        )
      )}

      {/* ---------------- DOCUMENTOS ---------------- */}
      {tab === "documentos" && (
        <OperacaoAnexos operacaoId={operacao.id} anexos={anexos} onChange={invalidate} />
      )}

      {/* ---------------- CUSTOS ---------------- */}
      {tab === "custos" && (
        <OperacaoFinanceiro operacaoId={operacao.id} lancamentos={financeiro} onChange={invalidate} />
      )}

      {/* ---------------- NOTAS ---------------- */}
      {tab === "notas" && (
        <OperacaoNotas
          eventos={eventos as any}
          onAdd={adicionarNota}
          adding={addEvento.isPending}
        />
      )}
    </div>
  );
}
