import { eq, desc, and } from "drizzle-orm";
import {
  proformas, InsertProforma, Proforma,
  proformaItems, InsertProformaItem, ProformaItem,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================================
// PROFORMAS - CRUD
// ============================================================

export async function createProforma(data: InsertProforma): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(proformas).values(data);
  return Number(result.insertId);
}

export async function updateProforma(
  id: number,
  userId: number,
  data: Partial<InsertProforma>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(proformas).set(data).where(and(eq(proformas.id, id), eq(proformas.userId, userId)));
  return true;
}

export async function getProformasByUser(
  userId: number,
  filters?: { status?: string; industriaId?: number }
): Promise<Proforma[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(proformas.userId, userId)];
  if (filters?.status) conditions.push(eq(proformas.status, filters.status as any));
  if (filters?.industriaId) conditions.push(eq(proformas.industriaId, filters.industriaId));
  return db.select().from(proformas).where(and(...conditions)).orderBy(desc(proformas.createdAt));
}

/**
 * Versão enxuta para a TRAVA DE DUPLICIDADE: só as colunas de comparação.
 * getProformasByUser traz rawExtraction (JSON grande) — em escala de milhares
 * de cotações isso pesaria em cada save.
 */
export async function getProformasForDuplicateCheck(userId: number): Promise<
  Array<{
    id: number;
    numero: string | null;
    tipo: string;
    supplierName: string | null;
    currency: string;
    quotationDate: Date | null;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: proformas.id,
      numero: proformas.numero,
      tipo: proformas.tipo,
      supplierName: proformas.supplierName,
      currency: proformas.currency,
      quotationDate: proformas.quotationDate,
    })
    .from(proformas)
    .where(eq(proformas.userId, userId));
}

export async function getProformaById(id: number, userId: number): Promise<Proforma | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(proformas).where(and(eq(proformas.id, id), eq(proformas.userId, userId)));
  return row || null;
}

export async function deleteProforma(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(proformas).where(and(eq(proformas.id, id), eq(proformas.userId, userId)));
  await db.delete(proformaItems).where(eq(proformaItems.proformaId, id));
  return true;
}

// ============================================================
// PROFORMA ITEMS - CRUD
// ============================================================

export async function createProformaItem(data: InsertProformaItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(proformaItems).values(data);
  return Number(result.insertId);
}

export async function getProformaItems(proformaId: number): Promise<ProformaItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proformaItems).where(eq(proformaItems.proformaId, proformaId));
}

/** Remove todos os itens de uma proforma (usado ao reescrever na edição). */
export async function deleteProformaItems(proformaId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(proformaItems).where(eq(proformaItems.proformaId, proformaId));
}

export async function updateProformaItem(
  id: number,
  data: Partial<InsertProformaItem>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(proformaItems).set(data).where(eq(proformaItems.id, id));
  return true;
}

/** Conta proformas do usuário para gerar número sequencial (PF-AAAA-0001). */
export async function countProformasByUser(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: proformas.id }).from(proformas).where(eq(proformas.userId, userId));
  return rows.length;
}

/**
 * Item de proforma com o contexto da proforma (fornecedor, data, moeda).
 * É a base do histórico cronológico de preços (evolução por produto/fornecedor).
 */
export interface ProformaItemWithContext {
  itemId: number;
  proformaId: number;
  numero: string | null;
  industriaId: number | null;
  supplierName: string | null;
  supplierCountry: string | null;
  currency: string;
  incoterm: string | null;
  /** Data efetiva da cotação: quotationDate quando existir, senão createdAt. */
  quotationDate: Date;
  productName: string;
  ncmCode: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
}

/**
 * Retorna todos os itens de proforma do usuário com o contexto da proforma,
 * em ordem cronológica (mais antigo → mais recente). Base para as métricas de
 * evolução de preço por produto e por fornecedor.
 */
export async function getProformaItemsWithContext(
  userId: number,
  filters?: { industriaId?: number }
): Promise<ProformaItemWithContext[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(proformas.userId, userId)];
  if (filters?.industriaId) conditions.push(eq(proformas.industriaId, filters.industriaId));

  const rows = await db
    .select({
      itemId: proformaItems.id,
      proformaId: proformas.id,
      numero: proformas.numero,
      industriaId: proformas.industriaId,
      supplierName: proformas.supplierName,
      supplierCountry: proformas.supplierCountry,
      currency: proformas.currency,
      incoterm: proformas.incoterm,
      quotationDate: proformas.quotationDate,
      createdAt: proformas.createdAt,
      productName: proformaItems.productName,
      ncmCode: proformaItems.ncmCode,
      quantity: proformaItems.quantity,
      unit: proformaItems.unit,
      unitPriceCents: proformaItems.unitPriceCents,
    })
    .from(proformaItems)
    .innerJoin(proformas, eq(proformaItems.proformaId, proformas.id))
    .where(and(...conditions));

  const mapped: ProformaItemWithContext[] = rows.map((r) => ({
    itemId: r.itemId,
    proformaId: r.proformaId,
    numero: r.numero,
    industriaId: r.industriaId,
    supplierName: r.supplierName,
    supplierCountry: r.supplierCountry,
    currency: r.currency,
    incoterm: r.incoterm,
    quotationDate: r.quotationDate ?? r.createdAt,
    productName: r.productName,
    ncmCode: r.ncmCode,
    quantity: r.quantity,
    unit: r.unit,
    unitPriceCents: Number(r.unitPriceCents),
  }));

  // Ordena cronologicamente (mais antigo primeiro) para séries temporais.
  mapped.sort((a, b) => a.quotationDate.getTime() - b.quotationDate.getTime());
  return mapped;
}
