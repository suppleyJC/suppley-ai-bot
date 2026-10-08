/**
 * marcoLabels — fonte única dos MARCOS da jornada da operação (client).
 *
 * Espelha o vocabulário do backend (operacaoService: MARCO_LABEL_PT /
 * MARCO_FASE / FASE_LABEL). Use SEMPRE este mapa na UI — painel (JornadaTrilho,
 * Pendências, Notas) e chat — para os dois lados contarem a mesma história.
 *
 * A jornada tem 9 fases de apresentação (Produto → Entrega); cada fase agrupa
 * marcos granulares. Os 5 estágios internos (Kanban) continuam derivados no
 * backend (MARCO_ESTAGIO) e não aparecem aqui.
 */
import {
  Search, Ruler, Tags, ShieldCheck, Users, Send, FileText, Handshake, Calculator,
  TrendingUp, ThumbsUp, FileSignature, ShoppingCart, Banknote, Factory, CalendarClock,
  BadgeCheck, CalendarCheck, Receipt, ScrollText, Ship, Navigation, MapPin, FileCheck,
  Landmark, Anchor, Zap, PackageOpen, PackageCheck, Flag, type LucideIcon,
} from "lucide-react";

export type TipoMarco =
  | "item_pesquisado" | "especificacao_definida" | "ncm_classificada" | "conformidade_verificada"
  | "fornecedores_identificados" | "rfq_enviada" | "cotacao_recebida" | "fornecedor_selecionado"
  | "calculo_feito" | "benchmark_mercado" | "go_aprovado"
  | "contrato_assinado" | "pedido_confirmado" | "pagamento_realizado"
  | "producao_iniciada" | "inspecao_agendada" | "inspecao_aprovada"
  | "booking_confirmado" | "invoice_emitida" | "bl_emitido" | "produto_embarcado"
  | "em_transito" | "chegada_prevista"
  | "di_registrada" | "impostos_recolhidos" | "carga_chegou" | "nacionalizado"
  | "carga_liberada" | "entregue" | "operacao_fechada";

export const MARCO_META: Record<TipoMarco, { label: string; Icon: LucideIcon }> = {
  item_pesquisado:            { label: "Item pesquisado",            Icon: Search },
  especificacao_definida:     { label: "Especificação definida",    Icon: Ruler },
  ncm_classificada:           { label: "NCM classificada",          Icon: Tags },
  conformidade_verificada:    { label: "Conformidade verificada",   Icon: ShieldCheck },
  fornecedores_identificados: { label: "Fornecedores identificados", Icon: Users },
  rfq_enviada:                { label: "RFQ enviada",               Icon: Send },
  cotacao_recebida:           { label: "Cotação recebida",          Icon: FileText },
  fornecedor_selecionado:     { label: "Fornecedor selecionado",    Icon: Handshake },
  calculo_feito:              { label: "Cálculo feito",             Icon: Calculator },
  benchmark_mercado:          { label: "Benchmark de mercado",      Icon: TrendingUp },
  go_aprovado:                { label: "GO aprovado",               Icon: ThumbsUp },
  contrato_assinado:          { label: "Contrato/PI assinado",      Icon: FileSignature },
  pedido_confirmado:          { label: "Pedido confirmado",         Icon: ShoppingCart },
  pagamento_realizado:        { label: "Pagamento/câmbio",          Icon: Banknote },
  producao_iniciada:          { label: "Produção iniciada",         Icon: Factory },
  inspecao_agendada:          { label: "Inspeção agendada",         Icon: CalendarClock },
  inspecao_aprovada:          { label: "Inspeção aprovada",         Icon: BadgeCheck },
  booking_confirmado:         { label: "Booking confirmado",        Icon: CalendarCheck },
  invoice_emitida:            { label: "Commercial invoice",        Icon: Receipt },
  bl_emitido:                 { label: "BL / AWB emitido",          Icon: ScrollText },
  produto_embarcado:          { label: "Produto embarcado",         Icon: Ship },
  em_transito:                { label: "Em trânsito",               Icon: Navigation },
  chegada_prevista:           { label: "ETA / chegada prevista",    Icon: MapPin },
  di_registrada:              { label: "DI / DUIMP registrada",     Icon: FileCheck },
  impostos_recolhidos:        { label: "Impostos recolhidos",       Icon: Landmark },
  carga_chegou:               { label: "Carga chegou",              Icon: Anchor },
  nacionalizado:              { label: "Nacionalizado",             Icon: Zap },
  carga_liberada:             { label: "Carga liberada",            Icon: PackageOpen },
  entregue:                   { label: "Entregue",                  Icon: PackageCheck },
  operacao_fechada:           { label: "Operação fechada",          Icon: Flag },
};

/** Marcos agrupados pelas 9 FASES da jornada (na ordem do funil). */
export const JORNADA_MARCOS: { fase: number; label: string; tipos: TipoMarco[] }[] = [
  { fase: 1, label: "Produto e conformidade",   tipos: ["item_pesquisado", "especificacao_definida", "ncm_classificada", "conformidade_verificada"] },
  { fase: 2, label: "Sourcing e homologação",   tipos: ["fornecedores_identificados", "rfq_enviada", "cotacao_recebida", "fornecedor_selecionado"] },
  { fase: 3, label: "Viabilidade econômica",    tipos: ["calculo_feito", "benchmark_mercado", "go_aprovado"] },
  { fase: 4, label: "Contratação e pedido",     tipos: ["contrato_assinado", "pedido_confirmado", "pagamento_realizado"] },
  { fase: 5, label: "Produção e qualidade",     tipos: ["producao_iniciada", "inspecao_agendada", "inspecao_aprovada"] },
  { fase: 6, label: "Logística na origem",      tipos: ["booking_confirmado", "invoice_emitida", "bl_emitido", "produto_embarcado"] },
  { fase: 7, label: "Trânsito internacional",   tipos: ["em_transito", "chegada_prevista"] },
  { fase: 8, label: "Desembaraço",              tipos: ["di_registrada", "impostos_recolhidos", "carga_chegou", "nacionalizado"] },
  { fase: 9, label: "Entrega e fechamento",     tipos: ["carga_liberada", "entregue", "operacao_fechada"] },
];

/** Gates de governança — marcos que representam decisão/aprovação. */
export const MARCO_GATE: Partial<Record<TipoMarco, string>> = {
  go_aprovado: "GO / NO-GO",
  inspecao_aprovada: "Inspeção de qualidade",
  di_registrada: "Regime DUIMP × DI",
};

export const TODOS_MARCOS = JORNADA_MARCOS.flatMap((g) => g.tipos);

/** Rótulo seguro a partir de um código de marco (com fallback). */
export function getMarcoLabel(tipo: string): string {
  return MARCO_META[tipo as TipoMarco]?.label ?? tipo.replace(/_/g, " ");
}
