/**
 * Proforma Price History Service — métricas cronológicas de preço.
 *
 * Deriva o histórico diretamente das proformas/itens (fonte de verdade que o
 * usuário alimenta), em vez de tabelas paralelas. Permite:
 *   • Evolução de preço de um produto ao longo do tempo (todos os fornecedores)
 *   • Reajustes de um fornecedor ao longo do tempo (catálogo + séries por produto)
 *   • Estimativa de quanto cada cotação custaria "posta no Brasil há época"
 *     (custo nacionalizado), usando câmbio histórico e o motor de cálculo certificado.
 */
import * as db from "../db";
import { getExchangeRateAtDate } from "../db/exchangeDb";
import { normalizeProductName } from "./priceComparisonService";
import { calculateEstimativa } from "./estimativaService";
import type { ProformaItemWithContext } from "../db/proformaDb";
import type { RegimeTributario } from "./importCostEngine";

// ============================================================
// Tipos de saída
// ============================================================

export interface PricePoint {
  proformaId: number;
  numero: string | null;
  quotationDate: Date;
  supplierId: number | null;
  supplierName: string | null;
  supplierCountry: string | null;
  currency: string;
  incoterm: string | null;
  ncmCode: string | null;
  unit: string;
  quantity: number;
  /** Preço unitário FOB/EXW na moeda da cotação (centavos). */
  unitPriceCents: number;
  /** Preço unitário convertido para BRL com câmbio da época (centavos), se houver câmbio. */
  unitPriceBrlCents: number | null;
  /** Custo unitário estimado posto no Brasil (nacionalizado) em centavos de BRL, se calculável. */
  nationalizedUnitCostBrlCents: number | null;
  /** Quanto a mais o custo nacionalizado representa sobre o FOB em BRL (%). */
  nationalizedMarkupPercent: number | null;
}

export interface ProductPriceHistory {
  productName: string;
  productNameNormalized: string;
  points: PricePoint[];
  statistics: {
    quoteCount: number;
    supplierCount: number;
    firstQuote: PricePoint | null;
    lastQuote: PricePoint | null;
    /** Variação % do primeiro ao último preço (na moeda original). */
    priceChangePercent: number | null;
    minUnitPriceCents: number | null;
    maxUnitPriceCents: number | null;
  };
}

export interface SupplierCatalogProduct {
  productName: string;
  productNameNormalized: string;
  ncmCode: string | null;
  currency: string;
  unit: string;
  quoteCount: number;
  firstQuoteDate: Date;
  lastQuoteDate: Date;
  firstUnitPriceCents: number;
  lastUnitPriceCents: number;
  /** Reajuste % do primeiro ao último preço deste produto com este fornecedor. */
  priceChangePercent: number | null;
  points: PricePoint[];
}

export interface SupplierCatalog {
  industriaId: number;
  productCount: number;
  totalQuotes: number;
  products: SupplierCatalogProduct[];
}

// ============================================================
// Helpers
// ============================================================

/** Chave de cache de câmbio por moeda + dia. */
function rateKey(currency: string, date: Date): string {
  return `${currency}:${date.toISOString().slice(0, 10)}`;
}

/**
 * Calcula, para um item, o preço em BRL (câmbio da época) e o custo nacionalizado
 * estimado. Best-effort: se faltar câmbio ou NCM, retorna o que for possível.
 */
async function enrichPoint(
  userId: number,
  item: ProformaItemWithContext,
  regime: RegimeTributario,
  rateCache: Map<string, number | null>
): Promise<PricePoint> {
  const point: PricePoint = {
    proformaId: item.proformaId,
    numero: item.numero,
    quotationDate: item.quotationDate,
    supplierId: item.industriaId,
    supplierName: item.supplierName,
    supplierCountry: item.supplierCountry,
    currency: item.currency,
    incoterm: item.incoterm,
    ncmCode: item.ncmCode,
    unit: item.unit,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    unitPriceBrlCents: null,
    nationalizedUnitCostBrlCents: null,
    nationalizedMarkupPercent: null,
  };

  // Câmbio da época (cacheado por moeda+dia)
  let rate: number | null;
  if (item.currency === "BRL") {
    rate = 1;
  } else {
    const key = rateKey(item.currency, item.quotationDate);
    if (rateCache.has(key)) {
      rate = rateCache.get(key)!;
    } else {
      rate = await getExchangeRateAtDate(item.currency, "BRL", item.quotationDate);
      rateCache.set(key, rate);
    }
  }

  if (rate != null) {
    point.unitPriceBrlCents = Math.round(item.unitPriceCents * rate);

    // Custo nacionalizado: só estima com NCM e câmbio disponíveis.
    if (item.ncmCode && item.ncmCode.trim() !== "" && item.ncmCode !== "00000000") {
      try {
        const result = await calculateEstimativa({
          products: [
            {
              productName: item.productName,
              ncmCode: item.ncmCode,
              quantity: item.quantity || 1,
              unit: item.unit,
              unitPrice: item.unitPriceCents / 100, // FOB unitário na moeda (decimal)
            },
          ],
          exchangeRate: rate,
          currency: item.currency,
          taxRegime: regime,
        });
        const r = result.items[0];
        if (r) {
          const natCents = Math.round(r.netUnitCost * 100);
          point.nationalizedUnitCostBrlCents = natCents;
          const fobBrlCents = point.unitPriceBrlCents;
          if (fobBrlCents && fobBrlCents > 0) {
            point.nationalizedMarkupPercent =
              Math.round(((natCents - fobBrlCents) / fobBrlCents) * 10000) / 100;
          }
        }
      } catch {
        /* estimativa best-effort; segue sem custo nacionalizado */
      }
    }
  }

  return point;
}

