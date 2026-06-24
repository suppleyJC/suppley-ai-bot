/**
 * Script de importação unificada: NCM + TIPI + Alíquotas
 *
 * Combina:
 * - Tabela NCM Histórica (Resolução Gecex nº 812/2025) — descrição
 * - Tabela TIPI (Decreto nº 11.158/2022, atualizado) — alíquota IPI
 *
 * Uso:
 *   pnpm tsx server/scripts/importTaxTables.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import * as db from "../db";

interface NCMData {
  ncmCode: string;
  description: string;
}

interface TIPIData {
  ncmCode: string;
  description: string;
  ipiRate: number | null;
}

async function importTaxTables() {
  try {
    console.log("📚 Importação de Tabelas Tributárias\n");

    // Carregar NCM
    const ncmPath = path.resolve("/tmp/ncms_import.json");
    if (!fs.existsSync(ncmPath)) {
      console.error("❌ Arquivo NCM não encontrado:", ncmPath);
      process.exit(1);
    }
    const ncmData: NCMData[] = JSON.parse(fs.readFileSync(ncmPath, "utf-8"));
    console.log(`✓ NCMs carregados: ${ncmData.length}`);

    // Carregar TIPI
    const tipiPath = path.resolve("/tmp/tipi_import.json");
    if (!fs.existsSync(tipiPath)) {
      console.error("❌ Arquivo TIPI não encontrado:", tipiPath);
      process.exit(1);
    }
    const tipiData: TIPIData[] = JSON.parse(fs.readFileSync(tipiPath, "utf-8"));
    console.log(`✓ TIPI carregados: ${tipiData.length}\n`);

    // Mesclar dados: TIPI como base + descriptions do NCM
    const tipiMap = new Map(tipiData.map((t) => [t.ncmCode, t]));
    const ncmMap = new Map(ncmData.map((n) => [n.ncmCode, n]));

    // Combinar: priorizar TIPI (mais completo), enriquecer com NCM
    const merged = new Map<
      string,
      {
        ncmCode: string;
        description: string;
        ipiRate: number | null;
      }
    >();

    // Adicionar TIPI
    for (const [code, tipi] of tipiMap) {
      merged.set(code, {
        ncmCode: code,
        description: tipi.description,
        ipiRate: tipi.ipiRate,
      });
    }

    // Enriquecer com NCM descriptions onde faltam
    for (const [code, ncm] of ncmMap) {
      if (!merged.has(code)) {
        merged.set(code, {
          ncmCode: code,
          description: ncm.description,
          ipiRate: null,
        });
      }
    }

    console.log(`📊 Total após merge: ${merged.size} NCMs únicos\n`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Importar em batches de 100
    const items = Array.from(merged.values());
    for (let i = 0; i < items.length; i += 100) {
      const batch = items.slice(i, i + 100);

      for (const item of batch) {
        try {
          // Validação
          if (!item.ncmCode || item.ncmCode.length !== 8 || !/^\d+$/.test(item.ncmCode)) {
            skipped++;
            continue;
          }

          // Usar função helper do db
          await db.upsertNcmTaxRate({
            ncmCode: item.ncmCode,
            description: item.description,
            ipiRate: item.ipiRate ?? 0, // De TIPI
            iiRate: 0, // Imposto de Importação (será preenchido depois via SISCOMEX)
            pisRate: 0, // PIS (será preenchido depois)
            cofinsRate: 0, // COFINS (será preenchido depois)
            mercosulIiRate: 0, // Padrão Mercosul
          });

          updated++;
        } catch (error) {
          console.error(`❌ Erro em ${item.ncmCode}:`, (error as any).message);
          skipped++;
        }
      }

      // Progress
      const progress = Math.min(i + 100, items.length);
      console.log(`⏳ Processados: ${progress}/${items.length}`);
    }

    console.log("\n✅ Importação Concluída!");
    console.log(`   Atualizados/Inseridos: ${updated}`);
    console.log(`   Pulados: ${skipped}`);
    console.log(`\n📈 Tabela ncm_tax_rates agora contém:`);
    console.log(`   - ${merged.size} códigos NCM`);
    console.log(`   - Descrições completas`);
    console.log(`   - Alíquotas IPI (de TIPI)`);
    console.log(`   - Prontos para: ICMS (por estado), PIS/COFINS, II (Mercosul)\n`);
    console.log(
      "ℹ️  Próximos passos:\n   1. Popular ICMS por estado (varia por UF)\n   2. Popular II (Imposto de Importação) via SISCOMEX\n   3. Validar PIS/COFINS"
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro na importação:", error);
    process.exit(1);
  }
}

importTaxTables();
