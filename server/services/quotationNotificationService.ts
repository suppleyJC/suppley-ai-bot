import { notifyOwner } from "../_core/notification";

// Status labels in Portuguese
const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  analyzing: "Em Análise",
  viable: "Viável",
  not_viable: "Não Viável",
  negotiating: "Em Negociação",
  approved: "Aprovada",
  ordered: "Pedido Realizado",
  shipped: "Embarcada",
  customs: "Em Desembaraço",
  nationalized: "Nacionalizada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

// Status icons for visual representation
const STATUS_ICONS: Record<string, string> = {
  draft: "📝",
  analyzing: "🔍",
  viable: "✅",
  not_viable: "❌",
  negotiating: "💬",
  approved: "👍",
  ordered: "📦",
  shipped: "🚢",
  customs: "🛃",
  nationalized: "🇧🇷",
  completed: "🎉",
  cancelled: "🚫",
};

// Status progression (for determining if it's an advancement)
const STATUS_ORDER = [
  "draft",
  "analyzing",
  "viable",
  "negotiating",
  "approved",
  "ordered",
  "shipped",
  "customs",
  "nationalized",
  "completed",
];

export interface QuotationStatusChangeParams {
  quotationId: number;
  quotationNumber?: string;
  supplierName?: string;
  previousStatus: string;
  newStatus: string;
  changedBy?: string;
  totalValue?: number;
  productCount?: number;
}

/**
 * Notify owner when a quotation status changes
 */
export async function notifyQuotationStatusChange(
  params: QuotationStatusChangeParams
): Promise<boolean> {
  const {
    quotationId,
    quotationNumber,
    supplierName,
    previousStatus,
    newStatus,
    changedBy,
    totalValue,
    productCount,
  } = params;

  const prevLabel = STATUS_LABELS[previousStatus] || previousStatus;
  const newLabel = STATUS_LABELS[newStatus] || newStatus;
  const icon = STATUS_ICONS[newStatus] || "📋";

  const quotationRef = quotationNumber || `#${quotationId}`;
  const supplierInfo = supplierName ? ` (${supplierName})` : "";

  const title = `${icon} Cotação ${quotationRef} - ${newLabel}`;

  let content = `A cotação ${quotationRef}${supplierInfo} mudou de status.\n\n`;
  content += `**Status anterior:** ${prevLabel}\n`;
  content += `**Novo status:** ${newLabel}\n`;

  if (totalValue && totalValue > 0) {
    const formattedValue = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(totalValue / 100);
    content += `**Valor total:** ${formattedValue}\n`;
  }

  if (productCount && productCount > 0) {
    content += `**Produtos:** ${productCount} item(s)\n`;
  }

  if (changedBy) {
    content += `\n*Alterado por: ${changedBy}*`;
  }

  // Add context-specific messages
  content += getStatusContextMessage(newStatus);

  try {
    return await notifyOwner({ title, content });
  } catch (error) {
    console.error("[QuotationNotification] Failed to send notification:", error);
    return false;
  }
}

/**
 * Get context-specific message for each status
 */
function getStatusContextMessage(status: string): string {
  const messages: Record<string, string> = {
    analyzing: "\n\n📊 A cotação está sendo analisada quanto à viabilidade.",
    viable: "\n\n✅ A análise indica que esta cotação é viável para importação.",
    not_viable: "\n\n⚠️ A análise indica que esta cotação precisa de ajustes para ser viável.",
    negotiating: "\n\n💬 Iniciada negociação com o fornecedor.",
    approved: "\n\n👍 Cotação aprovada! Próximo passo: realizar o pedido.",
    ordered: "\n\n📦 Pedido realizado junto ao fornecedor. Aguardando embarque.",
    shipped: "\n\n🚢 Mercadoria embarcada! Acompanhe o tracking para previsão de chegada.",
    customs: "\n\n🛃 Mercadoria chegou ao Brasil. Processo de desembaraço aduaneiro iniciado.",
    nationalized: "\n\n🇧🇷 Mercadoria nacionalizada! Disponível para retirada/entrega.",
    completed: "\n\n🎉 Processo de importação concluído com sucesso!",
    cancelled: "\n\n🚫 Esta cotação foi cancelada.",
  };

  return messages[status] || "";
}

/**
 * Check if status change is a progression (advancement in the pipeline)
 */
export function isStatusProgression(previousStatus: string, newStatus: string): boolean {
  const prevIndex = STATUS_ORDER.indexOf(previousStatus);
  const newIndex = STATUS_ORDER.indexOf(newStatus);

  // If either status is not in the order list, consider it a change
  if (prevIndex === -1 || newIndex === -1) return true;

  return newIndex > prevIndex;
}

/**
 * Get all important status changes that should trigger notifications
 */
export function shouldNotifyStatusChange(previousStatus: string, newStatus: string): boolean {
  // Always notify for these critical status changes
  const criticalStatuses = [
    "approved",
    "ordered",
    "shipped",
    "customs",
    "nationalized",
    "completed",
    "cancelled",
  ];

  // Notify if new status is critical
  if (criticalStatuses.includes(newStatus)) return true;

  // Notify if it's a significant progression
  if (isStatusProgression(previousStatus, newStatus)) return true;

  // Notify if going backwards (potential issue)
  if (!isStatusProgression(previousStatus, newStatus) && previousStatus !== newStatus) {
    return true;
  }

  return false;
}

/**
 * Notify about milestone reached
 */
export async function notifyMilestone(
  quotationRef: string,
  milestone: string,
  details?: string
): Promise<boolean> {
  const title = `🏆 Marco alcançado: ${milestone}`;
  let content = `A cotação ${quotationRef} atingiu um marco importante: ${milestone}`;
  
  if (details) {
    content += `\n\n${details}`;
  }

  try {
    return await notifyOwner({ title, content });
  } catch (error) {
    console.error("[QuotationNotification] Failed to send milestone notification:", error);
    return false;
  }
}
