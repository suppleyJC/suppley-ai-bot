/**
 * JornadaTrilho — o mapa da jornada da operação (substitui a "Esteira" flat de
 * 5 caixas). Mostra os marcos granulares agrupados por estágio do funil, com o
 * estado de cada um: concluído, em foco (próxima ação) ou pendente.
 *
 * Lê os marcos JÁ existentes (operations.get → data.marcos) — nada de estado
 * novo. A ordem e o agrupamento vêm da fonte única client/src/lib/marcoLabels.
 */
import React from "react";
import { Check } from "lucide-react";
import { JORNADA_MARCOS, MARCO_META, MARCO_GATE, type TipoMarco } from "@/lib/marcoLabels";

interface MarcoRow {
  tipo: string;
  status: string;
  dataReferencia?: string | Date | null;
}

function fmt(d?: string | Date | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function JornadaTrilho({
  marcos, proximaTipo,
}: {
  marcos: MarcoRow[];
  proximaTipo?: string | null;
}) {
  // Um estado por tipo: "realizado" tem precedência; guarda a data do marco.
  const byTipo = new Map<string, MarcoRow>();
  for (const m of marcos) {
    const prev = byTipo.get(m.tipo);
    if (!prev || m.status === "realizado" || prev.status !== "realizado") byTipo.set(m.tipo, m);
  }
  const realizado = (t: string) => byTipo.get(t)?.status === "realizado";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Jornada da operação
      </h3>

      <div className="space-y-5">
        {JORNADA_MARCOS.map((group) => {
          const done = group.tipos.filter((t) => realizado(t)).length;
          return (
            <div key={group.fase}>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                  {group.fase}
                </span>
                <span className="text-xs font-bold text-foreground">{group.label}</span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {done}/{group.tipos.length}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <ol className="relative ml-1">
                {group.tipos.map((t, i) => {
                  const isDone = realizado(t as TipoMarco);
                  const isCurrent = !isDone && proximaTipo === t;
                  const meta = MARCO_META[t as TipoMarco];
                  const Icon = meta.Icon;
                  const data = fmt(byTipo.get(t)?.dataReferencia);
                  const last = i === group.tipos.length - 1;
                  return (
                    <li key={t} className="relative flex gap-3 pb-3 last:pb-0">
                      {!last && (
                        <span
                          className={`absolute left-[13px] top-7 -bottom-0 w-px ${isDone ? "bg-teal-300" : "bg-muted"}`}
                        />
                      )}
                      <span
                        className={[
                          "z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2",
                          isDone
                            ? "border-teal-500 bg-teal-500 text-white"
                            : isCurrent
                              ? "border-violet-500 bg-violet-50 text-violet-600"
                              : "border-muted bg-card text-muted-foreground/50",
                        ].join(" ")}
                      >
                        {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm ${
                              isDone
                                ? "font-medium text-foreground"
                                : isCurrent
                                  ? "font-bold text-violet-700"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {meta.label}
                          </p>
                          {isCurrent && (
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700">
                              Agora
                            </span>
                          )}
                          {MARCO_GATE[t as TipoMarco] && (
                            <span
                              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700"
                              title={`Gate de governança: ${MARCO_GATE[t as TipoMarco]}`}
                            >
                              Gate
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {isDone ? (data ? `concluído · ${data}` : "concluído") : isCurrent ? "em foco" : "pendente"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
