/**
 * Price Comparison Service - Comparação de preços entre fornecedores
 * Identifica automaticamente o preço mais competitivo por produto
 */

import { getDb } from "../db";
import { supplierPrices, productBestPrices, suppliers } from "../../drizzle/schema";
import { eq, and, desc, gte } from "drizzle-orm";

/**
 * Normaliza o nome do produto para comparação
 * Remove acentos, converte para minúsculas, remove caracteres especiais
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9\s]/g, " ") // Remove caracteres especiais
    .replace(/\s+/g, " ") // Remove espaços múltiplos
    .trim();
}

/**
 * Registra um preço de fornecedor
 */
export async function registerSupplierPrice(data: {
  userId: number;
  supplierId: number;
  quotationId?: number;
  calculationId?: number;
  productName: string;
  ncmCode?: string;
  sku?: string;
  unitPriceCents: number;
  currency: string;
  unit: string;
  unitPriceBrlCents: number;
  exchangeRate: number;
  quantity?: number;
  incoterm?: string;
  quotationDate?: Date;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const productNameNormalized = normalizeProductName(data.productName);
  
  const result = await db.insert(supplierPrices).values({
    userId: data.userId,
    supplierId: data.supplierId,
    quotationId: data.quotationId,
    calculationId: data.calculationId,
    productName: data.productName,
    productNameNormalized,
    ncmCode: data.ncmCode,
    sku: data.sku,
    unitPriceCents: data.unitPriceCents,
    currency: data.currency,
    unit: data.unit,
    unitPriceBrlCents: data.unitPriceBrlCents,
    exchangeRate: data.exchangeRate,
    quantity: data.quantity || 1,
    incoterm: data.incoterm,
    quotationDate: data.quotationDate || new Date(),
  });
  
  const priceId = Number(result[0].insertId);
  
  // Atualizar melhor preço
  await updateBestPrice(data.userId, productNameNormalized, data.ncmCode);
  
  return priceId;
}

/**
 * Atualiza o melhor preço para um produto
 */
export async function updateBestPrice(
  userId: number,
  productNameNormalized: string,
  ncmCode?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Buscar todos os preços ativos para este produto (últimos 90 dias)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const prices = await db
    .select({
      supplierId: supplierPrices.supplierId,
      unitPriceBrlCents: supplierPrices.unitPriceBrlCents,
      quotationId: supplierPrices.quotationId,
      quotationDate: supplierPrices.quotationDate,
    })
    .from(supplierPrices)
    .where(
      and(
        eq(supplierPrices.userId, userId),
        eq(supplierPrices.productNameNormalized, productNameNormalized),
        eq(supplierPrices.isActive, true),
        gte(supplierPrices.quotationDate, ninetyDaysAgo)
      )
    )
    .orderBy(supplierPrices.unitPriceBrlCents);
  
  if (prices.length === 0) return;
  
  // Calcular estatísticas
  const allPrices = prices.map(p => Number(p.unitPriceBrlCents));
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const avgPrice = Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length);
  const savingsPercent = maxPrice > 0 ? Math.round(((maxPrice - minPrice) / maxPrice) * 10000) : 0;
  
  // Buscar nome do fornecedor com melhor preço
  const bestPrice = prices[0];
  const supplierResult = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, bestPrice.supplierId))
    .limit(1);
  
  const supplierName = supplierResult[0]?.name || "Fornecedor";
  
  // Contar fornecedores únicos
  const uniqueSuppliers = new Set(prices.map(p => p.supplierId)).size;
  
  // Upsert melhor preço
  await db
    .insert(productBestPrices)
    .values({
      userId,
      productNameNormalized,
      ncmCode,
      bestPriceBrlCents: minPrice,
      bestPriceSupplierId: bestPrice.supplierId,
      bestPriceSupplierName: supplierName,
      bestPriceQuotationId: bestPrice.quotationId,
      bestPriceDate: bestPrice.quotationDate,
      totalSuppliers: uniqueSuppliers,
      avgPriceBrlCents: avgPrice,
      minPriceBrlCents: minPrice,
      maxPriceBrlCents: maxPrice,
      savingsPercent,
    })
    .onDuplicateKeyUpdate({
      set: {
        bestPriceBrlCents: minPrice,
        bestPriceSupplierId: bestPrice.supplierId,
        bestPriceSupplierName: supplierName,
        bestPriceQuotationId: bestPrice.quotationId,
        bestPriceDate: bestPrice.quotationDate,
        totalSuppliers: uniqueSuppliers,
        avgPriceBrlCents: avgPrice,
        minPriceBrlCents: minPrice,
        maxPriceBrlCents: maxPrice,
        savingsPercent,
      },
    });
}

