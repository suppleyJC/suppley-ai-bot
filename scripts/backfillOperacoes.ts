/**
 * Backfill de Operações — cria operações retroativas a partir dos registros
 * que já existem soltos (import_calculations e quotations), para que o Kanban
 * nasça povoado e o histórico ganhe uma linha do tempo.
 *
 * USO:
 *   pnpm tsx scripts/backfillOperacoes.ts            # dry-run (só mostra)
 *   pnpm tsx scripts/backfillOperacoes.ts --apply    # grava de verdade
 *
 * Estratégia: cada cálculo de importação vira uma operação no estágio "analyze"
 * (já houve cotação + cálculo). Se o cálculo referencia uma cotação, ela é
 * vinculada e um evento de cotação é criado. Idempotente: pula cálculos que já
 * têm operação (marca via evento com refTipo/refId).
 */
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  operacoes, operacaoEventos, operacaoEstagios,
  importCalculations, quotations,
} from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = await getDb();
  if (!db) { console.error("Sem DATABASE_URL."); process.exit(1); }

  const calcs = await db.select().from(importCalculations).orderBy(importCalculations.id);
  console.log(`${calcs.length} cálculos encontrados.`);

  // Já existe operação para este cálculo? (evento com refTipo import_calculations)
  const existing = await db.select({ refId: operacaoEventos.refId })
    .from(operacaoEventos)
    .where(eq(operacaoEventos.refTipo, "import_calculations"));
  const done = new Set(existing.map((e) => e.refId));

  let created = 0, skipped = 0;
  const year = new Date().getFullYear();
  // Sequência inicial a partir do maior código existente
  const last = await db.select({ codigo: operacoes.codigo }).from(operacoes)
    .orderBy(operacoes.codigo);
  let seq = last.length
    ? Math.max(...last.map((r) => parseInt(String(r.codigo).split("-")[2] || "0", 10))) + 1
    : 1;

  for (const c of calcs) {
    if (done.has(c.id)) { skipped++; continue; }
    const codigo = `OP-${year}-${String(seq).padStart(4, "0")}`;
    const titulo = `${c.productName} — ${c.originCountry ?? "origem"} → ${c.destinationState ?? "BR"}`;

    if (!APPLY) {
      console.log(`[dry] ${codigo}  ${titulo}  (calc #${c.id}${c.quotationId ? `, cot #${c.quotationId}` : ""})`);
      seq++; created++;
      continue;
    }

    const [res] = await db.insert(operacoes).values({
      userId: c.userId, codigo, titulo,
      clienteNome: null,
      fornecedorId: c.supplierId ?? null,
      cotacaoVencedoraId: c.quotationId ?? null,
      calculoId: c.id,
      estagioAtual: "analyze",
      status: "ativa",
      regimeTributario: null,
      origemPais: c.originCountry ?? null,
    });
    const opId = (res as any).insertId as number;

    // Trilho de estágios: demand→source→analyze (os dois primeiros já cumpridos)
    await db.insert(operacaoEstagios).values([
      { operacaoId: opId, estagio: "demand", gateCumprido: 1 },
      { operacaoId: opId, estagio: "source", gateCumprido: 1 },
      { operacaoId: opId, estagio: "analyze" },
    ]);

    // Eventos retroativos
    await db.insert(operacaoEventos).values({
      operacaoId: opId, tipo: "operacao_criada", estagio: "analyze", autor: "sistema",
      titulo: `Operação ${codigo} (backfill)`, refTipo: "import_calculations", refId: c.id,
    });
    if (c.quotationId) {
      await db.insert(operacaoEventos).values({
        operacaoId: opId, tipo: "cotacao_recebida", estagio: "source",
        refTipo: "quotations", refId: c.quotationId, autor: "sistema",
        titulo: "Cotação vinculada (backfill)",
      });
    }
    await db.insert(operacaoEventos).values({
      operacaoId: opId, tipo: "calculo_executado", estagio: "analyze",
      refTipo: "import_calculations", refId: c.id, autor: "sistema",
      titulo: "Cálculo de viabilidade (backfill)",
    });

    created++; seq++;
  }

  console.log(`\n${APPLY ? "✅ Aplicado" : "Dry-run"}: ${created} operações ${APPLY ? "criadas" : "seriam criadas"}, ${skipped} já existiam.`);
  if (!APPLY) console.log("Rode com --apply para gravar.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
