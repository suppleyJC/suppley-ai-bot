/**
 * OperacaoTimeline — esteira vertical da operação + linha do tempo de eventos.
 *
 * Consome o retorno de `operations.get`:  { operacao, eventos, estagios }
 * Sem dependências novas além das já usadas no projeto (lucide-react, tailwind).
 *
 * Estágios internos (schema): demand → source → analyze → execute → finance → closed | lost
 * Rótulos na UI: ver client/src/lib/stageLabels.ts (fonte única).
 * Câmbio saiu de coluna; `finance` agora é "Nacionalização / Entrega".
 */
import React from "react";
import {
  Users, FileBarChart, CircleDollarSign,
  Check, Sparkles, Truck, FileText, StickyNote, AlertTriangle, Clock, Paperclip,
  ShoppingCart, Factory, FileCheck, Zap, PackageCheck,
} from "lucide-react";
import { STAGE_ORDER, STAGE_META, STAGE_ORDER_FULL, type Estagio } from "@/lib/stageLabels";

/* ---------- tipos espelhando o serviço ---------- */
type Autor = "usuario" | "excambia" | "sistema";

export interface OperacaoEvento {
  id: number;
  tipo: string;
  estagio: Estagio;
  autor: Autor;
  titulo: string | null;
  payload?: unknown;
  criadoEm: string | Date;
  refTipo?: string | null;
  refId?: number | null;
}
export interface Operacao {
  id: number;
  codigo: string;
  titulo: string;
  estagioAtual: Estagio;
  status: string;
  clienteNome?: string | null;
  fornecedorNome?: string | null;
  origemPais?: string | null;
  valorEstimadoBrlCents?: number | null;
  margemEstimadaBp?: number | null;
  prioridade?: "baixa" | "media" | "alta" | "critica" | null;
  prazoDesejado?: string | Date | null;
  responsavelId?: number | null;
  origemDesejada?: string | null;
}
export interface OperacaoTimelineProps {
  operacao: Operacao;
  eventos: OperacaoEvento[];
  onAdvanceStage?: () => void;
  onAddNote?: () => void;
  onDecideGoNoGo?: (d: "go" | "no_go") => void;
}

/* ---------- esteira: derivada do mapa único de rótulos ---------- */
const ESTEIRA = STAGE_ORDER.map((key) => ({
  key,
  label: STAGE_META[key].label,
  Icon: STAGE_META[key].Icon,
}));
const ORDEM = STAGE_ORDER_FULL;

/* ---------- ícone e cor por TIPO de evento ---------- */
function eventoVisual(tipo: string): { Icon: React.ComponentType<any>; tint: string } {
  const map: Record<string, { Icon: React.ComponentType<any>; tint: string }> = {
    go_decidido:       { Icon: Check, tint: "text-emerald-600 bg-emerald-50" },
    no_go_decidido:    { Icon: AlertTriangle, tint: "text-red-600 bg-red-50" },
    calculo_executado: { Icon: FileBarChart, tint: "text-violet-600 bg-violet-50" },
    cotacao_recebida:  { Icon: FileText, tint: "text-blue-600 bg-blue-50" },
    cotacao_extraida:  { Icon: FileText, tint: "text-blue-600 bg-blue-50" },
    item_pesquisado:           { Icon: Sparkles, tint: "text-teal-600 bg-teal-50" },
    fornecedores_identificados:{ Icon: Users, tint: "text-violet-600 bg-violet-50" },
    fornecedor_selecionado:    { Icon: Check, tint: "text-emerald-600 bg-emerald-50" },
    rfq_enviada:       { Icon: Users, tint: "text-violet-600 bg-violet-50" },
    cambio_fechado:    { Icon: CircleDollarSign, tint: "text-emerald-600 bg-emerald-50" },
    estagio_avancado:  { Icon: Check, tint: "text-violet-600 bg-violet-50" },
    anexo_adicionado:  { Icon: Paperclip, tint: "text-muted-foreground bg-muted" },
    anexo_removido:    { Icon: Paperclip, tint: "text-muted-foreground bg-muted" },
    financeiro_lancado:  { Icon: CircleDollarSign, tint: "text-emerald-600 bg-emerald-50" },
    financeiro_removido: { Icon: CircleDollarSign, tint: "text-muted-foreground bg-muted" },
    pedido_confirmado:   { Icon: ShoppingCart, tint: "text-violet-600 bg-violet-50" },
    producao_iniciada:   { Icon: Factory, tint: "text-orange-600 bg-orange-50" },
    produto_embarcado:   { Icon: Truck, tint: "text-blue-600 bg-blue-50" },
    di_registrada:       { Icon: FileCheck, tint: "text-amber-600 bg-amber-50" },
    nacionalizado:       { Icon: Zap, tint: "text-teal-600 bg-teal-50" },
    entregue:            { Icon: PackageCheck, tint: "text-emerald-600 bg-emerald-50" },
    nota_interna:      { Icon: StickyNote, tint: "text-muted-foreground bg-muted" },
    alerta_ia:         { Icon: Sparkles, tint: "text-teal-600 bg-teal-50" },
    mensagem:          { Icon: Sparkles, tint: "text-teal-600 bg-teal-50" },
  };
  return map[tipo] ?? { Icon: Clock, tint: "text-muted-foreground bg-muted" };
}

