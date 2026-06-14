import { eq, desc, and } from "drizzle-orm";
import { exchangeRates, InsertExchangeRate, ExchangeRate } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getLatestExchangeRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(exchangeRates)
    .where(and(eq(exchangeRates.fromCurrency, fromCurrency), eq(exchangeRates.toCurrency, toCurrency)))
    .orderBy(desc(exchangeRates.fetchedAt))
    .limit(1);
  return result[0] || null;
}

export async function saveExchangeRate(data: InsertExchangeRate): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(exchangeRates).values(data);
}
