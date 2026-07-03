import { eq, desc, and, sql } from "drizzle-orm";
import {
  industries, InsertIndustry, Industry,
  industryContacts, InsertIndustryContact, IndustryContact,
  industryProducts, InsertIndustryProduct, IndustryProduct,
  supplierRatings, InsertSupplierRating, SupplierRating
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================================
// INDUSTRIES - CRUD helpers
// ============================================================

export async function getIndustriesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(industries).where(eq(industries.userId, userId)).orderBy(desc(industries.updatedAt));
}

export async function getIndustryById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [industry] = await db.select().from(industries).where(and(eq(industries.id, id), eq(industries.userId, userId)));
  return industry || null;
}

export async function createIndustry(data: InsertIndustry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(industries).values(data);
  return { id: result.insertId, ...data };
}

export async function updateIndustry(id: number, userId: number, data: Partial<InsertIndustry>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(industries).set(data).where(and(eq(industries.id, id), eq(industries.userId, userId)));
  return getIndustryById(id, userId);
}

export async function deleteIndustry(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(industries).where(and(eq(industries.id, id), eq(industries.userId, userId)));
  return true;
}

export async function searchIndustries(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(industries).where(
    and(
      eq(industries.userId, userId),
      sql`(${industries.name} LIKE ${`%${query}%`} OR ${industries.subsector} LIKE ${`%${query}%`} OR ${industries.tags} LIKE ${`%${query}%`} OR ${industries.country} LIKE ${`%${query}%`})`
    )
  ).orderBy(desc(industries.overallRating));
}

export async function getIndustriesBySector(userId: number, sector: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(industries).where(
    and(eq(industries.userId, userId), eq(industries.sector, sector as any))
  ).orderBy(desc(industries.overallRating));
}

export async function getIndustriesByUserAndType(userId: number, tipoEntidade: "fornecedor" | "comprador") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(industries).where(
    and(eq(industries.userId, userId), eq(industries.tipoEntidade, tipoEntidade))
  ).orderBy(desc(industries.updatedAt));
}

export async function searchIndustriesByType(userId: number, tipoEntidade: "fornecedor" | "comprador", query: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(industries).where(
    and(
      eq(industries.userId, userId),
      eq(industries.tipoEntidade, tipoEntidade),
      sql`(${industries.name} LIKE ${`%${query}%`} OR ${industries.country} LIKE ${`%${query}%`} OR ${industries.tags} LIKE ${`%${query}%`})`
    )
  ).orderBy(desc(industries.overallRating));
}

export async function countIndustriesByType(userId: number, tipoEntidade: "fornecedor" | "comprador") {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql`COUNT(*)` }).from(industries).where(
    and(eq(industries.userId, userId), eq(industries.tipoEntidade, tipoEntidade))
  );
  return (result[0]?.count as number) || 0;
}

// ============================================================
// INDUSTRY CONTACTS - CRUD helpers
// ============================================================

export async function getContactsByIndustry(industryId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(industryContacts).where(eq(industryContacts.industryId, industryId));
}

export async function createIndustryContact(data: InsertIndustryContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(industryContacts).values(data);
  return { id: result.insertId, ...data };
}

export async function updateIndustryContact(id: number, data: Partial<InsertIndustryContact>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(industryContacts).set(data).where(eq(industryContacts.id, id));
  return true;
}

export async function deleteIndustryContact(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(industryContacts).where(eq(industryContacts.id, id));
  return true;
}

// ============================================================
// INDUSTRY PRODUCTS - CRUD helpers
// ============================================================

export async function getProductsByIndustry(industryId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(industryProducts).where(
    and(eq(industryProducts.industryId, industryId), eq(industryProducts.userId, userId))
  ).orderBy(desc(industryProducts.updatedAt));
}

export async function getIndustryProductById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [product] = await db.select().from(industryProducts).where(
    and(eq(industryProducts.id, id), eq(industryProducts.userId, userId))
  );
  return product || null;
}

export async function createIndustryProduct(data: InsertIndustryProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(industryProducts).values(data);
  return { id: result.insertId, ...data };
}

export async function updateIndustryProduct(id: number, userId: number, data: Partial<InsertIndustryProduct>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(industryProducts).set(data).where(
    and(eq(industryProducts.id, id), eq(industryProducts.userId, userId))
  );
  return getIndustryProductById(id, userId);
}

