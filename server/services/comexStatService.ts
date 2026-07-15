/**
 * Comex Stat Service — estatísticas OFICIAIS de comércio exterior por NCM.
 *
 * Fonte: API pública do Comex Stat (MDIC/SECEX) — api-comexstat.mdic.gov.br.
 * Dados de importação/exportação do Brasil: valor FOB (US$), peso (kg) e países.
 *
 * Para a Excambia, isso responde com FONTE OFICIAL:
 *  - quanto o Brasil importou de um NCM (volume e valor);
 *  - PREÇO MÉDIO de importação em US$/kg — benchmark direto contra o FOB que o
 *    fornecedor cotou (caro? barato? na média do país?);
 *  - principais países de origem;
 *  - tendência do preço médio (ano recente × ano anterior).
 *
 * GUARDRAIL: é INTELIGÊNCIA (apoio à decisão), não cálculo fiscal. O custo
 * nacionalizado definitivo continua saindo do motor certificado (montar_calculo).
 *
 * A camada de rede e a de agregação estão separadas de propósito: `agregarComex`
 * é pura (testável) e `consultarComexPorNcm` só faz HTTP + delega.
 */

const COMEXSTAT_URL = "https://api-comexstat.mdic.gov.br/general";

// A base costuma ter ~2 meses de defasagem na consolidação.
const DEFASAGEM_MESES = 2;
const JANELA_MESES = 12;
const LIMIAR_PCT = 2; // ±2% define alta/baixa do preço médio

export type Fluxo = "import" | "export";

export interface ComexOrigem {
  pais: string;
  fobUsd: number;
  kg: number;
  precoMedioUsdKg: number | null;
}

export interface ComexResumo {
  ncm: string;
  fluxo: Fluxo;
  janelaMeses: number;
  totalFobUsd: number;
  totalKg: number;
  precoMedioUsdKg: number | null;
  /** Variação do valor FOB: janela recente × janela anterior (12m vs 12m). */
  variacaoFobPct: number | null;
  /** Variação do preço médio US$/kg: recente × anterior. */
  variacaoPrecoPct: number | null;
  tendenciaPreco: "alta" | "baixa" | "estavel" | "indef";
  topOrigens: ComexOrigem[];
  /** false quando a fonte não retornou nada (NCM sem fluxo ou API fora). */
  disponivel: boolean;
}

/** Linha bruta da API (campos tolerantes a variações de nome). */
export interface ComexRow {
  country?: string;
  noPaispt?: string;
  pais?: string;
  metricFOB?: string | number;
  metricKG?: string | number;
  [k: string]: unknown;
}

