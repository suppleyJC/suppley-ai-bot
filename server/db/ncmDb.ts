import { eq } from "drizzle-orm";
import { ncmTaxRates, InsertNcmTaxRate, NcmTaxRate } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getNcmTaxRate(ncmCode: string): Promise<NcmTaxRate | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(ncmTaxRates).where(eq(ncmTaxRates.ncmCode, ncmCode)).limit(1);
  return result[0] || null;
}

export async function upsertNcmTaxRate(data: InsertNcmTaxRate): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(ncmTaxRates).values(data).onDuplicateKeyUpdate({
    set: {
      description: data.description,
      iiRate: data.iiRate,
      ipiRate: data.ipiRate,
      pisRate: data.pisRate,
      cofinsRate: data.cofinsRate,
      mercosulIiRate: data.mercosulIiRate,
      notes: data.notes,
    }
  });
}

export async function getAllNcmTaxRates(): Promise<NcmTaxRate[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(ncmTaxRates).orderBy(ncmTaxRates.ncmCode);
}
