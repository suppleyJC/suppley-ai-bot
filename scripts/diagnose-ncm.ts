/**
 * Script de diagnóstico: verifica se os dados NCM foram carregados corretamente
 * USO: pnpm tsx scripts/diagnose-ncm.ts
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { ncmTaxRates } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("[Diagnóstico] Verificando dados NCM no banco...\n");

  const db = await getDb();
  if (!db) {
    console.error("❌ Não conseguiu conectar ao banco de dados");
    process.exit(1);
  }

  try {
    // 1. Contar total de NCMs
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(ncmTaxRates);
    const total = Number(totalResult[0]?.count || 0);
    console.log(`📊 Total de NCMs no banco: ${total}`);

    // 2. Buscar NCM específico 73084000
    const ncm73084000 = await db
      .select()
      .from(ncmTaxRates)
      .where(eq(ncmTaxRates.ncmCode, "73084000"))
      .limit(1);

    if (ncm73084000.length > 0) {
      const record = ncm73084000[0];
      console.log(`\n✅ NCM 73084000 encontrado:`);
      console.log(`   Descrição: ${record.description?.substring(0, 100)}...`);
      console.log(`   II Rate (bp): ${record.iiRate} (${record.iiRate / 100}%)`);
      console.log(`   IPI Rate (bp): ${record.ipiRate} (${record.ipiRate / 100}%)`);
      console.log(`   PIS Rate (bp): ${record.pisRate} (${record.pisRate / 100}%)`);
      console.log(`   COFINS Rate (bp): ${record.cofinsRate} (${record.cofinsRate / 100}%)`);
      console.log(`   Mercosul II (bp): ${record.mercosulIiRate} (${record.mercosulIiRate / 100}%)`);
      console.log(`   Notas: ${record.notes}`);
    } else {
      console.log(`\n❌ NCM 73084000 NÃO encontrado no banco`);
    }

    // 3. Buscar NCMs do capítulo 73 (mesmo capítulo)
    console.log(`\n🔍 Amostra de NCMs do capítulo 73:`);
    const chapter73 = await db
      .select()
      .from(ncmTaxRates)
      .where(sql`ncmCode LIKE '73%'`)
      .limit(5);

    if (chapter73.length > 0) {
      chapter73.forEach((ncm) => {
        console.log(
          `   ${ncm.ncmCode}: II=${ncm.iiRate / 100}% IPI=${ncm.ipiRate / 100}%`
        );
      });
    } else {
      console.log("   Nenhum NCM do capítulo 73 encontrado");
    }

    // 4. Verificar distribuição de alíquotas II
    console.log(`\n📈 Distribuição de alíquotas II:`);
    const iiDistribution = await db
      .select({
        iiRate: ncmTaxRates.iiRate,
        count: sql<number>`count(*)`,
      })
      .from(ncmTaxRates)
      .groupBy(ncmTaxRates.iiRate)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    iiDistribution.forEach((row) => {
      const pct = (row.iiRate / 100).toFixed(1);
      console.log(`   ${pct}%: ${row.count} NCMs`);
    });

    // 5. Verificar se há dados reais (não padrão)
    console.log(`\n🎯 Verificação de dados reais vs padrão:`);
    const nonDefaultII = await db
      .select({ count: sql<number>`count(*)` })
      .from(ncmTaxRates)
      .where(sql`iiRate NOT IN (0, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 3500)`)
      .limit(1);

    const nonDefaultCount = Number(nonDefaultII[0]?.count || 0);
    console.log(`   NCMs com alíquota II não-padrão: ${nonDefaultCount}`);

    if (nonDefaultCount > 0) {
      console.log(`   ✅ Parece que dados reais foram carregados!`);
    } else {
      console.log(`   ⚠️  Apenas alíquotas padrão encontradas (possível que dados reais não foram carregados)`);
    }

  } catch (error) {
    console.error("❌ Erro ao diagnosticar:", error);
    process.exit(1);
  }

  console.log("\n[Diagnóstico] Concluído\n");
  process.exit(0);
}

main();
