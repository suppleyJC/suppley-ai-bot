/**
 * Market Reference Service — leitura das tabelas tratadas (rápido, ao vivo).
 *
 * Usado pela calculadora e pela Excambia para responder coisas como:
 *  "a média de importação desse NCM da China nos últimos 12 meses foi US$ X/kg;
 *   sua cotação está Y% acima/abaixo."
 *
 * NUNCA chama a API Comex Stat — isso é trabalho do ETL (scripts/etlComexStat.ts).
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../db/connection";
import { marketReferenceNcm, marketTrendNcm } from "../../../drizzle/schema";

export interface PriceBenchmark {
  ncmCode: string;
  flow: "import" | "export";
  avgFobPerKgUsd: number | null;
  avgCifPerKgUsd: number | null;
  byOrigin: Array<{
    countryCode: string | null;
    countryName: string | null;
    economicBlock: string | null;
    avgFobPerKgUsd: number | null;
    originSharePct: number | null;
  }>;
  periodFrom: string | null;
  periodTo: string | null;
  hasData: boolean;
}

function cleanNcm(ncm: string) {
  return ncm.replace(/\D/g, "").slice(0, 8);
}

/** Benchmark de preço por NCM, opcionalmente filtrando por país de origem. */
export async function getPriceBenchmark(
  ncm: string,
  opts: { flow?: "import" | "export"; countryCode?: string } = {}
): Promise<PriceBenchmark> {
  const db = await getDb();
  const flow = opts.flow ?? "import";
  const ncmCode = cleanNcm(ncm);
  const empty: PriceBenchmark = {
    ncmCode, flow, avgFobPerKgUsd: null, avgCifPerKgUsd: null,
    byOrigin: [], periodFrom: null, periodTo: null, hasData: false,
  };
  if (!db) return empty;

  const rows = await db
    .select()
    .from(marketReferenceNcm)
    .where(and(eq(marketReferenceNcm.ncmCode, ncmCode), eq(marketReferenceNcm.flow, flow)))
    .orderBy(desc(marketReferenceNcm.periodTo))
    .limit(200);

  if (rows.length === 0) return empty;

  const filtered = opts.countryCode
    ? rows.filter((r) => r.countryCode === opts.countryCode)
    : rows;

  const toNum = (v: unknown) => (v == null ? null : Number(v));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const fobVals = filtered.map((r) => toNum(r.avgFobPerKgUsd)).filter((x): x is number => x != null);
  const cifVals = filtered.map((r) => toNum(r.avgCifPerKgUsd)).filter((x): x is number => x != null);

  return {
    ncmCode, flow,
    avgFobPerKgUsd: avg(fobVals),
    avgCifPerKgUsd: avg(cifVals),
    byOrigin: rows
      .filter((r) => r.countryCode)
      .slice(0, 12)
      .map((r) => ({
        countryCode: r.countryCode,
        countryName: r.countryName,
        economicBlock: r.economicBlock,
        avgFobPerKgUsd: toNum(r.avgFobPerKgUsd),
        originSharePct: toNum(r.originSharePct),
      })),
    periodFrom: rows[rows.length - 1]?.periodFrom ?? null,
    periodTo: rows[0]?.periodTo ?? null,
    hasData: true,
  };
}

/**
 * Compara a cotação recebida com a referência de mercado.
 * Retorna o desvio percentual (positivo = acima da média).
 */
export async function compareQuoteToMarket(
  ncm: string,
  quoteUnitPriceUsd: number,
  unitWeightKg: number,
  countryCode?: string
): Promise<{ benchmark: PriceBenchmark; deviationPct: number | null; verdict: string }> {
  const benchmark = await getPriceBenchmark(ncm, { countryCode });
  if (!benchmark.hasData || !benchmark.avgFobPerKgUsd || unitWeightKg <= 0) {
    return { benchmark, deviationPct: null, verdict: "sem_referencia" };
  }
  const quotePerKg = quoteUnitPriceUsd / unitWeightKg;
  const deviationPct = ((quotePerKg - benchmark.avgFobPerKgUsd) / benchmark.avgFobPerKgUsd) * 100;
  const verdict =
    deviationPct <= -10 ? "abaixo_mercado" :
    deviationPct >= 10 ? "acima_mercado" : "alinhado";
  return { benchmark, deviationPct, verdict };
}

/** Série temporal de preço/kg por NCM — para gráfico de tendência e sazonalidade. */
export async function getPriceTrend(ncm: string, sinceYearMonth?: string) {
  const db = await getDb();
  if (!db) return [];
  const ncmCode = cleanNcm(ncm);
  const conds = [eq(marketTrendNcm.ncmCode, ncmCode), eq(marketTrendNcm.flow, "import")];
  if (sinceYearMonth) conds.push(gte(marketTrendNcm.yearMonth, sinceYearMonth));
  return db.select().from(marketTrendNcm).where(and(...conds)).orderBy(marketTrendNcm.yearMonth);
}