/**
 * Busca o melhor preço para um produto
 */
export async function getBestPriceForProduct(
  userId: number,
  productName: string
): Promise<{
  hasBestPrice: boolean;
  bestPrice?: {
    priceBrlCents: number;
    supplierId: number;
    supplierName: string;
    quotationDate: Date;
    totalSuppliers: number;
    savingsPercent: number;
  };
  alternatives?: Array<{
    supplierId: number;
    supplierName: string;
    priceBrlCents: number;
    quotationDate: Date;
    differencePercent: number;
  }>;
}> {
  const db = await getDb();
  if (!db) return { hasBestPrice: false };
  
  const productNameNormalized = normalizeProductName(productName);
  
  // Buscar melhor preço
  const bestPriceResult = await db
    .select()
    .from(productBestPrices)
    .where(
      and(
        eq(productBestPrices.userId, userId),
        eq(productBestPrices.productNameNormalized, productNameNormalized)
      )
    )
    .limit(1);
  
  if (bestPriceResult.length === 0) {
    return { hasBestPrice: false };
  }
  
  const best = bestPriceResult[0];
  
  // Buscar alternativas (outros fornecedores)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const alternativesResult = await db
    .select({
      supplierId: supplierPrices.supplierId,
      supplierName: suppliers.name,
      priceBrlCents: supplierPrices.unitPriceBrlCents,
      quotationDate: supplierPrices.quotationDate,
    })
    .from(supplierPrices)
    .innerJoin(suppliers, eq(supplierPrices.supplierId, suppliers.id))
    .where(
      and(
        eq(supplierPrices.userId, userId),
        eq(supplierPrices.productNameNormalized, productNameNormalized),
        eq(supplierPrices.isActive, true),
        gte(supplierPrices.quotationDate, ninetyDaysAgo)
      )
    )
    .orderBy(supplierPrices.unitPriceBrlCents)
    .limit(10);
  
  const alternatives = alternativesResult.map(alt => ({
    supplierId: alt.supplierId,
    supplierName: alt.supplierName,
    priceBrlCents: Number(alt.priceBrlCents),
    quotationDate: alt.quotationDate,
    differencePercent: best.bestPriceBrlCents > 0
      ? Math.round(((Number(alt.priceBrlCents) - Number(best.bestPriceBrlCents)) / Number(best.bestPriceBrlCents)) * 10000) / 100
      : 0,
  }));
  
  return {
    hasBestPrice: true,
    bestPrice: {
      priceBrlCents: Number(best.bestPriceBrlCents),
      supplierId: best.bestPriceSupplierId,
      supplierName: best.bestPriceSupplierName,
      quotationDate: best.bestPriceDate,
      totalSuppliers: best.totalSuppliers,
      savingsPercent: (best.savingsPercent || 0) / 100,
    },
    alternatives,
  };
}

/**
 * Busca histórico de preços de um produto
 */
export async function getPriceHistory(
  userId: number,
  productName: string,
  limit: number = 50
): Promise<Array<{
  supplierId: number;
  supplierName: string;
  priceBrlCents: number;
  currency: string;
  originalPriceCents: number;
  quotationDate: Date;
  quotationId?: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  const productNameNormalized = normalizeProductName(productName);
  
  const history = await db
    .select({
      supplierId: supplierPrices.supplierId,
      supplierName: suppliers.name,
      priceBrlCents: supplierPrices.unitPriceBrlCents,
      currency: supplierPrices.currency,
      originalPriceCents: supplierPrices.unitPriceCents,
      quotationDate: supplierPrices.quotationDate,
      quotationId: supplierPrices.quotationId,
    })
    .from(supplierPrices)
    .innerJoin(suppliers, eq(supplierPrices.supplierId, suppliers.id))
    .where(
      and(
        eq(supplierPrices.userId, userId),
        eq(supplierPrices.productNameNormalized, productNameNormalized)
      )
    )
    .orderBy(desc(supplierPrices.quotationDate))
    .limit(limit);
  
  return history.map(h => ({
    supplierId: h.supplierId,
    supplierName: h.supplierName,
    priceBrlCents: Number(h.priceBrlCents),
    currency: h.currency,
    originalPriceCents: Number(h.originalPriceCents),
    quotationDate: h.quotationDate,
    quotationId: h.quotationId || undefined,
  }));
}

