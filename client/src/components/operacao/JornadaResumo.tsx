/**
 * JornadaResumo — peças do redesenho do detalhe da operação (Fase 1).
 *
 * Exporta:
 *   - ProgressRing    : anel de progresso (donut SVG) do cabeçalho executivo
 *   - CartaoAgora     : o cartão "Agora" (próxima ação, responsável, prazo, impacto)
 *   - CentralPendencias: lista de pendências ordenadas por urgência
 *
 * Consome a jornada JÁ DERIVADA pelo backend (operations.get → data.jornada).
 * A comunicação com a Excambia continua no CHAT PRINCIPAL: os botões apenas
 * fazem deep-link para /excambia?operacao= — nada de chat embutido na operação.
 */
import React, { useState } from "react";
import { Clock, ArrowRight, MessageCircle, Plus, ListChecks, Zap, Check, Loader2, X } from "lucide-react";
import { responsavelMeta, saudeMeta, formatVencimento, type Responsavel } from "@/lib/jornadaLabels";
import { STAGE_LABELS } from "@/lib/stageLabels";
import { JORNADA_MARCOS, MARCO_META, type TipoMarco } from "@/lib/marcoLabels";

const RESPONSAVEIS: Responsavel[] = [
  "cliente", "excambia", "fornecedor", "agente", "despachante", "anuente", "sistema",
];

/** Payload de registro detalhado de um marco (planejamento com responsável/prazo). */
export interface MarcoRegistroInput {
  tipo: TipoMarco;
  status: "planejado" | "realizado" | "cancelado";
  dataReferencia: Date;
  responsavel?: Responsavel;
  vencimento?: Date | null;
  descricao?: string;
}

export interface MarcoInfo {
  tipo: string;
  label: string;
  acao: string;
  estagio: string;
  responsavel: string;
  vencimento: string | null;
  saudePrazo: string;
}
export interface JornadaResumoData {
  progressoPct: number;
  realizados: number;
  total: number;
  proximaAcao: MarcoInfo | null;
  pendencias: (MarcoInfo & { status: string })[];
  riscos: number;
}

/** Anel de progresso (donut). Turquesa sobre trilho neutro — paleta da marca. */
export function ProgressRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className="stroke-muted" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        strokeLinecap="round" stroke="#28E7C5" strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        className="fill-foreground text-[13px] font-bold">{pct}%</text>
    </svg>
  );
}

