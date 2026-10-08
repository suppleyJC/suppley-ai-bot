/**
 * OperacaoNotas — anotações da operação, opcionalmente ancoradas a um marco.
 *
 * Deliberadamente SIMPLES (não é um chat): o time registra observações e
 * decisões coladas ao ponto da jornada a que se referem. A conversa com a IA
 * continua no chat principal (deep-link no cabeçalho da operação).
 *
 * Persistência sem tabela nova: reusa operacao_eventos com tipo "nota_interna"
 * e payload { marcoTipo } — as notas aparecem também no histórico e no contexto
 * que a Excambia lê.
 */
import React, { useState } from "react";
import { StickyNote, Loader2, Plus } from "lucide-react";
import { MARCO_META, getMarcoLabel, JORNADA_MARCOS, type TipoMarco } from "@/lib/marcoLabels";

interface Evento {
  id: number;
  tipo: string;
  titulo: string | null;
  payload?: unknown;
  autor: string;
  criadoEm: string | Date;
}

const AUTOR_LABEL: Record<string, string> = {
  usuario: "Você", excambia: "Excambia", sistema: "Sistema",
};

function marcoTipoDe(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "marcoTipo" in (payload as any)) {
    return (payload as any).marcoTipo ?? null;
  }
  return null;
}

function fmt(d: string | Date): string {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function OperacaoNotas({
  eventos, onAdd, adding,
}: {
  eventos: Evento[];
  onAdd: (texto: string, marcoTipo?: TipoMarco) => void;
  adding: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [marco, setMarco] = useState<"" | TipoMarco>("");

  const notas = eventos.filter((e) => e.tipo === "nota_interna");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    onAdd(t, marco || undefined);
    setTexto("");
    setMarco("");
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <StickyNote className="h-3.5 w-3.5" /> Notas ({notas.length})
      </h3>

      {/* nova nota */}
      <form onSubmit={submit} className="mb-4 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="Anote uma observação ou decisão desta operação…"
          className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={marco}
            onChange={(e) => setMarco(e.target.value as "" | TipoMarco)}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
            title="Ancorar a nota a um marco (opcional)"
          >
            <option value="">Sem marco específico</option>
            {JORNADA_MARCOS.map((g) => (
              <optgroup key={g.fase} label={`${g.fase}. ${g.label}`}>
                {g.tipos.map((t) => (
                  <option key={t} value={t}>{MARCO_META[t].label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || !texto.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Adicionar nota
          </button>
        </div>
      </form>

      {/* lista */}
      {notas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma nota ainda. Registre a primeira acima.</p>
      ) : (
        <ul className="space-y-2">
          {notas.map((n) => {
            const mt = marcoTipoDe(n.payload);
            return (
              <li key={n.id} className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{n.titulo}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-semibold">{AUTOR_LABEL[n.autor] ?? n.autor}</span>
                  <span>·</span>
                  <span>{fmt(n.criadoEm)}</span>
                  {mt && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">
                      <StickyNote className="h-2.5 w-2.5" /> {getMarcoLabel(mt)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
