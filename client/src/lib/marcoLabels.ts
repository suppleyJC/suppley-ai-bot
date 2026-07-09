/**
 * marcoLabels — fonte única dos MARCOS da jornada da operação (client).
 *
 * Espelha o vocabulário do backend (operacaoService: MARCO_LABEL_PT /
 * MARCO_ESTAGIO). Use SEMPRE este mapa na UI — painel (OperacaoMarcos) e chat
 * (OperationJourneyCard) — para os dois lados contarem a mesma história.
 */
import {
  PackageCheck, Ship, FileCheck, Zap, ShoppingCart, Factory, Search, Users,
  Send, FileText, Handshake, Calculator, ThumbsUp, type LucideIcon,
} from "lucide-react";
import type { Estagio } from "@/lib/stageLabels";

export type TipoMarco =
  | "item_pesquisado" | "fornecedores_identificados"
  | "rfq_enviada" | "cotacao_recebida" | "fornecedor_selecionado"
  | "calculo_feito" | "go_aprovado"
  | "pedido_confirmado" | "producao_iniciada" | "produto_embarcado"
  | "di_registrada" | "nacionalizado" | "entregue";

export const MARCO_META: Record<TipoMarco, { label: string; Icon: LucideIcon }> = {
  item_pesquisado:            { label: "Item pesquisado",            Icon: Search },
  fornecedores_identificados: { label: "Fornecedores identificados", Icon: Users },
  rfq_enviada:                { label: "RFQ enviada",                Icon: Send },
  cotacao_recebida:           { label: "Cotação recebida",           Icon: FileText },
  fornecedor_selecionado:     { label: "Fornecedor selecionado",     Icon: Handshake },
  calculo_feito:              { label: "Cálculo feito",              Icon: Calculator },
  go_aprovado:                { label: "GO aprovado",                Icon: ThumbsUp },
  pedido_confirmado:          { label: "Pedido confirmado",          Icon: ShoppingCart },
  producao_iniciada:          { label: "Produção iniciada",          Icon: Factory },
  produto_embarcado:          { label: "Produto embarcado",          Icon: Ship },
  di_registrada:              { label: "DI registrada",              Icon: FileCheck },
  nacionalizado:              { label: "Nacionalizado",              Icon: Zap },
  entregue:                   { label: "Entregue",                   Icon: PackageCheck },
};

/** Marcos agrupados por estágio da jornada (na ordem do funil). */
export const JORNADA_MARCOS: { estagio: Estagio; tipos: TipoMarco[] }[] = [
  { estagio: "demand",  tipos: ["item_pesquisado", "fornecedores_identificados"] },
  { estagio: "source",  tipos: ["rfq_enviada", "cotacao_recebida", "fornecedor_selecionado"] },
  { estagio: "analyze", tipos: ["calculo_feito", "go_aprovado"] },
  { estagio: "execute", tipos: ["pedido_confirmado", "producao_iniciada", "produto_embarcado"] },
  { estagio: "finance", tipos: ["di_registrada", "nacionalizado", "entregue"] },
];

export const TODOS_MARCOS = JORNADA_MARCOS.flatMap((g) => g.tipos);

/** Rótulo seguro a partir de um código de marco (com fallback). */
export function getMarcoLabel(tipo: string): string {
  return MARCO_META[tipo as TipoMarco]?.label ?? tipo.replace(/_/g, " ");
}
