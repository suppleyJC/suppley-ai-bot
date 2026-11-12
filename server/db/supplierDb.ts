import { eq, desc, and } from "drizzle-orm";
import { suppliers, InsertSupplier, Supplier } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createSupplier(data: InsertSupplier): Promise<Supplier | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(suppliers).values(data);
  const inserted = await db.select().from(suppliers).where(eq(suppliers.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

export async function getSuppliersByUser(userId: number): Promise<Supplier[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(desc(suppliers.createdAt));
}

export async function getSupplierById(id: number, userId: number): Promise<Supplier | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.userId, userId))).limit(1);
  return result[0] || null;
}

export async function updateSupplier(id: number, userId: number, data: Partial<InsertSupplier>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(suppliers).set(data).where(and(eq(suppliers.id, id), eq(suppliers.userId, userId)));
  return true;
}

export async function deleteSupplier(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.userId, userId)));
  return true;
}
