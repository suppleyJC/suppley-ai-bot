/**
 * parametrosDb — leitura/escrita dos Parâmetros de Cálculo versionados.
 *
 * Tabelas: tax_parameters, port_costs, ncm_exceptions, fiscal_benefits.
 * Regra de vigência (tax_parameters): valor ativo de uma chave = última linha
 * com isActive=true, effectiveDate <= hoje e (endDate nula ou > hoje).
 */
import { and, desc, eq, isNull, or, gt, lte } from "drizzle-orm";
import {
  taxParameters,
  portCosts,
  ncmExceptions,
  fiscalBenefits,
  type TaxParameter,
  type InsertTaxParameter,
  type PortCost,
  type InsertPortCost,
  type NcmException,
  type InsertNcmException,
  type FiscalBenefit,
  type InsertFiscalBenefit,
} from "../../drizzle/schema";
import { getDb } from "./connection";

/* ---------------- tax_parameters ---------------- */

/** Todas as linhas de uma chave (histórico), mais recentes primeiro. */
export async function listTaxParameterHistory(paramKey: string): Promise<TaxParameter[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(taxParameters)
    .where(eq(taxParameters.paramKey, paramKey))
    .orderBy(desc(taxParameters.effectiveDate));
}

/** Todas as linhas (todas as chaves), para a tela de parâmetros. */
export async function listAllTaxParameters(): Promise<TaxParameter[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(taxParameters).orderBy(taxParameters.paramKey, desc(taxParameters.effectiveDate));
}

/** Mapa chave → linha vigente (a fonte que o motor deve consumir). */
export async function getActiveTaxParameters(at: Date = new Date()): Promise<Record<string, TaxParameter>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select()
    .from(taxParameters)
    .where(
      and(
        eq(taxParameters.isActive, true),
        lte(taxParameters.effectiveDate, at),
        or(isNull(taxParameters.endDate), gt(taxParameters.endDate, at)),
      ),
    )
    .orderBy(taxParameters.paramKey, desc(taxParameters.effectiveDate));

  const active: Record<string, TaxParameter> = {};
  for (const r of rows) {
    // Como vem ordenado por effectiveDate desc, a primeira de cada chave vence.
    if (!active[r.paramKey]) active[r.paramKey] = r;
  }
  return active;
}

/** Cria uma NOVA versão do parâmetro (não muta o histórico). */
export async function insertTaxParameterVersion(data: InsertTaxParameter): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(taxParameters).values(data).onDuplicateKeyUpdate({
    set: {
      label: data.label,
      category: data.category,
      unit: data.unit,
      valueBp: data.valueBp,
      valueCents: data.valueCents,
      endDate: data.endDate,
      legalBasis: data.legalBasis,
      notes: data.notes,
      isActive: data.isActive,
    },
  });
}

/* ---------------- port_costs ---------------- */

export async function listPortCosts(): Promise<PortCost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(portCosts).orderBy(portCosts.stateCode, portCosts.portName);
}

export async function getActivePortCost(portCode: string, at: Date = new Date()): Promise<PortCost | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(portCosts)
    .where(and(eq(portCosts.portCode, portCode), eq(portCosts.isActive, true), lte(portCosts.effectiveDate, at)))
    .orderBy(desc(portCosts.effectiveDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertPortCost(data: InsertPortCost): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(portCosts).values(data).onDuplicateKeyUpdate({
    set: {
      portName: data.portName,
      stateCode: data.stateCode,
      thcCents: data.thcCents,
      storageBp: data.storageBp,
      storageMinCents: data.storageMinCents,
      liberationCents: data.liberationCents,
      otherCents: data.otherCents,
      legalBasis: data.legalBasis,
      notes: data.notes,
      isActive: data.isActive,
    },
  });
}

/* ---------------- ncm_exceptions (Ex-Tarifário) ---------------- */

export async function listNcmExceptions(): Promise<NcmException[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ncmExceptions).orderBy(ncmExceptions.ncmCode);
}

/** Ex-tarifário vigente para um NCM (apenas ativos, dentro da vigência). */
export async function getActiveNcmException(ncmCode: string, at: Date = new Date()): Promise<NcmException | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(ncmExceptions)
    .where(and(eq(ncmExceptions.ncmCode, ncmCode), eq(ncmExceptions.isActive, true)))
    .orderBy(desc(ncmExceptions.startDate));
  // Filtra vigência em JS (startDate/endDate podem ser nulos).
  const valid = rows.filter(
    (r) => (!r.startDate || r.startDate <= at) && (!r.endDate || r.endDate > at),
  );
  return valid[0] ?? null;
}

export async function upsertNcmException(data: InsertNcmException): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(ncmExceptions).values(data).onDuplicateKeyUpdate({
    set: {
      description: data.description,
      reducedIiRate: data.reducedIiRate,
      reducedIpiRate: data.reducedIpiRate,
      legalBasis: data.legalBasis,
      startDate: data.startDate,
      endDate: data.endDate,
      isActive: data.isActive,
    },
  });
}

/* ---------------- fiscal_benefits ---------------- */

export async function listFiscalBenefits(): Promise<FiscalBenefit[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fiscalBenefits).orderBy(fiscalBenefits.name);
}

export async function upsertFiscalBenefit(data: InsertFiscalBenefit): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  if (data.id) {
    await db.update(fiscalBenefits).set(data).where(eq(fiscalBenefits.id, data.id));
    return data.id;
  }
  const res: any = await db.insert(fiscalBenefits).values(data);
  return res?.insertId ?? null;
}
