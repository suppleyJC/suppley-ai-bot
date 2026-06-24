/**
 * Script de importação: Tabela NCM Histórica (Resolução Gecex nº 812/2025)
 *
 * Uso:
 *   pnpm tsx server/scripts/importNCMTable.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { drizzleDb } from "../db/connection";
import { ncmTaxRates } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

interface NCMData {
  ncmCode: string;
  description: string;
  dataInicio: string;
  dataFim: string;
}

async function importNCMTable() {
  try {
    const jsonPath = path.resolve("/tmp/ncms_import.json");

    if (!fs.existsSync(jsonPath)) {
      console.error("❌ Arquivo não encontrado:", jsonPath);
      process.exit(1);
    }

    const ncmData: NCMData[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    console.log(`📊 Carregando ${ncmData.length} NCMs...`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const ncm of ncmData) {
      try {
        // Validar NCM (8 dígitos)
        if (!ncm.ncmCode || ncm.ncmCode.length !== 8 || !/^\d+$/.test(ncm.ncmCode)) {
          console.warn(`⚠️  NCM inválido: ${ncm.ncmCode}`);
          skipped++;
          continue;
        }

        // Verificar se NCM já existe
        const existing = await drizzleDb
          .select()
          .from(ncmTaxRates)
          .where(eq(ncmTaxRates.ncmCode, ncm.ncmCode));

        if (existing.length > 0) {
          // Atualizar descrição se mudou
          await drizzleDb
            .update(ncmTaxRates)
            .set({ description: ncm.description })
            .where(eq(ncmTaxRates.ncmCode, ncm.ncmCode));
          updated++;
        } else {
          // Inserir novo NCM (com valores padrão para alíquotas)
          await drizzleDb.insert(ncmTaxRates).values({
            ncmCode: ncm.ncmCode,
            description: ncm.description,
            // Alíquotas padrão (serão preenchidas manualmente ou via API)
            icmsRate: 0,
            ipiRate: 0,
            pisCofinsRate: 0,
            mercosulIiRate: 0,
          });
          inserted++;
        }
      } catch (error) {
        console.error(`❌ Erro ao processar NCM ${ncm.ncmCode}:`, error);
        skipped++;
      }
    }

    console.log("\n✅ Importação Concluída:");
    console.log(`   Inseridos: ${inserted}`);
    console.log(`   Atualizados: ${updated}`);
    console.log(`   Pulados: ${skipped}`);
    console.log(`   Total: ${inserted + updated + skipped}`);

    // Verificar total na tabela
    const total = await drizzleDb.select().from(ncmTaxRates);
    console.log(`\n📈 Total de NCMs na tabela: ${total.length}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro na importação:", error);
    process.exit(1);
  }
}

importNCMTable();
