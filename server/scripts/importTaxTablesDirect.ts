/**
 * Script de importação direta: NCM + TIPI via SQL
 *
 * Usa SQL puro para evitar problemas de sintaxe Drizzle
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { ENV } from "../_core/env";

interface TIPIData {
  ncmCode: string;
  description: string;
  ipiRate: number | null;
}

async function importTaxTablesDirect() {
  let connection;

  try {
    console.log("🔌 Conectando ao MySQL...");

    // Parse DATABASE_URL
    const dbUrl = ENV.databaseUrl || "";
    const urlObj = new URL(dbUrl.replace("mysql://", "mysql2://"));

    connection = await mysql.createConnection({
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 3306,
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.split("/")[1],
    });

    console.log("✓ Conectado ao MySQL\n");

    // Carregar TIPI
    const tipiPath = path.resolve("/tmp/tipi_import.json");
    if (!fs.existsSync(tipiPath)) {
      console.error("❌ Arquivo TIPI não encontrado:", tipiPath);
      process.exit(1);
    }

    const tipiData: TIPIData[] = JSON.parse(fs.readFileSync(tipiPath, "utf-8"));
    console.log(`📊 Carregando ${tipiData.length} registros TIPI...\n`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Processar em batches de 1000
    for (let i = 0; i < tipiData.length; i += 1000) {
      const batch = tipiData.slice(i, i + 1000);

      // Preparar INSERT ... ON DUPLICATE KEY UPDATE
      const values: any[] = [];
      const placeholders: string[] = [];

      for (const item of batch) {
        // Validação
        if (
          !item.ncmCode ||
          item.ncmCode.length !== 8 ||
          !/^\d+$/.test(item.ncmCode)
        ) {
          skipped++;
          continue;
        }

        const ipiRate = item.ipiRate ?? 0;
        placeholders.push("(?, ?, ?, ?, ?, ?, ?, ?)");
        values.push(
          item.ncmCode,
          item.description,
          0, // iiRate
          ipiRate, // ipiRate
          0, // pisRate
          0, // cofinsRate
          0, // mercosulIiRate
          new Date() // updatedAt
        );
      }

      if (placeholders.length === 0) continue;

      try {
        const sql = `
          INSERT INTO ncm_tax_rates
            (ncmCode, description, iiRate, ipiRate, pisRate, cofinsRate, mercosulIiRate, updatedAt)
          VALUES ${placeholders.join(",")}
          ON DUPLICATE KEY UPDATE
            description = VALUES(description),
            ipiRate = VALUES(ipiRate),
            updatedAt = VALUES(updatedAt)
        `;

        const [result] = (await connection.execute(sql, values)) as any[];
        inserted += result.affectedRows || 0;
        updated += result.changedRows || 0;
      } catch (error) {
        console.error(`❌ Erro ao processar batch ${i}:`, (error as any).message);
        errors++;
      }

      // Progress
      const progress = Math.min(i + 1000, tipiData.length);
      console.log(
        `⏳ Processados: ${progress}/${tipiData.length} (I: ${inserted}, U: ${updated}, E: ${errors})`
      );
    }

    console.log("\n✅ Importação Concluída!");
    console.log(`   Inseridos: ${inserted}`);
    console.log(`   Atualizados: ${updated}`);
    console.log(`   Pulados: ${skipped}`);
    console.log(`   Erros: ${errors}`);

    // Verificar total
    const [rows] = (await connection.execute(
      "SELECT COUNT(*) as total FROM ncm_tax_rates"
    )) as any[];
    const total = rows[0].total;

    console.log(`\n📈 Total na tabela ncm_tax_rates: ${total}`);

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

importTaxTablesDirect();
