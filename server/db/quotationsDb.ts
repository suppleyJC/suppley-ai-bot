import { eq, desc, and, sql } from "drizzle-orm";
import { quotations, InsertQuotation, Quotation, importCalculations, ImportCalculation } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createQuotation(data: InsertQuotation): Promise<Quotation | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(quotations).values(data);
  const inserted = await db.select().from(quotations).where(eq(quotations.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

export async function getQuotationsByUser(userId: number, limit = 50): Promise<Quotation[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(quotations)
    .where(eq(quotations.userId, userId))
    .orderBy(desc(quotations.createdAt))
    .limit(limit);
}

export async function getQuotationById(id: number, userId: number): Promise<Quotation | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.userId, userId)))
    .limit(1);
  return result[0] || null;
}

export async function updateQuotation(id: number, userId: number, data: Partial<InsertQuotation>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(quotations).set(data).where(and(eq(quotations.id, id), eq(quotations.userId, userId)));
  return true;
}

export async function deleteQuotation(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  // First delete associated calculations
  await db.delete(importCalculations).where(and(
    eq(importCalculations.quotationId, id),
    eq(importCalculations.userId, userId)
  ));
  
  // Then delete the quotation
  await db.delete(quotations).where(and(eq(quotations.id, id), eq(quotations.userId, userId)));
  return true;
}

export async function getCalculationsByQuotation(quotationId: number, userId: number): Promise<ImportCalculation[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(importCalculations)
    .where(and(
      eq(importCalculations.quotationId, quotationId),
      eq(importCalculations.userId, userId)
    ))
    .orderBy(importCalculations.productName);
}

export async function getQuotationStats(userId: number) {
  const db = await getDb();
  if (!db) return { 
    totalQuotations: 0, 
    viableCount: 0, 
    inProgressCount: 0, 
    completedCount: 0,
    totalValueBrl: 0 
  };
  
  const result = await db.select({
    totalQuotations: sql<number>`COUNT(*)`,
    viableCount: sql<number>`SUM(CASE WHEN status IN ('viable', 'approved', 'ordered', 'shipped', 'customs', 'nationalized', 'completed') THEN 1 ELSE 0 END)`,
    inProgressCount: sql<number>`SUM(CASE WHEN status IN ('ordered', 'shipped', 'customs') THEN 1 ELSE 0 END)`,
    completedCount: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    totalValueBrl: sql<number>`COALESCE(SUM(${quotations.totalCostCents}), 0)`,
  }).from(quotations).where(eq(quotations.userId, userId));
  
  return result[0] || { totalQuotations: 0, viableCount: 0, inProgressCount: 0, completedCount: 0, totalValueBrl: 0 };
}

export async function getQuotationsByStatus(userId: number, status: string): Promise<Quotation[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(quotations)
    .where(and(eq(quotations.userId, userId), eq(quotations.status, status as any)))
    .orderBy(desc(quotations.createdAt));
}