/* ---------- etiqueta de ORIGEM (quem gerou o evento) ---------- */
function origemBadge(autor: Autor) {
  const map: Record<Autor, { label: string; cls: string; Icon: React.ComponentType<any> }> = {
    excambia: { label: "Excambia",  cls: "text-teal-700 bg-teal-50",     Icon: Sparkles },
    usuario:  { label: "Você",      cls: "text-violet-700 bg-violet-50", Icon: Users },
    sistema:  { label: "Sistema",   cls: "text-blue-700 bg-blue-50",     Icon: Clock },
  };
  const o = map[autor] ?? map.sistema;
  const I = o.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${o.cls}`}>
      <I className="h-3 w-3" /> {o.label}
    </span>
  );
}

function fmtData(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtBRL(cents?: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OperacaoTimeline({
  operacao, eventos, onAdvanceStage, onAddNote, onDecideGoNoGo,
}: OperacaoTimelineProps) {
  const idxAtual = ORDEM.indexOf(operacao.estagioAtual);
  const isAnalyze = operacao.estagioAtual === "analyze";
  const encerrada = operacao.estagioAtual === "closed" || operacao.estagioAtual === "lost";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
      {/* ESTEIRA VERTICAL */}
      <aside className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Esteira da operação
        </h3>
        <ol className="relative">
          {ESTEIRA.map((s, i) => {
            const pos = ORDEM.indexOf(s.key);
            const done = pos < idxAtual;
            const current = s.key === operacao.estagioAtual;
            const Icon = s.Icon;
            return (
              <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                {i < ESTEIRA.length - 1 && (
                  <span className="absolute left-[15px] top-8 -bottom-0 w-px bg-muted" />
                )}
                <span
                  className={[
                    "z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                    done ? "bg-teal-500 text-white"
                      : current ? "bg-violet-600 text-white"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <div className="pt-1">
                  <p className={`text-sm font-semibold ${current ? "text-violet-700" : done ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {done ? "concluído" : current ? "em andamento" : "pendente"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* snapshot de valores */}
        <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Custo líquido</span>
            <span className="font-semibold">{fmtBRL(operacao.valorEstimadoBrlCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Margem</span>
            <span className="font-semibold text-violet-700">
              {operacao.margemEstimadaBp != null ? `${(operacao.margemEstimadaBp / 100).toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>
      </aside>

      {/* LINHA DO TEMPO DE EVENTOS */}
      <section>
        {/* ações */}
        {!encerrada && (
          <div className="mb-4 flex flex-wrap gap-2">
            {isAnalyze && onDecideGoNoGo && (
              <>
                <button
                  onClick={() => onDecideGoNoGo("go")}
                  className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-bold text-teal-950 hover:bg-teal-300"
                >
                  Decidir GO ✓
                </button>
                <button
                  onClick={() => onDecideGoNoGo("no_go")}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  NO-GO
                </button>
              </>
            )}
            {onAdvanceStage && (
              <button
                onClick={onAdvanceStage}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                Avançar estágio →
              </button>
            )}
            {onAddNote && (
              <button
                onClick={onAddNote}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                + Nota
              </button>
            )}
          </div>
        )}

        {eventos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum evento ainda. Conforme a operação avança, os marcos aparecem aqui.
          </div>
        ) : (
          <ol className="relative">
            {eventos.map((ev, i) => {
              const { Icon, tint } = eventoVisual(ev.tipo);
              const last = i === eventos.length - 1;
              return (
                <li key={ev.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {!last && <span className="absolute left-[19px] top-10 -bottom-0 w-px bg-muted" />}
                  <span className={`z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tint}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {ev.titulo ?? ev.tipo.replace(/_/g, " ")}
                      </p>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtData(ev.criadoEm)}</span>
                    </div>
                    <div className="mt-2">{origemBadge(ev.autor)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