export async function deleteIndustryProduct(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(industryProducts).where(
    and(eq(industryProducts.id, id), eq(industryProducts.userId, userId))
  );
  return true;
}

/**
 * Portfólio completo declarado dos fornecedores do usuário (industry_products ×
 * industries). É a base de consulta da Excambia: mesmo sem cotação registrada,
 * ela identifica quais fornecedores TÊM o item no catálogo e direciona demandas.
 */
export async function listIndustryPortfolio(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    product: industryProducts,
    industryId: industries.id,
    industryName: industries.name,
    industryCountry: industries.country,
    industryStatus: industries.status,
  }).from(industryProducts)
    .innerJoin(industries, eq(industryProducts.industryId, industries.id))
    .where(and(eq(industryProducts.userId, userId), eq(industryProducts.isActive, true)));
}

export async function getProductRanking(userId: number, ncmCode?: string, category?: string) {
  const db = await getDb();
  if (!db) return [];
  let conditions = [eq(industryProducts.userId, userId), eq(industryProducts.isActive, true)];
  if (ncmCode) conditions.push(eq(industryProducts.ncmCode, ncmCode));
  if (category) conditions.push(eq(industryProducts.category, category));
  
  const results = await db.select({
    product: industryProducts,
    industryName: industries.name,
    industryCountry: industries.country,
    industryRating: industries.overallRating,
  }).from(industryProducts)
    .innerJoin(industries, eq(industryProducts.industryId, industries.id))
    .where(and(...conditions))
    .orderBy(industryProducts.priceFob);
  
  return results;
}

// ============================================================
// SUPPLIER RATINGS - CRUD helpers
// ============================================================

export async function getRatingsByIndustry(industryId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supplierRatings).where(eq(supplierRatings.industryId, industryId)).orderBy(desc(supplierRatings.createdAt));
}

export async function createSupplierRating(data: InsertSupplierRating) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(supplierRatings).values(data);
  
  // Recalcular rating médio da indústria
  await recalculateIndustryRating(data.industryId);
  
  return { id: result.insertId, ...data };
}

async function recalculateIndustryRating(industryId: number) {
  const db = await getDb();
  if (!db) return;
  
  const ratings = await db.select().from(supplierRatings).where(eq(supplierRatings.industryId, industryId));
  if (ratings.length === 0) return;
  
  const avgPrice = ratings.reduce((sum, r) => sum + r.priceScore, 0) / ratings.length;
  const avgQuality = ratings.reduce((sum, r) => sum + r.qualityScore, 0) / ratings.length;
  const avgDelivery = ratings.reduce((sum, r) => sum + r.deliveryScore, 0) / ratings.length;
  const avgComm = ratings.reduce((sum, r) => sum + r.communicationScore, 0) / ratings.length;
  const overall = (avgPrice + avgQuality + avgDelivery + avgComm) / 4;
  
  await db.update(industries).set({
    priceRating: avgPrice.toFixed(2),
    qualityRating: avgQuality.toFixed(2),
    deliveryRating: avgDelivery.toFixed(2),
    communicationRating: avgComm.toFixed(2),
    overallRating: overall.toFixed(2),
    totalOrders: ratings.length,
  }).where(eq(industries.id, industryId));
}

// ============================================================
// INDUSTRY STATS
// ============================================================

export async function getIndustryStats(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, prospect: 0, totalProducts: 0, avgRating: 0 };
  
  const allIndustries = await db.select().from(industries).where(eq(industries.userId, userId));
  const allProducts = await db.select().from(industryProducts).where(eq(industryProducts.userId, userId));
  
  const active = allIndustries.filter(i => i.status === "active").length;
  const prospect = allIndustries.filter(i => i.status === "prospect").length;
  const ratings = allIndustries.filter(i => Number(i.overallRating) > 0);
  const avgRating = ratings.length > 0 ? ratings.reduce((sum, i) => sum + Number(i.overallRating), 0) / ratings.length : 0;
  
  return {
    total: allIndustries.length,
    active,
    prospect,
    totalProducts: allProducts.length,
    avgRating: Number(avgRating.toFixed(2)),
  };
}