/**
 * Busca todos os melhores preços do usuário
 */
export async function getAllBestPrices(userId: number): Promise<Array<{
  productName: string;
  ncmCode?: string;
  bestPriceBrlCents: number;
  supplierName: string;
  totalSuppliers: number;
  savingsPercent: number;
  lastUpdate: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select()
    .from(productBestPrices)
    .where(eq(productBestPrices.userId, userId))
    .orderBy(productBestPrices.productNameNormalized);
  
  return results.map(r => ({
    productName: r.productNameNormalized,
    ncmCode: r.ncmCode || undefined,
    bestPriceBrlCents: Number(r.bestPriceBrlCents),
    supplierName: r.bestPriceSupplierName,
    totalSuppliers: r.totalSuppliers,
    savingsPercent: (r.savingsPercent || 0) / 100,
    lastUpdate: r.updatedAt,
  }));
}

/**
 * Compara preços de um produto entre todos os fornecedores
 */
export async function compareProductPrices(
  userId: number,
  productName: string
): Promise<{
  productName: string;
  productNameNormalized: string;
  suppliers: Array<{
    supplierId: number;
    supplierName: string;
    country: string;
    latestPriceBrlCents: number;
    latestPriceOriginal: { cents: number; currency: string };
    quotationDate: Date;
    isBestPrice: boolean;
    differenceFromBest: number;
    rank: number;
  }>;
  statistics: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    priceRange: number;
    totalSuppliers: number;
  };
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const productNameNormalized = normalizeProductName(productName);
  
  // Buscar preços mais recentes de cada fornecedor
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  // Subquery para pegar o preço mais recente de cada fornecedor
  const latestPrices = await db
    .select({
      supplierId: supplierPrices.supplierId,
      supplierName: suppliers.name,
      country: suppliers.country,
      priceBrlCents: supplierPrices.unitPriceBrlCents,
      priceOriginalCents: supplierPrices.unitPriceCents,
      currency: supplierPrices.currency,
      quotationDate: supplierPrices.quotationDate,
    })
    .from(supplierPrices)
    .innerJoin(suppliers, eq(supplierPrices.supplierId, suppliers.id))
    .where(
      and(
        eq(supplierPrices.userId, userId),
        eq(supplierPrices.productNameNormalized, productNameNormalized),
        eq(supplierPrices.isActive, true),
        gte(supplierPrices.quotationDate, ninetyDaysAgo)
      )
    )
    .orderBy(desc(supplierPrices.quotationDate));
  
  // Agrupar por fornecedor (pegar apenas o mais recente de cada)
  const supplierMap = new Map<number, typeof latestPrices[0]>();
  latestPrices.forEach(p => {
    if (!supplierMap.has(p.supplierId)) {
      supplierMap.set(p.supplierId, p);
    }
  });
  
  const uniqueSuppliers = Array.from(supplierMap.values());
  
  if (uniqueSuppliers.length === 0) {
    return {
      productName,
      productNameNormalized,
      suppliers: [],
      statistics: {
        minPrice: 0,
        maxPrice: 0,
        avgPrice: 0,
        priceRange: 0,
        totalSuppliers: 0,
      },
    };
  }
  
  // Ordenar por preço
  uniqueSuppliers.sort((a, b) => Number(a.priceBrlCents) - Number(b.priceBrlCents));
  
  const minPrice = Number(uniqueSuppliers[0].priceBrlCents);
  const maxPrice = Number(uniqueSuppliers[uniqueSuppliers.length - 1].priceBrlCents);
  const avgPrice = Math.round(
    uniqueSuppliers.reduce((sum, s) => sum + Number(s.priceBrlCents), 0) / uniqueSuppliers.length
  );
  
  return {
    productName,
    productNameNormalized,
    suppliers: uniqueSuppliers.map((s, index) => ({
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      country: s.country,
      latestPriceBrlCents: Number(s.priceBrlCents),
      latestPriceOriginal: {
        cents: Number(s.priceOriginalCents),
        currency: s.currency,
      },
      quotationDate: s.quotationDate,
      isBestPrice: index === 0,
      differenceFromBest: minPrice > 0
        ? Math.round(((Number(s.priceBrlCents) - minPrice) / minPrice) * 10000) / 100
        : 0,
      rank: index + 1,
    })),
    statistics: {
      minPrice,
      maxPrice,
      avgPrice,
      priceRange: maxPrice - minPrice,
      totalSuppliers: uniqueSuppliers.length,
    },
  };
}
