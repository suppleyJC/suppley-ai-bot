import { eq, desc, and } from "drizzle-orm";
import { products, InsertProduct, Product } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createProduct(data: InsertProduct): Promise<Product | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(products).values(data);
  const inserted = await db.select().from(products).where(eq(products.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

export async function getProductsByUser(userId: number): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(products).where(eq(products.userId, userId)).orderBy(desc(products.createdAt));
}

export async function getProductById(id: number, userId: number): Promise<Product | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(products).where(and(eq(products.id, id), eq(products.userId, userId))).limit(1);
  return result[0] || null;
}

export async function updateProduct(id: number, userId: number, data: Partial<InsertProduct>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(products).set(data).where(and(eq(products.id, id), eq(products.userId, userId)));
  return true;
}

export async function deleteProduct(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(products).where(and(eq(products.id, id), eq(products.userId, userId)));
  return true;
}
