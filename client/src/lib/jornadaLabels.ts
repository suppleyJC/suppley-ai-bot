/**
 * jornadaLabels — rótulos de apresentação do modelo de estados da jornada.
 *
 * O backend (operacaoService.computeJornadaResumo) já entrega a jornada derivada
 * — próxima ação, responsável, vencimento e saúde do prazo. Aqui ficam apenas os
 * MAPAS DE EXIBIÇÃO (texto + cor) usados no cabeçalho executivo, no cartão "Agora"
 * e nos chips de cada marco. Fonte de verdade dos códigos: operacaoService.
 */

export type Responsavel =
  | "cliente" | "excambia" | "fornecedor" | "agente" | "despachante" | "anuente" | "sistema";
export type SaudePrazo = "no_prazo" | "atencao" | "atrasado" | "sem_prazo";

/** Quem deve agir — rótulo + sigla (avatar) + cor da marca vs. terceiros. */
export const RESPONSAVEL_META: Record<Responsavel, { label: string; sigla: string; cls: string }> = {
  cliente:     { label: "Cliente",       sigla: "CL", cls: "bg-violet-100 text-violet-700" },
  excambia:    { label: "Excambia",      sigla: "EX", cls: "bg-violet-600 text-white" },
  fornecedor:  { label: "Fornecedor",    sigla: "FN", cls: "bg-teal-100 text-teal-700" },
  agente:      { label: "Agente de cargas", sigla: "AG", cls: "bg-blue-100 text-blue-700" },
  despachante: { label: "Despachante",   sigla: "DP", cls: "bg-amber-100 text-amber-700" },
  anuente:     { label: "Órgão anuente", sigla: "AN", cls: "bg-rose-100 text-rose-700" },
  sistema:     { label: "Sistema",       sigla: "SY", cls: "bg-muted text-muted-foreground" },
};

export function responsavelMeta(r?: string | null) {
  return RESPONSAVEL_META[(r as Responsavel)] ?? RESPONSAVEL_META.sistema;
}

/** Saúde do prazo — texto + cor de texto + cor da bolinha (nunca só cor). */
export const SAUDE_META: Record<SaudePrazo, { label: string; text: string; dot: string }> = {
  no_prazo:  { label: "No prazo", text: "text-teal-700",  dot: "bg-teal-500" },
  atencao:   { label: "Atenção",  text: "text-amber-700", dot: "bg-amber-500" },
  atrasado:  { label: "Atrasado", text: "text-red-600",   dot: "bg-red-500" },
  sem_prazo: { label: "Sem prazo", text: "text-muted-foreground", dot: "bg-muted-foreground/40" },
};

export function saudeMeta(s?: string | null) {
  return SAUDE_META[(s as SaudePrazo)] ?? SAUDE_META.sem_prazo;
}

/** Vencimento em linguagem natural ("hoje, 17h", "em 3 dias", "há 2 dias"). */
export function formatVencimento(iso?: string | null): string {
  if (!iso) return "sem prazo";
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const diffDias = Math.round(diffMs / 86_400_000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDias === 0) return `hoje, ${hora}`;
  if (diffDias === 1) return `amanhã, ${hora}`;
  if (diffDias === -1) return `ontem, ${hora}`;
  if (diffDias > 1) return `em ${diffDias} dias`;
  return `há ${Math.abs(diffDias)} dias`;
}
