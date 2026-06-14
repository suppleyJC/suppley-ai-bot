import { eq, desc, and, sql } from "drizzle-orm";
import { importCalculations, InsertImportCalculation, ImportCalculation } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createImportCalculation(data: InsertImportCalculation): Promise<ImportCalculation | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(importCalculations).values(data);
  const inserted = await db.select().from(importCalculations).where(eq(importCalculations.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

export async function getCalculationsByUser(userId: number, limit = 50): Promise<ImportCalculation[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(importCalculations)
    .where(eq(importCalculations.userId, userId))
    .orderBy(desc(importCalculations.createdAt))
    .limit(limit);
}

export async function getCalculationById(id: number, userId: number): Promise<ImportCalculation | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(importCalculations)
    .where(and(eq(importCalculations.id, id), eq(importCalculations.userId, userId)))
    .limit(1);
  return result[0] || null;
}

export async function updateCalculation(id: number, userId: number, data: Partial<InsertImportCalculation>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(importCalculations).set(data).where(and(eq(importCalculations.id, id), eq(importCalculations.userId, userId)));
  return true;
}

export async function deleteCalculation(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(importCalculations).where(and(eq(importCalculations.id, id), eq(importCalculations.userId, userId)));
  return true;
}

export async function getCalculationStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalCalculations: 0, totalValueBrl: 0, avgViability: 0 };
  
  const result = await db.select({
    totalCalculations: sql<number>`COUNT(*)`,
    totalValueBrl: sql<number>`COALESCE(SUM(${importCalculations.totalCostCents}), 0)`,
    avgViability: sql<number>`COALESCE(AVG(${importCalculations.viabilityScore}), 0)`,
  }).from(importCalculations).where(eq(importCalculations.userId, userId));
  
  return result[0] || { totalCalculations: 0, totalValueBrl: 0, avgViability: 0 };
}
