import { eq, desc, and, sql } from "drizzle-orm";
import { sofiaChatMessages, InsertSofiaChatMessage, SofiaChatMessage, sofiaLearningContext, InsertSofiaLearningContext, SofiaLearningContext } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function saveChatMessage(message: InsertSofiaChatMessage): Promise<SofiaChatMessage | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(sofiaChatMessages).values(message);
  const insertId = result[0].insertId;
  
  const [saved] = await db.select().from(sofiaChatMessages).where(eq(sofiaChatMessages.id, insertId));
  return saved || null;
}

export async function getChatHistory(userId: number, limit: number = 100, daysToShow: number = 30): Promise<SofiaChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Calculate the date threshold (30 days ago by default)
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysToShow);
  
  return db.select().from(sofiaChatMessages)
    .where(and(
      eq(sofiaChatMessages.userId, userId),
      sql`${sofiaChatMessages.createdAt} >= ${dateThreshold}`
    ))
    .orderBy(desc(sofiaChatMessages.createdAt))
    .limit(limit);
}

// Get ALL chat history for learning purposes (no date filter)
export async function getAllChatHistoryForLearning(userId: number): Promise<SofiaChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sofiaChatMessages)
    .where(eq(sofiaChatMessages.userId, userId))
    .orderBy(sofiaChatMessages.createdAt);
}

export async function getChatHistoryBySession(userId: number, sessionId: string): Promise<SofiaChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sofiaChatMessages)
    .where(and(
      eq(sofiaChatMessages.userId, userId),
      eq(sofiaChatMessages.sessionId, sessionId)
    ))
    .orderBy(sofiaChatMessages.createdAt);
}

export async function clearChatHistory(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(sofiaChatMessages).where(eq(sofiaChatMessages.userId, userId));
  return true;
}

/**
 * Conta as mensagens do histórico legado (chat antigo, sem conversa estruturada).
 * Usado pela sidebar para sinalizar que existe histórico anterior à migração.
 */
export async function countLegacyMessages(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(sofiaChatMessages)
    .where(eq(sofiaChatMessages.userId, userId));
  return Number(row?.total ?? 0);
}

// ==================== LEARNING CONTEXT FUNCTIONS ====================

export async function saveLearningContext(context: InsertSofiaLearningContext): Promise<SofiaLearningContext | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(sofiaLearningContext).values(context);
  const insertId = result[0].insertId;
  
  const [saved] = await db.select().from(sofiaLearningContext).where(eq(sofiaLearningContext.id, insertId));
  return saved || null;
}

export async function getLearningContext(userId: number): Promise<SofiaLearningContext[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sofiaLearningContext)
    .where(eq(sofiaLearningContext.userId, userId))
    .orderBy(desc(sofiaLearningContext.importance));
}

export async function updateLearningContextUsage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.update(sofiaLearningContext)
    .set({ lastUsedAt: new Date() })
    .where(eq(sofiaLearningContext.id, id));
}

export async function deleteLearningContext(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(sofiaLearningContext).where(and(
    eq(sofiaLearningContext.id, id),
    eq(sofiaLearningContext.userId, userId)
  ));
  return true;
}
