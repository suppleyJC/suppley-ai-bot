/**
 * Tax Table Update Service
 * Serviço para atualização de tabelas tributárias (TEC, TIPI, ICMS)
 * 
 * Fontes oficiais:
 * - NCM: https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json
 * - TEC: https://www.gov.br/mdic/pt-br/assuntos/camex/estrategia-comercial/tarifas/tarifa-externa-comum/tec
 * - TIPI: https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/tipi-tabela-de-incidencia-do-imposto-sobre-produtos-industrializados
 */

import { getDb } from "../db";
import { ncmTaxRates, icmsRates, taxRateHistory, taxUpdateLogs } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// Interfaces
interface NcmData {
  codigo: string;
  descricao: string;
  aliquotaII: number;  // Em basis points (14% = 1400)
  aliquotaIPI: number;
  aliquotaPIS: number;
  aliquotaCOFINS: number;
  exTarifario?: boolean;
  dataVigencia: Date;
}

interface TaxUpdateResult {
  success: boolean;
  updated: number;
  inserted: number;
  errors: string[];
  timestamp: Date;
}

interface TaxChangeNotification {
  ncmCode: string;
  description: string;
  field: string;
  oldValue: number;
  newValue: number;
  effectiveDate: Date;
  source: string;
}

// Alíquotas padrão por capítulo NCM (primeiros 2 dígitos)
// Baseado na TEC vigente - valores aproximados por categoria
const DEFAULT_II_RATES: Record<string, number> = {
  // Capítulo 01-05: Animais vivos e produtos de origem animal
  "01": 400, "02": 1000, "03": 1000, "04": 1400, "05": 400,
  // Capítulo 06-14: Produtos do reino vegetal
  "06": 600, "07": 1000, "08": 1000, "09": 1000, "10": 800, "11": 1000, "12": 800, "13": 1000, "14": 800,
  // Capítulo 15-24: Gorduras, alimentos, bebidas, tabaco
  "15": 1000, "16": 1600, "17": 1600, "18": 1400, "19": 1600, "20": 1400, "21": 1600, "22": 2000, "23": 600, "24": 2000,
  // Capítulo 25-27: Produtos minerais
  "25": 400, "26": 400, "27": 0,
  // Capítulo 28-38: Produtos químicos
  "28": 800, "29": 800, "30": 800, "31": 600, "32": 1400, "33": 1800, "34": 1400, "35": 1400, "36": 1800, "37": 1400, "38": 1400,
  // Capítulo 39-40: Plásticos e borracha
  "39": 1400, "40": 1400,
  // Capítulo 41-43: Couros e peles
  "41": 1000, "42": 2000, "43": 2000,
  // Capítulo 44-49: Madeira, papel, livros
  "44": 1000, "45": 1200, "46": 1800, "47": 400, "48": 1400, "49": 0,
  // Capítulo 50-63: Têxteis
  "50": 800, "51": 800, "52": 800, "53": 800, "54": 1800, "55": 1800, "56": 1800, "57": 2600, "58": 2600, "59": 1800, "60": 1800, "61": 3500, "62": 3500, "63": 3500,
  // Capítulo 64-67: Calçados, chapéus
  "64": 3500, "65": 2000, "66": 2000, "67": 2000,
  // Capítulo 68-70: Pedras, cerâmica, vidro
  "68": 1000, "69": 1200, "70": 1200,
  // Capítulo 71: Pérolas, metais preciosos
  "71": 1800,
  // Capítulo 72-83: Metais comuns
  "72": 1200, "73": 1400, "74": 1000, "75": 800, "76": 1200, "78": 1000, "79": 1000, "80": 800, "81": 800, "82": 1600, "83": 1800,
  // Capítulo 84-85: Máquinas e equipamentos elétricos
  "84": 1400, "85": 1600,
  // Capítulo 86-89: Veículos e transportes
  "86": 1400, "87": 3500, "88": 0, "89": 1400,
  // Capítulo 90-92: Instrumentos de precisão
  "90": 1400, "91": 2000, "92": 2000,
  // Capítulo 93: Armas
  "93": 2000,
  // Capítulo 94-96: Móveis, brinquedos, diversos
  "94": 1800, "95": 2000, "96": 1800,
  // Capítulo 97-99: Obras de arte, especiais
  "97": 400, "98": 0, "99": 0,
};

// Alíquotas padrão de IPI por capítulo
const DEFAULT_IPI_RATES: Record<string, number> = {
  // Bebidas alcoólicas e tabaco têm IPI alto
  "22": 1000, "24": 3000,
  // Cosméticos e perfumaria
  "33": 2200,
  // Automóveis
  "87": 2500,
  // Maioria dos produtos industrializados
  "default": 500,
};

/**
 * Obtém alíquota de II padrão baseada no capítulo NCM
 */
