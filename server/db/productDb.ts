import { eq, desc, and } from "drizzle-orm";
import { products, InsertProduct, Product, users } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createProduct(data: InsertProduct): Promise<Product | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(products).values(data);
  const inserted = await db.select().from(products).where(eq(products.id, Number(result[0].insertId))).limit(1);
  return inserted[0] || null;
}

/** admin = conta central: enxerga os ativos cadastrados por qualquer usuário. */
export async function getProductsByUser(
  userId: number,
  admin = false
): Promise<Array<Product & { donoNome: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ p: products, donoNome: users.name, donoEmail: users.email })
    .from(products)
    .leftJoin(users, eq(users.id, products.userId))
    .where(admin ? undefined : eq(products.userId, userId))
    .orderBy(desc(products.createdAt));

  return rows.map(({ p, donoNome, donoEmail }) => ({
    ...p,
    donoNome: admin && p.userId !== userId ? (donoNome || donoEmail || `usuário #${p.userId}`) : null,
  }));
}

export async function getProductById(
  id: number,
  userId: number,
  admin = false
): Promise<Product | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), admin ? undefined : eq(products.userId, userId)))
    .limit(1);
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