/** Chip do responsável — sigla em avatar + rótulo. */
function ResponsavelChip({ responsavel }: { responsavel: string }) {
  const m = responsavelMeta(responsavel);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${m.cls}`}>
        {m.sigla}
      </span>
      <span className="text-xs font-semibold text-foreground">{m.label}</span>
    </span>
  );
}

/**
 * Cartão "Agora" — o componente mais importante do redesenho. Responde
 * "o que fazer agora, quem age e até quando". Sem próxima ação = jornada
 * concluída.
 */
export function CartaoAgora({
  proxima, onRegistrar, onConversar,
}: {
  proxima: MarcoInfo | null;
  onRegistrar: (tipo: string) => void;
  onConversar: () => void;
}) {
  if (!proxima) {
    return (
      <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Agora</p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          Jornada completa — todos os marcos concluídos. 🎉
        </p>
      </section>
    );
  }
  const saude = saudeMeta(proxima.saudePrazo);
  return (
    <section className="rounded-2xl border-2 border-violet-300 bg-card p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Agora</p>

      <div className="mt-2 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">Próxima ação</p>
          <h3 className="text-lg font-bold text-foreground">{proxima.acao}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {STAGE_LABELS[proxima.estagio as keyof typeof STAGE_LABELS] ?? proxima.estagio} · marco “{proxima.label}”
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Responsável:</span>
              <ResponsavelChip responsavel={proxima.responsavel} />
            </div>
            <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${saude.text}`}>
              <Clock className="h-3.5 w-3.5" />
              {proxima.vencimento ? `Vence ${formatVencimento(proxima.vencimento)}` : "Sem prazo definido"}
              <span className={`ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${saude.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${saude.dot}`} /> {saude.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onRegistrar(proxima.tipo)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Check className="h-4 w-4" /> Concluir esta etapa
          </button>
          <button
            onClick={onConversar}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-card px-4 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Conversar com a Excambia
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * JORNADA · MARCOS — bloco ÚNICO de marcos da operação (unifica o antigo
 * "Pendências" com o antigo timeline "Jornada · Marcos", eliminando a
 * duplicidade). Lista os marcos que faltam, por urgência, com:
 *   - "Concluir" de UM clique (registra realizado agora → atualiza o contador
 *     e o banco na hora);
 *   - "Registrar" → formulário de planejamento (status, data, responsável,
 *     prazo, descrição), preservando o modelo de estados.
 */
export function CentralPendencias({
  pendencias, realizados, total, onConcluir, onSubmit, registrando, concluindoTipo, max = 8,
}: {
  pendencias: (MarcoInfo & { status: string })[];
  realizados: number;
  total: number;
  /** Um clique: conclui o marco (realizado, agora). */
  onConcluir: (tipo: string) => void;
  /** Registro detalhado (planejamento com responsável/prazo). */
  onSubmit: (input: MarcoRegistroInput) => void;
  registrando: boolean;
  /** Tipo em conclusão no momento (para o spinner no card certo). */
  concluindoTipo?: string | null;
  max?: number;
}) {
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState<TipoMarco>((pendencias[0]?.tipo as TipoMarco) ?? "item_pesquisado");
  const [status, setStatus] = useState<MarcoRegistroInput["status"]>("realizado");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [responsavel, setResponsavel] = useState<"" | Responsavel>("");
  const [vencimento, setVencimento] = useState("");
  const [descricao, setDescricao] = useState("");

  const lista = pendencias.slice(0, max);

  function resetForm() {
    setShowForm(false);
    setStatus("realizado");
    setData(new Date().toISOString().slice(0, 10));
    setResponsavel("");
    setVencimento("");
    setDescricao("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    onSubmit({
      tipo,
      status,
      dataReferencia: new Date(data),
      responsavel: responsavel || undefined,
      vencimento: vencimento ? new Date(vencimento) : undefined,
      descricao: descricao.trim() || undefined,
    });
    resetForm();
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" /> Jornada · marcos ({realizados}/{total})
        </h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Fechar" : "Registrar"}
        </button>
      </div>

      {/* Formulário de registro detalhado (planejamento com responsável/prazo) */}
      {showForm && (
        <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-border bg-muted/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Marco</span>
              <select
                value={tipo} onChange={(e) => setTipo(e.target.value as TipoMarco)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
              >
                {JORNADA_MARCOS.map((g) => (
                  <optgroup key={g.fase} label={`${g.fase}. ${g.label}`}>
                    {g.tipos.map((t) => (
                      <option key={t} value={t}>{MARCO_META[t].label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Status</span>
              <select
                value={status} onChange={(e) => setStatus(e.target.value as MarcoRegistroInput["status"])}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
              >
                <option value="planejado">Planejado</option>
                <option value="realizado">Realizado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} required
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vence em (opcional)</span>
              <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Responsável (opcional)</span>
            <select
              value={responsavel} onChange={(e) => setResponsavel(e.target.value as "" | Responsavel)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
            >
              <option value="">— não definido —</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>{responsavelMeta(r).label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Descrição (opcional)</span>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Confirmado com Fabricante XYZ"
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={registrando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
              {registrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Salvar marco
            </button>
            <button type="button" onClick={resetForm}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todos os marcos concluídos — jornada completa. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((p) => {
            const saude = saudeMeta(p.saudePrazo);
            const resp = responsavelMeta(p.responsavel);
            const concluindo = concluindoTipo === p.tipo;
            return (
              <li
                key={p.tipo}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5"
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${saude.dot}`} title={saude.label} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{p.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {STAGE_LABELS[p.estagio as keyof typeof STAGE_LABELS] ?? p.estagio}
                    {" · "}
                    <span className={saude.text}>
                      {p.vencimento ? formatVencimento(p.vencimento) : "sem prazo"}
                    </span>
                  </p>
                </div>
                <span className={`hidden sm:inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${resp.cls}`}
                  title={`Responsável sugerido: ${resp.label}`}>
                  {resp.sigla}
                </span>
                <button
                  onClick={() => onConcluir(p.tipo)}
                  disabled={registrando}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                >
                  {concluindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Concluir
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Métrica compacta do cabeçalho (rótulo + valor + ícone). */
export function MetricaTile({
  Icon, label, value, accent,
}: {
  Icon: typeof Zap; label: string; value: React.ReactNode; accent?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`h-5 w-5 flex-shrink-0 ${accent ?? "text-violet-500"}`} />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}
