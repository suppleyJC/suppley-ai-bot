import { eq, desc, and, lte } from "drizzle-orm";
import { exchangeRates, exchangeRateHistory, InsertExchangeRate, ExchangeRate } from "../../drizzle/schema";
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

/**
 * Taxa de câmbio vigente em uma data (a mais recente registrada até a data alvo).
 * Usa o histórico (exchange_rate_history); se não houver registro até a data,
 * cai para a taxa atual. Retorna a taxa como número decimal (ex.: 5.80) ou null.
 *
 * Útil para reconstruir o custo "posto no Brasil há época" de cotações antigas.
 */
export async function getExchangeRateAtDate(
  fromCurrency: string,
  toCurrency: string,
  date: Date
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // 1) Histórico: registro mais recente ATÉ a data alvo
  const historic = await db
    .select({ rate: exchangeRateHistory.rate })
    .from(exchangeRateHistory)
    .where(
      and(
        eq(exchangeRateHistory.fromCurrency, fromCurrency),
        eq(exchangeRateHistory.toCurrency, toCurrency),
        lte(exchangeRateHistory.recordedAt, date)
      )
    )
    .orderBy(desc(exchangeRateHistory.recordedAt))
    .limit(1);

  if (historic[0]?.rate) {
    return Number(historic[0].rate) / 1_000_000; // armazenado como rate * 1.000.000
  }

  // 2) Fallback: taxa atual
  const latest = await getLatestExchangeRate(fromCurrency, toCurrency);
  if (latest?.rate) {
    return Number(latest.rate) / 1_000_000;
  }

  return null;
}

export async function saveExchangeRate(data: InsertExchangeRate): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(exchangeRates).values(data);
}
