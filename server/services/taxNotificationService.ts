/**
 * Tax Notification Service
 * Serviço para notificação de mudanças tributárias
 */

import { getDb } from "../db";
import { taxChangeNotifications } from "../../drizzle/schema";
import { eq, and, sql, isNull, or } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

// Interfaces
export interface TaxChangeAlert {
  changeType: "ncm_rate" | "state_rate" | "benefit_new" | "benefit_expired" | "agreement" | "regulatory";
  title: string;
  description: string;
  ncmCode?: string;
  stateCode?: string;
  impactLevel: "low" | "medium" | "high" | "critical";
  effectiveDate?: Date;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Cria notificação de mudança tributária
 */
export async function createTaxNotification(
  alert: TaxChangeAlert,
  userId?: number // null = notificação global para todos
): Promise<{ success: boolean; id?: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const result = await db.insert(taxChangeNotifications).values({
      userId: userId || null,
      changeType: alert.changeType,
      title: alert.title,
      description: alert.description,
      ncmCode: alert.ncmCode,
      stateCode: alert.stateCode,
      impactLevel: alert.impactLevel,
      effectiveDate: alert.effectiveDate,
      isRead: false,
    });

    // Se for crítico ou alto, notificar o owner também
    if (alert.impactLevel === "critical" || alert.impactLevel === "high") {
      await notifyOwner({
        title: `[${alert.impactLevel.toUpperCase()}] ${alert.title}`,
        content: alert.description,
      });
    }

    return { success: true, id: result[0].insertId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Cria notificação global para todos os usuários
 */
export async function createGlobalNotification(alert: TaxChangeAlert): Promise<{ success: boolean; error?: string }> {
  return createTaxNotification(alert, undefined);
}

/**
 * Lista notificações do usuário
 */
export async function listUserNotifications(
  userId: number,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
  }
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Build conditions
    const conditions = [
      or(
        eq(taxChangeNotifications.userId, userId),
        isNull(taxChangeNotifications.userId) // Notificações globais
      )
    ];

    if (options?.unreadOnly) {
      conditions.push(eq(taxChangeNotifications.isRead, false));
    }

    const notifications = await db
      .select()
      .from(taxChangeNotifications)
      .where(and(...conditions))
      .orderBy(sql`${taxChangeNotifications.createdAt} DESC`)
      .limit(options?.limit || 100);
    return notifications;
  } catch (error) {
    console.error("Error listing notifications:", error);
    return [];
  }
}

/**
 * Marca notificação como lida
 */
export async function markNotificationAsRead(
  notificationId: number,
  userId: number
): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };

  try {
    await db
      .update(taxChangeNotifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(taxChangeNotifications.id, notificationId),
          or(
            eq(taxChangeNotifications.userId, userId),
            isNull(taxChangeNotifications.userId)
          )
        )
      );

    return { success: true };
  } catch (error) {
    return { success: false };
  }
}

/**
 * Marca todas as notificações como lidas
 */
export async function markAllNotificationsAsRead(userId: number): Promise<{ success: boolean; count: number }> {
  const db = await getDb();
  if (!db) return { success: false, count: 0 };

  try {
    const result = await db
      .update(taxChangeNotifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(taxChangeNotifications.isRead, false),
          or(
            eq(taxChangeNotifications.userId, userId),
            isNull(taxChangeNotifications.userId)
          )
        )
      );

    return { success: true, count: result[0].affectedRows || 0 };
  } catch (error) {
    return { success: false, count: 0 };
  }
}

/**
 * Obtém resumo de notificações
 */
export async function getNotificationSummary(userId: number): Promise<NotificationSummary> {
  const db = await getDb();
  if (!db) {
    return { total: 0, unread: 0, critical: 0, high: 0, medium: 0, low: 0 };
  }

  try {
    const notifications = await db
      .select()
      .from(taxChangeNotifications)
      .where(
        or(
          eq(taxChangeNotifications.userId, userId),
          isNull(taxChangeNotifications.userId)
        )
      );

    const summary: NotificationSummary = {
      total: notifications.length,
      unread: notifications.filter(n => !n.isRead).length,
      critical: notifications.filter(n => n.impactLevel === "critical" && !n.isRead).length,
      high: notifications.filter(n => n.impactLevel === "high" && !n.isRead).length,
      medium: notifications.filter(n => n.impactLevel === "medium" && !n.isRead).length,
      low: notifications.filter(n => n.impactLevel === "low" && !n.isRead).length,
    };

    return summary;
  } catch (error) {
    return { total: 0, unread: 0, critical: 0, high: 0, medium: 0, low: 0 };
  }
}