export function getDefaultIIRate(ncmCode: string): number {
  const chapter = ncmCode.substring(0, 2);
  return DEFAULT_II_RATES[chapter] ?? 1400; // 14% padrão
}

/**
 * Obtém alíquota de IPI padrão baseada no capítulo NCM
 */
export function getDefaultIPIRate(ncmCode: string): number {
  const chapter = ncmCode.substring(0, 2);
  return DEFAULT_IPI_RATES[chapter] ?? DEFAULT_IPI_RATES["default"];
}

/**
 * Atualiza tabela de NCM com dados do Siscomex
 */
export async function updateNcmFromSiscomex(): Promise<TaxUpdateResult> {
  const result: TaxUpdateResult = {
    success: false,
    updated: 0,
    inserted: 0,
    errors: [],
    timestamp: new Date(),
  };

  try {
    // Baixar dados do Siscomex
    const response = await fetch(
      "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json"
    );
    
    if (!response.ok) {
      result.errors.push(`Erro ao baixar dados: ${response.status}`);
      return result;
    }

    const data = await response.json();
    const nomenclaturas = data.Nomenclaturas || [];

    const db = await getDb();
    if (!db) {
      result.errors.push("Database not available");
      return result;
    }

    // Processar apenas NCMs de 8 ou 10 dígitos (códigos completos)
    for (const ncm of nomenclaturas) {
      const codigo = ncm.Codigo.replace(/\./g, "");
      if (codigo.length < 8) continue;

      const ncmCode = codigo.substring(0, 8);
      const descricao = ncm.Descricao;

      // Verificar se já existe
      const existing = await db
        .select()
        .from(ncmTaxRates)
        .where(eq(ncmTaxRates.ncmCode, ncmCode))
        .limit(1);

      if (existing.length === 0) {
        // Inserir novo NCM com alíquotas padrão
        await db.insert(ncmTaxRates).values({
          ncmCode,
          description: descricao,
          iiRate: getDefaultIIRate(ncmCode),
          ipiRate: getDefaultIPIRate(ncmCode),
          pisRate: 216, // 2.16%
          cofinsRate: 1000, // 10%
          mercosulIiRate: 0,
        });
        result.inserted++;
      } else if (existing[0].description !== descricao) {
        // Atualizar descrição se mudou
        await db
          .update(ncmTaxRates)
          .set({ description: descricao })
          .where(eq(ncmTaxRates.ncmCode, ncmCode));
        result.updated++;
      }
    }

    result.success = true;
    
    // Registrar log de atualização
    await logTaxUpdate(db, "NCM_SISCOMEX", result);

  } catch (error) {
    result.errors.push(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Atualiza alíquotas de um NCM específico
 */
export async function updateNcmRates(
  ncmCode: string,
  rates: {
    iiRate?: number;
    ipiRate?: number;
    pisRate?: number;
    cofinsRate?: number;
    mercosulIiRate?: number;
  },
  source: string = "manual"
): Promise<{ success: boolean; changes: TaxChangeNotification[] }> {
  const changes: TaxChangeNotification[] = [];
  
  const db = await getDb();
  if (!db) {
    return { success: false, changes };
  }

  // Buscar valores atuais
  const current = await db
    .select()
    .from(ncmTaxRates)
    .where(eq(ncmTaxRates.ncmCode, ncmCode))
    .limit(1);

  if (current.length === 0) {
    return { success: false, changes };
  }

  const currentRates = current[0];
  const updates: Record<string, number> = {};

  // Verificar mudanças e registrar
  if (rates.iiRate !== undefined && rates.iiRate !== currentRates.iiRate) {
    changes.push({
      ncmCode,
      description: currentRates.description || "",
      field: "II",
      oldValue: currentRates.iiRate,
      newValue: rates.iiRate,
      effectiveDate: new Date(),
      source,
    });
    updates.iiRate = rates.iiRate;
  }

  if (rates.ipiRate !== undefined && rates.ipiRate !== currentRates.ipiRate) {
    changes.push({
      ncmCode,
      description: currentRates.description || "",
      field: "IPI",
      oldValue: currentRates.ipiRate,
      newValue: rates.ipiRate,
      effectiveDate: new Date(),
      source,
    });
    updates.ipiRate = rates.ipiRate;
  }

  if (rates.pisRate !== undefined && rates.pisRate !== currentRates.pisRate) {
    changes.push({
      ncmCode,
      description: currentRates.description || "",
      field: "PIS",
      oldValue: currentRates.pisRate,
      newValue: rates.pisRate,
      effectiveDate: new Date(),
      source,
    });
    updates.pisRate = rates.pisRate;
  }

  if (rates.cofinsRate !== undefined && rates.cofinsRate !== currentRates.cofinsRate) {
    changes.push({
      ncmCode,
      description: currentRates.description || "",
      field: "COFINS",
      oldValue: currentRates.cofinsRate,
      newValue: rates.cofinsRate,
      effectiveDate: new Date(),
      source,
    });
    updates.cofinsRate = rates.cofinsRate;
  }

  if (rates.mercosulIiRate !== undefined && rates.mercosulIiRate !== currentRates.mercosulIiRate) {
    changes.push({
      ncmCode,
      description: currentRates.description || "",
      field: "II_MERCOSUL",
      oldValue: currentRates.mercosulIiRate,
      newValue: rates.mercosulIiRate,
      effectiveDate: new Date(),
      source,
    });
    updates.mercosulIiRate = rates.mercosulIiRate;
  }

  if (Object.keys(updates).length > 0) {
    // Salvar histórico antes de atualizar
    for (const change of changes) {
      await saveTaxRateHistory(db, change);
    }

    // Atualizar tabela
    await db
      .update(ncmTaxRates)
      .set(updates)
      .where(eq(ncmTaxRates.ncmCode, ncmCode));
  }

  return { success: true, changes };
}

/**
 * Salva histórico de alteração de alíquota
 */
async function saveTaxRateHistory(db: any, change: TaxChangeNotification) {
  try {
    await db.insert(taxRateHistory).values({
      ncmCode: change.ncmCode,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      source: change.source,
      effectiveDate: change.effectiveDate,
    });
  } catch (error) {
    console.error("Error saving tax rate history:", error);
  }
}

/**
 * Registra log de atualização de tabela
 */
async function logTaxUpdate(db: any, source: string, result: TaxUpdateResult) {
  try {
    await db.insert(taxUpdateLogs).values({
      source,
      success: result.success,
      insertedCount: result.inserted,
      updatedCount: result.updated,
      errors: result.errors.length > 0 ? result.errors.join("; ") : null,
    });
  } catch (error) {
    console.error("Error logging tax update:", error);
  }
}

/**
 * Busca histórico de alterações de um NCM
 */
export async function getNcmRateHistory(ncmCode: string): Promise<TaxChangeNotification[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const history = await db
      .select()
      .from(taxRateHistory)
      .where(eq(taxRateHistory.ncmCode, ncmCode))
      .orderBy(sql`${taxRateHistory.effectiveDate} DESC`)
      .limit(50);

    return history.map(h => ({
      ncmCode: h.ncmCode,
      description: "",
      field: h.field,
      oldValue: h.oldValue,
      newValue: h.newValue,
      effectiveDate: h.effectiveDate,
      source: h.source,
    }));
  } catch (error) {
    console.error("Error fetching NCM rate history:", error);
    return [];
  }
}

/**
 * Verifica se há atualizações pendentes nas tabelas oficiais
 */
export async function checkForTaxUpdates(): Promise<{
  hasUpdates: boolean;
  lastUpdate: Date | null;
  message: string;
}> {
  const db = await getDb();
  if (!db) {
    return { hasUpdates: false, lastUpdate: null, message: "Database not available" };
  }

  try {
    // Buscar último log de atualização
    const lastLog = await db
      .select()
      .from(taxUpdateLogs)
      .orderBy(sql`${taxUpdateLogs.createdAt} DESC`)
      .limit(1);

    const lastUpdate = lastLog.length > 0 ? lastLog[0].createdAt : null;
    const daysSinceUpdate = lastUpdate 
      ? Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Recomendar atualização se passou mais de 7 dias
    if (daysSinceUpdate > 7) {
      return {
        hasUpdates: true,
        lastUpdate,
        message: `Última atualização há ${daysSinceUpdate} dias. Recomendamos verificar atualizações nas tabelas TEC e TIPI.`,
      };
    }

    return {
      hasUpdates: false,
      lastUpdate,
      message: `Tabelas atualizadas há ${daysSinceUpdate} dia(s).`,
    };
  } catch (error) {
    return { hasUpdates: false, lastUpdate: null, message: "Error checking updates" };
  }
}

/**
 * Obtém estatísticas das tabelas tributárias
 */
export async function getTaxTableStats(): Promise<{
  totalNcms: number;
  totalIcmsStates: number;
  lastNcmUpdate: Date | null;
  lastIcmsUpdate: Date | null;
}> {
  const db = await getDb();
  if (!db) {
    return { totalNcms: 0, totalIcmsStates: 0, lastNcmUpdate: null, lastIcmsUpdate: null };
  }

  try {
    const ncmCount = await db.select({ count: sql`COUNT(*)` }).from(ncmTaxRates);
    const icmsCount = await db.select({ count: sql`COUNT(*)` }).from(icmsRates);

    return {
      totalNcms: Number(ncmCount[0]?.count || 0),
      totalIcmsStates: Number(icmsCount[0]?.count || 0),
      lastNcmUpdate: null, // TODO: implementar
      lastIcmsUpdate: null,
    };
  } catch (error) {
    return { totalNcms: 0, totalIcmsStates: 0, lastNcmUpdate: null, lastIcmsUpdate: null };
  }
}