/** Converte "1.234,56"/"1234.56"/number → number; vazio/inválido → 0. */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // remove separador de milhar e normaliza decimal
  const n = Number(s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function paisDe(r: ComexRow): string {
  return String(r.country ?? r.noPaispt ?? r.pais ?? "—").trim() || "—";
}

/** YYYY-MM correspondente a `meses` atrás de `base`. */
export function ymMinus(base: Date, meses: number): string {
  const d = new Date(base.getFullYear(), base.getMonth() - meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * AGREGAÇÃO PURA — recebe as duas janelas brutas (recente e anterior) e calcula
 * totais, preço médio, variações, tendência e top origens. Sem rede: testável.
 */
export function agregarComex(
  ncm: string,
  fluxo: Fluxo,
  recente: ComexRow[],
  anterior: ComexRow[],
): ComexResumo {
  const base: ComexResumo = {
    ncm, fluxo, janelaMeses: JANELA_MESES,
    totalFobUsd: 0, totalKg: 0, precoMedioUsdKg: null,
    variacaoFobPct: null, variacaoPrecoPct: null, tendenciaPreco: "indef",
    topOrigens: [], disponivel: false,
  };
  if (recente.length === 0 && anterior.length === 0) return base;

  let totalFob = 0;
  let totalKg = 0;
  const porPais = new Map<string, { fob: number; kg: number }>();
  for (const r of recente) {
    const fob = num(r.metricFOB);
    const kg = num(r.metricKG);
    totalFob += fob;
    totalKg += kg;
    const p = paisDe(r);
    const cur = porPais.get(p) ?? { fob: 0, kg: 0 };
    cur.fob += fob;
    cur.kg += kg;
    porPais.set(p, cur);
  }

  const prevFob = anterior.reduce((s, r) => s + num(r.metricFOB), 0);
  const prevKg = anterior.reduce((s, r) => s + num(r.metricKG), 0);

  const precoMedio = totalKg > 0 ? totalFob / totalKg : null;
  const prevPreco = prevKg > 0 ? prevFob / prevKg : null;
  const variacaoFobPct = prevFob > 0 ? ((totalFob - prevFob) / prevFob) * 100 : null;
  const variacaoPrecoPct =
    precoMedio != null && prevPreco ? ((precoMedio - prevPreco) / prevPreco) * 100 : null;

  const tendenciaPreco: ComexResumo["tendenciaPreco"] =
    variacaoPrecoPct == null ? "indef"
      : variacaoPrecoPct > LIMIAR_PCT ? "alta"
      : variacaoPrecoPct < -LIMIAR_PCT ? "baixa"
      : "estavel";

  const topOrigens: ComexOrigem[] = Array.from(porPais.entries())
    .map(([pais, v]) => ({ pais, fobUsd: v.fob, kg: v.kg, precoMedioUsdKg: v.kg > 0 ? v.fob / v.kg : null }))
    .sort((a, b) => b.fobUsd - a.fobUsd)
    .slice(0, 5);

  return {
    ncm, fluxo, janelaMeses: JANELA_MESES,
    totalFobUsd: totalFob, totalKg: totalKg, precoMedioUsdKg: precoMedio,
    variacaoFobPct, variacaoPrecoPct, tendenciaPreco, topOrigens,
    disponivel: true,
  };
}

async function postComex(body: unknown): Promise<ComexRow[]> {
  const resp = await fetch(COMEXSTAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return [];
  const json: any = await resp.json();
  const list = json?.data?.list ?? json?.list ?? json?.data ?? [];
  return Array.isArray(list) ? (list as ComexRow[]) : [];
}

/**
 * Corpos de request em dois formatos conhecidos da API do Comex Stat (o schema
 * mudou entre versões). Tentamos o atual (filterList/detailDatabase/metricList)
 * e, se vier vazio, o alternativo (filters/details/metrics).
 */
function bodiesComex(fluxo: Fluxo, ncm8: string, from: string, to: string, comPais: boolean): unknown[] {
  const atual = {
    flow: fluxo,
    monthDetail: false,
    period: { from, to },
    filterList: [{ id: "ncm", text: ncm8, item: [ncm8] }],
    detailDatabase: comPais ? [{ id: "country", text: "País" }] : [],
    metricList: ["metricFOB", "metricKG"],
    langDefault: "pt",
  };
  const alternativo = {
    flow: fluxo,
    monthDetail: false,
    period: { from, to },
    filters: [{ filter: "ncm", values: [Number(ncm8)] }],
    details: comPais ? ["country"] : [],
    metrics: ["metricFOB", "metricKG"],
  };
  return [atual, alternativo];
}

/** Consulta o Comex Stat tentando os formatos conhecidos; falha graciosa. */
async function queryComex(fluxo: Fluxo, ncm8: string, from: string, to: string, comPais: boolean): Promise<ComexRow[]> {
  for (const body of bodiesComex(fluxo, ncm8, from, to, comPais)) {
    try {
      const rows = await postComex(body);
      if (rows.length) return rows;
    } catch {
      /* tenta o próximo formato */
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// SÉRIE MENSAL do preço médio (US$/kg) por NCM — insumo da análise PREDITIVA.
// ---------------------------------------------------------------------------

export interface PontoMensalComex {
  ym: string;              // "YYYY-MM"
  fobUsd: number;
  kg: number;
  precoMedioUsdKg: number | null;
}

/** Extrai "YYYY-MM" de uma linha mensal (tolerante a variações de schema). */
function ymDe(r: ComexRow): string | null {
  const ano = (r as any).year ?? (r as any).coAno ?? (r as any).ano;
  const mes = (r as any).monthNumber ?? (r as any).coMes ??
    (r as any).month ?? (r as any).mes;
  const a = Number(ano);
  const m = Number(mes);
  if (Number.isFinite(a) && a > 1990 && Number.isFinite(m) && m >= 1 && m <= 12) {
    return `${a}-${String(m).padStart(2, "0")}`;
  }
  // Alguns schemas devolvem "period"/"date" como "YYYY-MM" direto.
  const p = String((r as any).period ?? (r as any).date ?? "");
  return /^\d{4}-\d{2}/.test(p) ? p.slice(0, 7) : null;
}

/** Agregação pura (testável): linhas mensais → série ordenada de US$/kg. */
export function agregarSerieMensal(rows: ComexRow[]): PontoMensalComex[] {
  const porMes = new Map<string, { fob: number; kg: number }>();
  for (const r of rows) {
    const ym = ymDe(r);
    if (!ym) continue;
    const acc = porMes.get(ym) ?? { fob: 0, kg: 0 };
    acc.fob += num(r.metricFOB);
    acc.kg += num(r.metricKG);
    porMes.set(ym, acc);
  }
  return Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, { fob, kg }]) => ({
      ym, fobUsd: fob, kg,
      precoMedioUsdKg: kg > 0 ? fob / kg : null,
    }));
}

/**
 * Série MENSAL de preço médio de importação (US$/kg) do NCM nos últimos
 * `meses` (default 24, respeitando a defasagem de consolidação). Falha
 * graciosa (lista vazia).
 */
export async function serieMensalPrecoNcm(input: {
  ncm: string;
  fluxo?: Fluxo;
  meses?: number;
}): Promise<PontoMensalComex[]> {
  const fluxo: Fluxo = input.fluxo ?? "import";
  const ncm8 = (input.ncm || "").replace(/\D/g, "").slice(0, 8);
  if (ncm8.length !== 8) return [];

  const meses = Math.min(48, Math.max(6, input.meses ?? 24));
  const now = new Date();
  const to = ymMinus(now, DEFASAGEM_MESES);
  const from = ymMinus(now, DEFASAGEM_MESES + meses - 1);

  // Mesmos dois formatos de body, com monthDetail LIGADO.
  const bodies = bodiesComex(fluxo, ncm8, from, to, false).map((b) => ({
    ...(b as Record<string, unknown>),
    monthDetail: true,
  }));
  for (const body of bodies) {
    try {
      const rows = await postComex(body);
      const serie = agregarSerieMensal(rows);
      if (serie.length >= 4) return serie;
    } catch {
      /* tenta o próximo formato */
    }
  }
  return [];
}

/**
 * Consulta o Comex Stat para um NCM: importação (padrão) ou exportação dos
 * últimos 12 meses, comparados com os 12 meses anteriores. Falha graciosa
 * (retorna disponivel=false) se a fonte não responder.
 */
export async function consultarComexPorNcm(input: { ncm: string; fluxo?: Fluxo }): Promise<ComexResumo> {
  const fluxo: Fluxo = input.fluxo ?? "import";
  const ncm8 = (input.ncm || "").replace(/\D/g, "").slice(0, 8);
  if (ncm8.length !== 8) {
    return agregarComex(ncm8, fluxo, [], []);
  }

  const now = new Date();
  const toRecente = ymMinus(now, DEFASAGEM_MESES);
  const fromRecente = ymMinus(now, DEFASAGEM_MESES + JANELA_MESES - 1);
  const toAnterior = ymMinus(now, DEFASAGEM_MESES + JANELA_MESES);
  const fromAnterior = ymMinus(now, DEFASAGEM_MESES + 2 * JANELA_MESES - 1);

  const [recente, anterior] = await Promise.all([
    queryComex(fluxo, ncm8, fromRecente, toRecente, true),
    queryComex(fluxo, ncm8, fromAnterior, toAnterior, false),
  ]);

  return agregarComex(ncm8, fluxo, recente, anterior);
}
