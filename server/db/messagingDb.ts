import { eq, desc, and } from "drizzle-orm";
import {
  outboundMessages, InsertOutboundMessage, OutboundMessage,
  inboundMessages, InsertInboundMessage, InboundMessage
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================================
// OUTBOUND MESSAGES - helpers
// ============================================================

export async function getOutboundMessages(userId: number, industryId?: number, rfqId?: number) {
  const db = await getDb();
  if (!db) return [];
  let conditions = [eq(outboundMessages.userId, userId)];
  if (industryId) conditions.push(eq(outboundMessages.industryId, industryId));
  if (rfqId) conditions.push(eq(outboundMessages.rfqId, rfqId as any));
  return db.select().from(outboundMessages).where(and(...conditions)).orderBy(desc(outboundMessages.createdAt));
}

export async function createOutboundMessage(data: InsertOutboundMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(outboundMessages).values(data);
  return { id: result.insertId, ...data };
}

export async function updateOutboundMessageStatus(id: number, status: string, extra?: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(outboundMessages).set({ status: status as any, ...extra }).where(eq(outboundMessages.id, id));
  return true;
}

// ============================================================
// INBOUND MESSAGES - helpers
// ============================================================

export async function getInboundMessages(userId: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  let conditions = [eq(inboundMessages.userId, userId)];
  if (status) conditions.push(eq(inboundMessages.status, status as any));
  return db.select().from(inboundMessages).where(and(...conditions)).orderBy(desc(inboundMessages.receivedAt));
}

export async function createInboundMessage(data: InsertInboundMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(inboundMessages).values(data);
  return { id: result.insertId, ...data };
}

export async function updateInboundMessageStatus(id: number, status: string, extra?: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inboundMessages).set({ status: status as any, ...extra }).where(eq(inboundMessages.id, id));
  return true;
}

export async function getInboundMessageByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const [msg] = await db.select().from(inboundMessages).where(eq(inboundMessages.responseToken, token));
  return msg || null;
}