async function resolveRegime(userId: number): Promise<RegimeTributario> {
  try {
    const settings = await db.getCompanySettings(userId);
    return (settings?.taxRegime as RegimeTributario) || "lucro_real";
  } catch {
    return "lucro_real";
  }
}

// ============================================================
// 1) Histórico de preço de um produto (todos os fornecedores)
// ============================================================

export async function getProductPriceHistory(
  userId: number,
  productName: string
): Promise<ProductPriceHistory> {
  const normalized = normalizeProductName(productName);
  const allItems = await db.getProformaItemsWithContext(userId);
  const items = allItems.filter(
    (it) => normalizeProductName(it.productName) === normalized
  );

  const regime = await resolveRegime(userId);
  const rateCache = new Map<string, number | null>();

  const points: PricePoint[] = [];
  for (const item of items) {
    points.push(await enrichPoint(userId, item, regime, rateCache));
  }
  // Já vêm cronológicos do DB, mas garantimos.
  points.sort((a, b) => a.quotationDate.getTime() - b.quotationDate.getTime());

  const supplierIds = new Set(
    points.map((p) => p.supplierId ?? p.supplierName ?? "").filter(Boolean)
  );
  const prices = points.map((p) => p.unitPriceCents);
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;
  const priceChangePercent =
    first && last && first.unitPriceCents > 0
      ? Math.round(((last.unitPriceCents - first.unitPriceCents) / first.unitPriceCents) * 10000) / 100
      : null;

  return {
    productName,
    productNameNormalized: normalized,
    points,
    statistics: {
      quoteCount: points.length,
      supplierCount: supplierIds.size,
      firstQuote: first,
      lastQuote: last,
      priceChangePercent,
      minUnitPriceCents: prices.length ? Math.min(...prices) : null,
      maxUnitPriceCents: prices.length ? Math.max(...prices) : null,
    },
  };
}

// ============================================================
// 2) Catálogo do fornecedor (produtos + reajustes ao longo do tempo)
// ============================================================

export async function getSupplierCatalog(
  userId: number,
  industriaId: number
): Promise<SupplierCatalog> {
  const items = await db.getProformaItemsWithContext(userId, { industriaId });
  const regime = await resolveRegime(userId);
  const rateCache = new Map<string, number | null>();

  // Agrupa por produto normalizado (ramificação do catálogo).
  const groups = new Map<string, ProformaItemWithContext[]>();
  for (const item of items) {
    const key = normalizeProductName(item.productName);
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }

  const products: SupplierCatalogProduct[] = [];
  let totalQuotes = 0;

  for (const [normalized, groupItems] of Array.from(groups.entries())) {
    groupItems.sort((a, b) => a.quotationDate.getTime() - b.quotationDate.getTime());

    const points: PricePoint[] = [];
    for (const item of groupItems) {
      points.push(await enrichPoint(userId, item, regime, rateCache));
    }

    const firstItem = groupItems[0];
    const lastItem = groupItems[groupItems.length - 1];
    const priceChangePercent =
      firstItem.unitPriceCents > 0
        ? Math.round(
            ((lastItem.unitPriceCents - firstItem.unitPriceCents) / firstItem.unitPriceCents) * 10000
          ) / 100
        : null;

    totalQuotes += groupItems.length;

    products.push({
      productName: lastItem.productName, // nome mais recente
      productNameNormalized: normalized,
      ncmCode: lastItem.ncmCode,
      currency: lastItem.currency,
      unit: lastItem.unit,
      quoteCount: groupItems.length,
      firstQuoteDate: firstItem.quotationDate,
      lastQuoteDate: lastItem.quotationDate,
      firstUnitPriceCents: firstItem.unitPriceCents,
      lastUnitPriceCents: lastItem.unitPriceCents,
      priceChangePercent,
      points,
    });
  }

  // Ordena produtos pelo mais recentemente cotado.
  products.sort((a, b) => b.lastQuoteDate.getTime() - a.lastQuoteDate.getTime());

  return {
    industriaId,
    productCount: products.length,
    totalQuotes,
    products,
  };
}
