/**
 * Drawback Service
 * Serviço para gestão de operações de Drawback
 * 
 * Tipos de Drawback:
 * - Suspensão: Importação com suspensão de tributos (II, IPI, PIS, COFINS)
 * - Isenção: Reposição de estoque - importação para repor insumos usados em exportação
 * - Restituição: Devolução de tributos pagos na importação de insumos exportados
 */

import { getDb } from "../db";
import { drawbackRecords } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// Interfaces
export interface DrawbackCalculation {
  // Valores originais dos tributos
  iiOriginal: number;
  ipiOriginal: number;
  pisOriginal: number;
  cofinsOriginal: number;
  
  // Valores após aplicação do Drawback
  iiWithDrawback: number;
  ipiWithDrawback: number;
  pisWithDrawback: number;
  cofinsWithDrawback: number;
  
  // Economia total
  totalSavings: number;
  savingsPercent: number;
  
  // Tipo aplicado
  drawbackType: "suspension" | "exemption" | "restitution";
  
  // Requisitos
  requirements: string[];
  documentation: string[];
}

export interface DrawbackEligibility {
  isEligible: boolean;
  eligibleTypes: ("suspension" | "exemption" | "restitution")[];
  reasons: string[];
  recommendations: string[];
}

/**
 * Verifica elegibilidade para Drawback
 */
export function checkDrawbackEligibility(params: {
  hasExportCommitment: boolean;
  exportValueCents: number;
  importValueCents: number;
  productType: string;
  ncmCode: string;
}): DrawbackEligibility {
  const result: DrawbackEligibility = {
    isEligible: false,
    eligibleTypes: [],
    reasons: [],
    recommendations: [],
  };

  // Drawback Suspensão - Requer compromisso de exportação
  if (params.hasExportCommitment) {
    result.eligibleTypes.push("suspension");
    result.reasons.push("Possui compromisso de exportação vinculado à importação");
    result.recommendations.push(
      "Drawback Suspensão é o mais vantajoso - suspende II, IPI, PIS e COFINS na importação"
    );
  }

  // Drawback Isenção - Requer exportação já realizada
  if (params.exportValueCents > 0) {
    result.eligibleTypes.push("exemption");
    result.reasons.push("Possui exportação realizada que permite reposição de estoque");
    result.recommendations.push(
      "Drawback Isenção permite importar insumos com isenção para repor estoque usado em exportação"
    );
  }

  // Drawback Restituição - Tributos já pagos em importação usada para exportação
  if (params.exportValueCents > 0 && params.importValueCents > 0) {
    result.eligibleTypes.push("restitution");
    result.reasons.push("Possui importação anterior cujos insumos foram usados em exportação");
    result.recommendations.push(
      "Drawback Restituição permite recuperar tributos pagos em importações anteriores"
    );
  }

  // Verificar NCMs que não são elegíveis
  const nonEligibleNcms = ["22", "24"]; // Bebidas e tabaco geralmente não são elegíveis
  if (nonEligibleNcms.includes(params.ncmCode.substring(0, 2))) {
    result.reasons.push("Produto pode ter restrições para Drawback (verificar legislação específica)");
  }

  result.isEligible = result.eligibleTypes.length > 0;

  if (!result.isEligible) {
    result.reasons.push("Não identificada elegibilidade para Drawback");
    result.recommendations.push(
      "Para utilizar Drawback, é necessário ter compromisso de exportação ou exportação já realizada"
    );
  }

  return result;
}

/**
 * Calcula economia com Drawback
 */
export function calculateDrawbackSavings(params: {
  drawbackType: "suspension" | "exemption" | "restitution";
  iiValueCents: number;
  ipiValueCents: number;
  pisValueCents: number;
  cofinsValueCents: number;
  cifValueCents: number;
}): DrawbackCalculation {
  const { drawbackType, iiValueCents, ipiValueCents, pisValueCents, cofinsValueCents, cifValueCents } = params;

  let iiWithDrawback = iiValueCents;
  let ipiWithDrawback = ipiValueCents;
  let pisWithDrawback = pisValueCents;
  let cofinsWithDrawback = cofinsValueCents;

  const requirements: string[] = [];
  const documentation: string[] = [];

  switch (drawbackType) {
    case "suspension":
      // Suspensão total de todos os tributos
      iiWithDrawback = 0;
      ipiWithDrawback = 0;
      pisWithDrawback = 0;
      cofinsWithDrawback = 0;
      
      requirements.push(
        "Ato Concessório emitido pelo Siscomex",
        "Compromisso de exportação com prazo definido",
        "Vinculação entre importação e exportação",
        "Cumprimento do prazo de exportação (geralmente 1 ano, prorrogável)"
      );
      documentation.push(
        "Ato Concessório de Drawback",
        "DI (Declaração de Importação) vinculada",
        "Registro de Exportação (RE)",
        "Comprovante de exportação (DU-E)"
      );
      break;

    case "exemption":
      // Isenção total para reposição de estoque
      iiWithDrawback = 0;
      ipiWithDrawback = 0;
      pisWithDrawback = 0;
      cofinsWithDrawback = 0;
      
      requirements.push(
        "Exportação já realizada com insumos importados",
        "Comprovação de uso dos insumos na produção exportada",
        "Quantidade importada proporcional à exportação realizada"
      );
      documentation.push(
        "Comprovante de exportação anterior",
        "Demonstrativo de consumo de insumos",
        "Ato Concessório de Drawback Isenção"
      );
      break;

    case "restitution":
      // Restituição de tributos pagos (crédito)
      // Neste caso, os tributos foram pagos e serão restituídos
      // O cálculo mostra o valor a ser restituído
      requirements.push(
        "Tributos efetivamente pagos na importação",
        "Comprovação de uso dos insumos em produto exportado",
        "Exportação realizada após a importação"
      );
      documentation.push(
        "DI com tributos pagos",
        "Comprovante de pagamento dos tributos",
        "Comprovante de exportação",
        "Demonstrativo de consumo"
      );
      break;
  }

  const totalSavings = 
    (iiValueCents - iiWithDrawback) +
    (ipiValueCents - ipiWithDrawback) +
    (pisValueCents - pisWithDrawback) +
    (cofinsValueCents - cofinsWithDrawback);

  const totalOriginal = iiValueCents + ipiValueCents + pisValueCents + cofinsValueCents;
  const savingsPercent = totalOriginal > 0 ? (totalSavings / totalOriginal) * 100 : 0;

  return {
    iiOriginal: iiValueCents,
    ipiOriginal: ipiValueCents,
    pisOriginal: pisValueCents,
    cofinsOriginal: cofinsValueCents,
    iiWithDrawback,
    ipiWithDrawback,
    pisWithDrawback,
    cofinsWithDrawback,
    totalSavings,
    savingsPercent,
    drawbackType,
    requirements,
    documentation,
  };
}

