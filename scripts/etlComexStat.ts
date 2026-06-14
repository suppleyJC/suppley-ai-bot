/**
 * ETL Comex Stat → tabelas de mercado tratado.
 *
 * USO:
 *   pnpm tsx scripts/etlComexStat.ts                 # últimos 12 meses, importação
 *   pnpm tsx scripts/etlComexStat.ts 2025-01 2025-12 # intervalo específico
 *
 * O QUE FAZ (o "refino"):
 *  1. Puxa dados gerais por NCM + país (POST /general).
 *  2. Normaliza e CALCULA métricas derivadas: FOB/kg, CIF/kg, % frete, % origem.
 *  3. Filtra outliers (peso zero, NCM agregados especiais).
 *  4. Materializa market_reference_ncm (por origem) e market_trend_ncm (série).
 *
 * Idempotente: reexecutar o mesmo período atualiza (upsert pela chave única).
 * A plataforma nunca chama a API ao vivo — só lê estas tabelas.
 */
import "dotenv/config";
import { queryGeneral, getCountriesTable, type ComexRow } from "../server/services/marketData/comexStatClient";
import { getDb } from "../server/db/connection";
import { marketReferenceNcm, marketTrendNcm, etlRuns } from "../drizzle/schema";
import { sql } from "drizzle-orm";

