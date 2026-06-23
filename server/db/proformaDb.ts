import { eq, desc, and } from "drizzle-orm";
import {
  proformas, InsertProforma, Proforma,
  proformaItems, InsertProformaItem, ProformaItem,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================================
// PROFORMAS - CRUD
// ============================================================

export async function createProforma(data: InsertProforma): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(proformas).values(data);
  return Number(result.insertId);
}

export async function updateProforma(
  id: number,
  userId: number,
  data: Partial<InsertProforma>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(proformas).set(data).where(and(eq(proformas.id, id), eq(proformas.userId, userId)));
  return true;
}

export async function getProformasByUser(
  userId: number,
  filters?: { status?: string; industriaId?: number }
): Promise<Proforma[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(proformas.userId, userId)];
  if (filters?.status) conditions.push(eq(proformas.status, filters.status as any));
  if (filters?.industriaId) conditions.push(eq(proformas.industriaId, filters.industriaId));
  return db.select().from(proformas).where(and(...conditions)).orderBy(desc(proformas.createdAt));
}

export async function getProformaById(id: number, userId: number): Promise<Proforma | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(proformas).where(and(eq(proformas.id, id), eq(proformas.userId, userId)));
  return row || null;
}

export async function deleteProforma(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(proformas).where(and(eq(proformas.id, id), eq(proformas.userId, userId)));
  await db.delete(proformaItems).where(eq(proformaItems.proformaId, id));
  return true;
}

// ============================================================
// PROFORMA ITEMS - CRUD
// ============================================================

export async function createProformaItem(data: InsertProformaItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(proformaItems).values(data);
  return Number(result.insertId);
}

export async function getProformaItems(proformaId: number): Promise<ProformaItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proformaItems).where(eq(proformaItems.proformaId, proformaId));
}

export async function updateProformaItem(
  id: number,
  data: Partial<InsertProformaItem>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(proformaItems).set(data).where(eq(proformaItems.id, id));
  return true;
}

/** Conta proformas do usuário para gerar número sequencial (PF-AAAA-0001). */
export async function countProformasByUser(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: proformas.id }).from(proformas).where(eq(proformas.userId, userId));
  return rows.length;
}
