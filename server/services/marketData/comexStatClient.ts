/**
 * Comex Stat API Client — fonte oficial gratuita do MDIC/Siscomex.
 *
 * Base: https://api-comexstat.mdic.gov.br
 * Dados ESTATÍSTICOS AGREGADOS (não transacionais): não há nome de empresa.
 * Para nome de importador/fornecedor é necessária a camada paga (ver ../tradeData).
 *
 * A API atualiza mensalmente. Este cliente é usado pelo ETL (scripts/etlComexStat.ts),
 * NUNCA no caminho do request do usuário — a plataforma consulta as tabelas tratadas.
 */

const BASE_URL = process.env.COMEXSTAT_BASE_URL || "https://api-comexstat.mdic.gov.br";

export type Flow = "import" | "export";

export type ComexMetric =
  | "metricFOB"
  | "metricKG"
  | "metricStatistic"
  | "metricFreight"   // só importação
  | "metricInsurance" // só importação
  | "metricCIF";      // só importação

export type ComexDetail = "country" | "state" | "ncm" | "economicBlock" | "via" | "urf";

export interface ComexQuery {
  flow: Flow;
  monthDetail: boolean;
  period: { from: string; to: string }; // "YYYY-MM"
  filters?: Array<{ filter: string; values: (number | string)[] }>;
  details: ComexDetail[];
  metrics: ComexMetric[];
}

export interface ComexRow {
  // chaves de agrupamento (presentes conforme `details`)
  coNcm?: string;
  country?: string;
  noPaip?: string;
  state?: string;
  year?: string;
  month?: string;
  // métricas (strings numéricas na origem)
  metricFOB?: string;
  metricKG?: string;
  metricStatistic?: string;
  metricFreight?: string;
  metricInsurance?: string;
  metricCIF?: string;
  [k: string]: string | undefined;
}

interface ComexResponse {
  data?: { list?: ComexRow[] };
  success?: boolean;
  message?: string | null;
}

async function postJson<T>(path: string, body: unknown, lang = "pt"): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}?language=${lang}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ComexStat ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`ComexStat ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Consulta principal de dados gerais (POST /general). */
export async function queryGeneral(q: ComexQuery): Promise<ComexRow[]> {
  // Guard: métricas de importação não valem para exportação
  if (q.flow === "export") {
    const importOnly: ComexMetric[] = ["metricFreight", "metricInsurance", "metricCIF"];
    q = { ...q, metrics: q.metrics.filter((m) => !importOnly.includes(m)) };
  }
  const resp = await postJson<ComexResponse>("/general", q);
  return resp.data?.list ?? [];
}

/** Data da última atualização disponível (GET /general/dates/updated). */
export async function getLastUpdate(): Promise<string | null> {
  try {
    const r = await getJson<{ data?: { updated?: string } }>("/general/dates/updated");
    return r.data?.updated ?? null;
  } catch {
    return null;
  }
}

/** Anos disponíveis (GET /general/dates/years). */
export async function getAvailableYears(): Promise<{ min: string; max: string } | null> {
  try {
    const r = await getJson<{ data?: { min?: string; max?: string } }>("/general/dates/years");
    if (r.data?.min && r.data?.max) return { min: r.data.min, max: r.data.max };
    return null;
  } catch {
    return null;
  }
}

/** Tabela de países (GET /tables/countries) — para normalização de códigos. */
export async function getCountriesTable(search?: string): Promise<Array<{ id: string; name: string }>> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  const r = await getJson<{ data?: Array<Record<string, string>> }>(`/tables/countries${q}`);
  return (r.data ?? []).map((c) => ({
    id: String(c.coPais ?? c.id ?? ""),
    name: String(c.noPais ?? c.name ?? ""),
  }));
}

/** Tabela de vias de transporte (GET /tables/ways). */
export async function getWaysTable(): Promise<Array<{ id: string; name: string }>> {
  const r = await getJson<{ data?: Array<Record<string, string>> }>(`/tables/ways`);
  return (r.data ?? []).map((w) => ({
    id: String(w.coVia ?? w.id ?? ""),
    name: String(w.noVia ?? w.name ?? ""),
  }));
}

export const comexStatClient = {
  queryGeneral,
  getLastUpdate,
  getAvailableYears,
  getCountriesTable,
  getWaysTable,
};
