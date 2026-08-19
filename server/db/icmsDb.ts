import { eq } from "drizzle-orm";
import { icmsRates, InsertIcmsRate, IcmsRate } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getIcmsRate(stateCode: string): Promise<IcmsRate | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(icmsRates).where(eq(icmsRates.stateCode, stateCode)).limit(1);
  return result[0] || null;
}

export async function getAllIcmsRates(): Promise<IcmsRate[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(icmsRates).orderBy(icmsRates.stateCode);
}

export async function upsertIcmsRate(data: InsertIcmsRate): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(icmsRates).values(data).onDuplicateKeyUpdate({
    set: {
      stateName: data.stateName,
      internalRate: data.internalRate,
      importRate: data.importRate,
      interstateRate: data.interstateRate,
      hasIncentive: data.hasIncentive,
      incentiveDescription: data.incentiveDescription,
    }
  });
}