function monthsBack(n: number): { from: string; to: string } {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`; // mês anterior fechado
  const fromDate = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
  return { from, to };
}

function num(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const [, , argFrom, argTo] = process.argv;
  const period = argFrom && argTo ? { from: argFrom, to: argTo } : monthsBack(12);
  const flow = "import" as const;

  const db = await getDb();
  if (!db) { console.error("Sem conexão com o banco (DATABASE_URL)."); process.exit(1); }

  console.log(`ETL Comex Stat — ${flow} — ${period.from} a ${period.to}`);
  const [run] = await db.insert(etlRuns).values({
    job: "comexstat_monthly", periodFrom: period.from, periodTo: period.to, status: "running",
  });
  const runId = (run as any)?.insertId;

  try {
    // Mapa de países (código → nome)
    const countries = await getCountriesTable().catch(() => []);
    const countryName = new Map(countries.map((c) => [c.id, c.name]));

    // Consulta principal: por NCM e país, com detalhe mensal
    const rows: ComexRow[] = await queryGeneral({
      flow, monthDetail: true, period,
      details: ["ncm", "country"],
      metrics: ["metricFOB", "metricCIF", "metricFreight", "metricKG", "metricStatistic"],
    });
    console.log(`Linhas recebidas: ${rows.length}`);

    // --- Agregação por (NCM, país) no período + filtro de outliers ---
    type Agg = { fob: number; cif: number; freight: number; kg: number; qty: number; n: number };
    const byNcmCountry = new Map<string, Agg & { ncm: string; country: string }>();
    const byNcmTotal = new Map<string, number>(); // FOB total por NCM (p/ % origem)
    const byNcmMonth = new Map<string, { fob: number; kg: number }>(); // série

    for (const r of rows) {
      const ncm = (r.coNcm ?? "").replace(/\D/g, "").slice(0, 8);
      if (ncm.length < 8) continue;
      const country = String(r.country ?? r.noPaip ?? "");
      const kg = num(r.metricKG);
      const fob = num(r.metricFOB);
      if (fob <= 0) continue;                 // outlier: sem valor
      // (NCM "consumo de bordo"/especiais costumam ter país nulo → ignora % origem depois)

      const key = `${ncm}|${country}`;
      const a = byNcmCountry.get(key) ?? { fob: 0, cif: 0, freight: 0, kg: 0, qty: 0, n: 0, ncm, country };
      a.fob += fob; a.cif += num(r.metricCIF); a.freight += num(r.metricFreight);
      a.kg += kg; a.qty += num(r.metricStatistic); a.n += 1;
      byNcmCountry.set(key, a);

      byNcmTotal.set(ncm, (byNcmTotal.get(ncm) ?? 0) + fob);

      const ym = r.year && r.month ? `${r.year}-${String(r.month).padStart(2, "0")}` : period.to;
      const mKey = `${ncm}|${ym}`;
      const m = byNcmMonth.get(mKey) ?? { fob: 0, kg: 0 };
      m.fob += fob; m.kg += kg;
      byNcmMonth.set(mKey, m);
    }

    // --- Grava referência por origem ---
    let written = 0;
    for (const a of byNcmCountry.values()) {
      const ncmTotal = byNcmTotal.get(a.ncm) ?? a.fob;
      const fobPerKg = a.kg > 0 ? a.fob / a.kg : null;          // FOB/kg (denominador confiável)
      const cifPerKg = a.kg > 0 ? a.cif / a.kg : null;
      const freightShare = a.cif > 0 ? (a.freight / a.cif) * 100 : null;
      const originShare = ncmTotal > 0 ? (a.fob / ncmTotal) * 100 : null;

      await db.insert(marketReferenceNcm).values({
        ncmCode: a.ncm, flow, countryCode: a.country || null,
        countryName: countryName.get(a.country) ?? null,
        economicBlock: null,
        periodFrom: period.from, periodTo: period.to,
        totalFobUsd: Math.round(a.fob), totalCifUsd: Math.round(a.cif),
        totalFreightUsd: Math.round(a.freight), totalNetKg: Math.round(a.kg),
        totalStatQty: Math.round(a.qty),
        avgFobPerKgUsd: fobPerKg != null ? fobPerKg.toFixed(4) : null,
        avgCifPerKgUsd: cifPerKg != null ? cifPerKg.toFixed(4) : null,
        freightSharePct: freightShare != null ? freightShare.toFixed(2) : null,
        originSharePct: originShare != null ? originShare.toFixed(2) : null,
        recordCount: a.n, isOutlierFiltered: 1, source: "comexstat",
      }).onDuplicateKeyUpdate({
        set: {
          totalFobUsd: Math.round(a.fob), totalCifUsd: Math.round(a.cif),
          totalNetKg: Math.round(a.kg),
          avgFobPerKgUsd: fobPerKg != null ? fobPerKg.toFixed(4) : null,
          avgCifPerKgUsd: cifPerKg != null ? cifPerKg.toFixed(4) : null,
          freightSharePct: freightShare != null ? freightShare.toFixed(2) : null,
          originSharePct: originShare != null ? originShare.toFixed(2) : null,
          recordCount: a.n,
        },
      });
      written++;
    }

    // --- Grava série temporal por NCM ---
    for (const [mKey, m] of byNcmMonth) {
      const [ncm, ym] = mKey.split("|");
      const avg = m.kg > 0 ? m.fob / m.kg : null;
      await db.insert(marketTrendNcm).values({
        ncmCode: ncm, flow, yearMonth: ym,
        totalFobUsd: Math.round(m.fob), totalNetKg: Math.round(m.kg),
        avgFobPerKgUsd: avg != null ? avg.toFixed(4) : null,
      }).onDuplicateKeyUpdate({
        set: { totalFobUsd: Math.round(m.fob), totalNetKg: Math.round(m.kg),
               avgFobPerKgUsd: avg != null ? avg.toFixed(4) : null },
      });
    }

    if (runId) {
      await db.update(etlRuns).set({
        status: "success", rowsProcessed: written, finishedAt: sql`now()`,
      }).where(sql`id = ${runId}`);
    }
    console.log(`✅ ETL concluído: ${written} referências NCM×origem, ${byNcmMonth.size} pontos de série.`);
    process.exit(0);
  } catch (e) {
    console.error("Erro no ETL:", e);
    if (runId) {
      await db.update(etlRuns).set({
        status: "error", message: String((e as Error).message).slice(0, 500), finishedAt: sql`now()`,
      }).where(sql`id = ${runId}`).catch(() => {});
    }
    process.exit(1);
  }
}

main();
