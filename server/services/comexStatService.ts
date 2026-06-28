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

/** POST no Comex Stat; retorna a lista de linhas (tolerante ao formato). */
async function queryComex(body: unknown): Promise<ComexRow[]> {
  try {
    const resp = await fetch(COMEXSTAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return [];
    const json: any = await resp.json();
    const list = json?.data?.list ?? json?.list ?? json?.data ?? [];
    return Array.isArray(list) ? (list as ComexRow[]) : [];
  } catch {
    return [];
  }
}

function montarBody(fluxo: Fluxo, ncm8: string, from: string, to: string, comPais: boolean) {
  return {
    flow: fluxo,
    monthDetail: false,
    period: { from, to },
    filters: [{ filter: "ncm", values: [Number(ncm8)] }],
    details: comPais ? ["country"] : [],
    metrics: ["metricFOB", "metricKG"],
  };
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
    queryComex(montarBody(fluxo, ncm8, fromRecente, toRecente, true)),
    queryComex(montarBody(fluxo, ncm8, fromAnterior, toAnterior, false)),
  ]);

  return agregarComex(ncm8, fluxo, recente, anterior);
}
