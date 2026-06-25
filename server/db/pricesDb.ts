import { eq, and, desc } from "drizzle-orm";
import { supplierPrices, InsertSupplierPrice, SupplierPrice } from "../../drizzle/schema";
import { getDb } from "./connection";

/**
 * Cria um registro de preço de fornecedor (histórico).
 * Permite rastrear evolução de preços por produto/fornecedor ao longo do tempo.
 */
export async function createSupplierPrice(data: InsertSupplierPrice): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(supplierPrices).values(data);
  return Number(result.insertId);
}

/**
 * Obtém histórico de preços de um produto específico (de todos os fornecedores),
 * ordenado cronologicamente pela data da cotação (mais recente primeiro).
 */
export async function getPriceHistoryByProduct(
  userId: number,
  productNameNormalized: string,
  ncmCode?: string
): Promise<SupplierPrice[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(supplierPrices.userId, userId),
    eq(supplierPrices.productNameNormalized, productNameNormalized),
    eq(supplierPrices.isActive, true),
  ];

  if (ncmCode) {
    conditions.push(eq(supplierPrices.ncmCode, ncmCode));
  }

  return db
    .select()
    .from(supplierPrices)
    .where(and(...conditions))
    .orderBy(desc(supplierPrices.quotationDate));
}

/**
 * Obtém histórico de preços de um fornecedor específico (todos os produtos),
 * ordenado cronologicamente (mais recente primeiro).
 */
export async function getPriceHistoryBySupplier(
  userId: number,
  supplierId: number
): Promise<SupplierPrice[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(supplierPrices)
    .where(
      and(
        eq(supplierPrices.userId, userId),
        eq(supplierPrices.supplierId, supplierId),
        eq(supplierPrices.isActive, true)
      )
    )
    .orderBy(desc(supplierPrices.quotationDate));
}

/**
 * Obtém o melhor preço (mais baixo) de um produto em um período.
 * Útil para métricas de economia/competitividade.
 */
export async function getLowestPriceForProduct(
  userId: number,
  productNameNormalized: string,
  ncmCode?: string
): Promise<SupplierPrice | null> {
  const db = await getDb();
  if (!db) return null;

  const conditions = [
    eq(supplierPrices.userId, userId),
    eq(supplierPrices.productNameNormalized, productNameNormalized),
    eq(supplierPrices.isActive, true),
  ];

  if (ncmCode) {
    conditions.push(eq(supplierPrices.ncmCode, ncmCode));
  }

  const [result] = await db
    .select()
    .from(supplierPrices)
    .where(and(...conditions))
    .orderBy(supplierPrices.unitPriceBrlCents) // Mais barato
    .limit(1);

  return result || null;
}

/**
 * Obtém estatísticas de preço para um produto:
 * - quantidade de fornecedores
 * - preço médio, mínimo, máximo (em BRL)
 * - variação percentual
 */
export async function getPriceStatisticsForProduct(
  userId: number,
  productNameNormalized: string,
  ncmCode?: string
): Promise<{
  supplierCount: number;
  avgPriceBrlCents: number;
  minPriceBrlCents: number;
  maxPriceBrlCents: number;
  variationPercent: number;
} | null> {
  const prices = await getPriceHistoryByProduct(userId, productNameNormalized, ncmCode);

  if (prices.length === 0) return null;

  const pricesInBrl = prices
    .filter((p) => p.unitPriceBrlCents)
    .map((p) => p.unitPriceBrlCents as number);

  if (pricesInBrl.length === 0) return null;

  const min = Math.min(...pricesInBrl);
  const max = Math.max(...pricesInBrl);
  const avg = Math.round(pricesInBrl.reduce((a, b) => a + b, 0) / pricesInBrl.length);

  const variation = ((max - min) / min) * 100;

  return {
    supplierCount: new Set(prices.map((p) => p.supplierId)).size,
    avgPriceBrlCents: avg,
    minPriceBrlCents: min,
    maxPriceBrlCents: max,
    variationPercent: Math.round(variation * 100) / 100,
  };
}
