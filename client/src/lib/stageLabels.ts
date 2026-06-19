/**
 * stageLabels — fonte única dos rótulos das etapas da operação.
 *
 * Os CÓDIGOS internos do banco (demand/source/analyze/execute/finance + closed/lost)
 * NÃO mudam — só o rótulo exibido e o significado de `finance`, que passa a ser
 * "Nacionalização / Entrega". Câmbio saiu de coluna e virou camada transversal
 * (Inteligência de Mercado + Viabilidade + Financeiro).
 *
 * Use SEMPRE este mapa na UI (Kanban, esteira, timeline) — nunca textos fixos —
 * para manter coesão entre o Painel e a Excambia.
 */
import {
  ClipboardList, Send, FileBarChart, Factory, PackageCheck,
  CheckCircle2, XCircle, type LucideIcon,
} from "lucide-react";

export type Estagio =
  | "demand" | "source" | "analyze" | "execute" | "finance" | "closed" | "lost";

/** Rótulo curto por código de estágio (para chips, badges, textos). */
export const STAGE_LABELS: Record<Estagio, string> = {
  demand:  "Demanda",
  source:  "Sourcing / RFQ",
  analyze: "Viabilidade",
  execute: "Produção / Embarque",
  finance: "Nacionalização / Entrega",
  closed:  "Encerrada",
  lost:    "Perdida",
};

/** Ordem canônica das 5 etapas operacionais (sem os estados finais). */
export const STAGE_ORDER = ["demand", "source", "analyze", "execute", "finance"] as const;

/** Ordem completa, incluindo estados finais (para cálculo de progresso). */
export const STAGE_ORDER_FULL: Estagio[] =
  ["demand", "source", "analyze", "execute", "finance", "closed", "lost"];

/** Metadados de apresentação por etapa (ícone + descrição curta). */
export const STAGE_META: Record<
  (typeof STAGE_ORDER)[number],
  { label: string; Icon: LucideIcon; descricao: string }
> = {
  demand:  { label: STAGE_LABELS.demand,  Icon: ClipboardList,  descricao: "Necessidade do cliente estruturada" },
  source:  { label: STAGE_LABELS.source,  Icon: Send,           descricao: "Fornecedores selecionados e RFQ enviada" },
  analyze: { label: STAGE_LABELS.analyze, Icon: FileBarChart,   descricao: "Cotações consolidadas e cálculo de viabilidade" },
  execute: { label: STAGE_LABELS.execute, Icon: Factory,        descricao: "Pedido, produção e embarque" },
  finance: { label: STAGE_LABELS.finance, Icon: PackageCheck,   descricao: "Trânsito, desembaraço e entrega" },
};

/** Ícone por código de estágio (inclui estados finais). */
export const STAGE_ICONS: Record<Estagio, LucideIcon> = {
  demand:  ClipboardList,
  source:  Send,
  analyze: FileBarChart,
  execute: Factory,
  finance: PackageCheck,
  closed:  CheckCircle2,
  lost:    XCircle,
};

/** Rótulo seguro a partir de um código (com fallback). */
export function getStageLabel(estagio: string): string {
  return STAGE_LABELS[estagio as Estagio] ?? estagio;
}