/**
 * Verifica mudanças de alíquotas e cria notificações automaticamente
 */
export async function checkAndNotifyRateChanges(changes: {
  ncmCode: string;
  field: string;
  oldValue: number;
  newValue: number;
  source: string;
}[]): Promise<void> {
  for (const change of changes) {
    const percentChange = ((change.newValue - change.oldValue) / change.oldValue) * 100;
    const isIncrease = change.newValue > change.oldValue;
    
    // Determinar nível de impacto baseado na variação
    let impactLevel: "low" | "medium" | "high" | "critical" = "low";
    if (Math.abs(percentChange) > 50) {
      impactLevel = "critical";
    } else if (Math.abs(percentChange) > 25) {
      impactLevel = "high";
    } else if (Math.abs(percentChange) > 10) {
      impactLevel = "medium";
    }

    const alert: TaxChangeAlert = {
      changeType: "ncm_rate",
      title: `Alteração de ${change.field} para NCM ${change.ncmCode}`,
      description: `A alíquota de ${change.field} para o NCM ${change.ncmCode} foi ${isIncrease ? "aumentada" : "reduzida"} de ${(change.oldValue / 100).toFixed(2)}% para ${(change.newValue / 100).toFixed(2)}% (variação de ${percentChange.toFixed(1)}%). Fonte: ${change.source}`,
      ncmCode: change.ncmCode,
      impactLevel,
      effectiveDate: new Date(),
    };

    await createGlobalNotification(alert);
  }
}

/**
 * Cria notificação de novo benefício fiscal
 */
export async function notifyNewBenefit(benefit: {
  name: string;
  code: string;
  stateCode?: string;
  description: string;
  startDate?: Date;
}): Promise<void> {
  const alert: TaxChangeAlert = {
    changeType: "benefit_new",
    title: `Novo benefício fiscal: ${benefit.name}`,
    description: benefit.description,
    stateCode: benefit.stateCode,
    impactLevel: "high",
    effectiveDate: benefit.startDate,
  };

  await createGlobalNotification(alert);
}

/**
 * Cria notificação de benefício expirado
 */
export async function notifyExpiredBenefit(benefit: {
  name: string;
  code: string;
  stateCode?: string;
  endDate: Date;
}): Promise<void> {
  const alert: TaxChangeAlert = {
    changeType: "benefit_expired",
    title: `Benefício fiscal expirado: ${benefit.name}`,
    description: `O benefício fiscal ${benefit.name} (${benefit.code}) expirou em ${benefit.endDate.toLocaleDateString("pt-BR")}. Verifique se há renovação ou substituto disponível.`,
    stateCode: benefit.stateCode,
    impactLevel: "high",
    effectiveDate: benefit.endDate,
  };

  await createGlobalNotification(alert);
}

/**
 * Cria notificação de mudança regulatória
 */
export async function notifyRegulatoryChange(change: {
  title: string;
  description: string;
  effectiveDate?: Date;
  impactLevel?: "low" | "medium" | "high" | "critical";
}): Promise<void> {
  const alert: TaxChangeAlert = {
    changeType: "regulatory",
    title: change.title,
    description: change.description,
    impactLevel: change.impactLevel || "medium",
    effectiveDate: change.effectiveDate,
  };

  await createGlobalNotification(alert);
}

/**
 * Agenda verificação periódica de mudanças (para ser chamado por cron job)
 */
export async function scheduledTaxCheck(): Promise<{
  checked: boolean;
  changesFound: number;
  notificationsCreated: number;
}> {
  // Esta função seria chamada periodicamente para verificar mudanças
  // Por enquanto, retorna um placeholder
  return {
    checked: true,
    changesFound: 0,
    notificationsCreated: 0,
  };
}