/**
 * Cria registro de Drawback
 */
export async function createDrawbackRecord(params: {
  userId: number;
  drawbackType: "suspension" | "exemption" | "restitution";
  exportProductName?: string;
  exportNcm?: string;
  exportQuantity?: number;
  exportValueCents?: number;
  importProductName?: string;
  importNcm?: string;
  importQuantity?: number;
  importValueCents?: number;
  quotationId?: number;
  notes?: string;
}): Promise<{ success: boolean; id?: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const result = await db.insert(drawbackRecords).values({
      userId: params.userId,
      drawbackType: params.drawbackType,
      exportProductName: params.exportProductName,
      exportNcm: params.exportNcm,
      exportQuantity: params.exportQuantity,
      exportValueCents: params.exportValueCents,
      importProductName: params.importProductName,
      importNcm: params.importNcm,
      importQuantity: params.importQuantity,
      importValueCents: params.importValueCents,
      quotationId: params.quotationId,
      notes: params.notes,
      status: "draft",
    });

    return { success: true, id: result[0].insertId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Lista registros de Drawback do usuário
 */
export async function listDrawbackRecords(userId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const records = await db
      .select()
      .from(drawbackRecords)
      .where(eq(drawbackRecords.userId, userId))
      .orderBy(sql`${drawbackRecords.createdAt} DESC`);

    return records;
  } catch (error) {
    console.error("Error listing drawback records:", error);
    return [];
  }
}

/**
 * Atualiza status do Drawback
 */
export async function updateDrawbackStatus(
  id: number,
  userId: number,
  status: "draft" | "requested" | "approved" | "active" | "fulfilled" | "expired" | "cancelled",
  actNumber?: string,
  actDate?: Date,
  validUntil?: Date
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    await db
      .update(drawbackRecords)
      .set({
        status,
        actNumber,
        actDate,
        validUntil,
      })
      .where(and(eq(drawbackRecords.id, id), eq(drawbackRecords.userId, userId)));

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Calcula tributos suspensos para um Drawback
 */
export async function calculateSuspendedTaxes(
  drawbackId: number,
  taxes: {
    iiSuspendedCents: number;
    ipiSuspendedCents: number;
    pisSuspendedCents: number;
    cofinsSuspendedCents: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    await db
      .update(drawbackRecords)
      .set(taxes)
      .where(eq(drawbackRecords.id, drawbackId));

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Gera relatório de economia com Drawback
 */
export function generateDrawbackReport(calculations: DrawbackCalculation[]): {
  totalIISaved: number;
  totalIPISaved: number;
  totalPISSaved: number;
  totalCOFINSSaved: number;
  grandTotalSaved: number;
  averageSavingsPercent: number;
  summary: string;
} {
  let totalIISaved = 0;
  let totalIPISaved = 0;
  let totalPISSaved = 0;
  let totalCOFINSSaved = 0;
  let totalSavingsPercent = 0;

  for (const calc of calculations) {
    totalIISaved += calc.iiOriginal - calc.iiWithDrawback;
    totalIPISaved += calc.ipiOriginal - calc.ipiWithDrawback;
    totalPISSaved += calc.pisOriginal - calc.pisWithDrawback;
    totalCOFINSSaved += calc.cofinsOriginal - calc.cofinsWithDrawback;
    totalSavingsPercent += calc.savingsPercent;
  }

  const grandTotalSaved = totalIISaved + totalIPISaved + totalPISSaved + totalCOFINSSaved;
  const averageSavingsPercent = calculations.length > 0 ? totalSavingsPercent / calculations.length : 0;

  const summary = `
Relatório de Economia com Drawback
==================================
Total de operações: ${calculations.length}
Economia em II: R$ ${(totalIISaved / 100).toFixed(2)}
Economia em IPI: R$ ${(totalIPISaved / 100).toFixed(2)}
Economia em PIS: R$ ${(totalPISSaved / 100).toFixed(2)}
Economia em COFINS: R$ ${(totalCOFINSSaved / 100).toFixed(2)}
----------------------------------
ECONOMIA TOTAL: R$ ${(grandTotalSaved / 100).toFixed(2)}
Economia média: ${averageSavingsPercent.toFixed(1)}%
  `.trim();

  return {
    totalIISaved,
    totalIPISaved,
    totalPISSaved,
    totalCOFINSSaved,
    grandTotalSaved,
    averageSavingsPercent,
    summary,
  };
}
