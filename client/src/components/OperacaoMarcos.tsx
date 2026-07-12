/**
 * OperacaoMarcos — marcos da JORNADA da operação (visão unificada).
 *
 * Cobre os dois fluxos numa só linha do tempo, agrupada por estágio:
 *   Estudo do item → Cotação e RFQ → Viabilidade → Produção e Embarque → Nacionalização e Entrega
 * Cada marco registrado gera um evento na timeline (coesão Painel ↔ Excambia).
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Plus, Loader2, PackageCheck } from "lucide-react";
import { STAGE_LABELS } from "@/lib/stageLabels";
import { MARCO_META, JORNADA_MARCOS, TODOS_MARCOS, type TipoMarco } from "@/lib/marcoLabels";

type StatusMarco = "planejado" | "realizado" | "cancelado";

interface Marco {
  id: number;
  tipo: string;
  status: string;
  descricao?: string | null;
  dataReferencia: string | Date;
}

// Fonte única compartilhada com o chat (OperationJourneyCard) — ver lib/marcoLabels.
const TIPO_META = MARCO_META;
const JORNADA = JORNADA_MARCOS;
const TODOS_TIPOS = TODOS_MARCOS;

const STATUS_META: Record<StatusMarco, { txt: string; cls: string }> = {
  planejado:  { txt: "Planejado",  cls: "bg-amber-50 text-amber-700" },
  realizado:  { txt: "Realizado",  cls: "bg-teal-50 text-teal-700" },
  cancelado:  { txt: "Cancelado",  cls: "bg-muted text-muted-foreground" },
};

function fmtData(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OperacaoMarcos({
  operacaoId, marcos, onChange,
}: {
  operacaoId: number;
  marcos: Marco[];
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState<TipoMarco>("item_pesquisado");
  const [status, setStatus] = useState<StatusMarco>("realizado");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");

  const registrar = trpc.operations.registrarMarco.useMutation({
    onSuccess: () => { onChange(); resetForm(); toast.success("Marco registrado."); },
    onError: (e) => toast.error(e.message || "Erro ao registrar marco"),
  });

  function resetForm() {
    setShowForm(false);
    setTipo("item_pesquisado");
    setStatus("realizado");
    setDescricao("");
    setData("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) {
      toast.error("Informe a data do marco.");
      return;
    }
    registrar.mutate({
      operacaoId,
      tipo,
      status,
      descricao: descricao.trim() || undefined,
      dataReferencia: new Date(data),
    });
  }

  const realizados = new Set(marcos.filter((m) => m.status === "realizado").map((m) => m.tipo));
  const totalRealizados = TODOS_TIPOS.filter((t) => realizados.has(t)).length;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <PackageCheck className="h-3.5 w-3.5" /> Jornada · marcos ({totalRealizados}/{TODOS_TIPOS.length})
        </h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar
        </button>
      </div>

      {/* Linha do tempo agrupada por estágio */}
      <div className="space-y-4">
        {JORNADA.map((grupo) => (
          <div key={grupo.estagio}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-violet-500">
              {STAGE_LABELS[grupo.estagio]}
            </p>
            <div className="space-y-2 border-l border-border pl-3">
              {grupo.tipos.map((t) => {
                const meta = TIPO_META[t];
                const Icon = meta.Icon;
                const marcado = marcos.find((m) => m.tipo === t);
                const realizado = realizados.has(t);
                return (
                  <div key={t} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                        realizado
                          ? "border-teal-500 bg-teal-500 text-white"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {realizado ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className={`text-sm font-semibold ${realizado ? "text-foreground" : "text-muted-foreground"}`}>
                        {meta.label}
                      </p>
                      {marcado && (
                        <>
                          <p className="text-[11px] text-muted-foreground">
                            {fmtData(marcado.dataReferencia)}
                            {marcado.descricao ? ` · ${marcado.descricao}` : ""}
                          </p>
                          {marcado.status !== "realizado" && (
                            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${STATUS_META[marcado.status as StatusMarco]?.cls || ""}`}>
                              {STATUS_META[marcado.status as StatusMarco]?.txt || marcado.status}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* formulário */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-xl border border-border bg-muted/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Marco</span>
              <select
                value={tipo} onChange={(e) => setTipo(e.target.value as TipoMarco)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
              >
                {JORNADA.map((g) => (
                  <optgroup key={g.estagio} label={STAGE_LABELS[g.estagio]}>
                    {g.tipos.map((t) => (
                      <option key={t} value={t}>{TIPO_META[t].label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Status</span>
              <select
                value={status} onChange={(e) => setStatus(e.target.value as StatusMarco)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
              >
                <option value="planejado">Planejado</option>
                <option value="realizado">Realizado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Data</span>
            <input
              type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Descrição (opcional)</span>
            <input
              type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Confirmado com Fabricante XYZ"
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit" disabled={registrar.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {registrar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Salvar
            </button>
            <button
              type="button" onClick={resetForm}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
