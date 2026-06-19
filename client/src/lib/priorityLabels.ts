/**
 * priorityLabels — fonte única dos rótulos e cores de prioridade da operação.
 *
 * Os CÓDIGOS internos do banco (baixa/media/alta/critica) NÃO mudam — só o
 * rótulo exibido e as classes de cor. Use SEMPRE este mapa na UI (Kanban,
 * detalhe, formulário) — nunca textos/cores fixas — para manter coesão entre
 * o Painel e a Excambia.
 */
export type Prioridade = "baixa" | "media" | "alta" | "critica";

/** Ordem canônica (da menor para a maior). */
export const PRIORITY_ORDER: Prioridade[] = ["baixa", "media", "alta", "critica"];

/** Rótulo + classes Tailwind por código de prioridade. */
export const PRIORITY_META: Record<Prioridade, { label: string; cls: string; dot: string }> = {
  baixa:   { label: "Baixa",   cls: "bg-slate-50 text-slate-600",   dot: "bg-slate-400" },
  media:   { label: "Média",   cls: "bg-blue-50 text-blue-700",     dot: "bg-blue-500" },
  alta:    { label: "Alta",    cls: "bg-amber-50 text-amber-700",   dot: "bg-amber-500" },
  critica: { label: "Crítica", cls: "bg-red-50 text-red-700",       dot: "bg-red-500" },
};

/** Metadados seguros a partir de um código (com fallback para "media"). */
export function getPriorityMeta(prioridade?: string | null) {
  return PRIORITY_META[(prioridade as Prioridade)] ?? PRIORITY_META.media;
}
