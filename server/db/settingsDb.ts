import { eq } from "drizzle-orm";
import { companySettings, InsertCompanySettings, CompanySettings } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getCompanySettings(userId: number): Promise<CompanySettings | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(companySettings).where(eq(companySettings.userId, userId)).limit(1);
  return result[0] || null;
}

export async function upsertCompanySettings(userId: number, data: Partial<InsertCompanySettings>): Promise<CompanySettings | null> {
  const db = await getDb();
  if (!db) return null;
  
  await db.insert(companySettings).values({ ...data, userId }).onDuplicateKeyUpdate({
    set: {
      companyName: data.companyName,
      cnpj: data.cnpj,
      stateCode: data.stateCode,
      taxRegime: data.taxRegime,
      simplesAliquota: data.simplesAliquota,
      simplesFaixa: data.simplesFaixa,
      defaultMarkupPercent: data.defaultMarkupPercent,
      defaultCustomsBrokerCents: data.defaultCustomsBrokerCents,
      defaultStorageCents: data.defaultStorageCents,
    }
  });
  
  return getCompanySettings(userId);
}
