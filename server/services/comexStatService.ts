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

/** Teto de espera por chamada: o chat não pode ficar pendurado numa fonte lenta. */
const TIMEOUT_MS = 20_000;

async function postComex(body: unknown): Promise<ComexRow[]> {
  const resp = await fetch(COMEXSTAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
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

// ---------------------------------------------------------------------------
// DIMENSIONAMENTO DE MERCADO — a consulta parametrizada de verdade.
//
// Responde, com número oficial e auditável, as quatro perguntas que dimensionam
// um mercado de importação:
//   1. total importado por ANO (toneladas e US$), série plurianual;
//   2. decomposição por PAÍS de origem (com países fixados no ranking);
//   3. decomposição por UF de desembaraço;
//   4. PREÇO MÉDIO por tonelada, por origem.
//
// Diferente de `consultarComexPorNcm` (janela fixa de 12 meses, 1 NCM, top-5
// países), aqui o recorte é livre: N NCMs somadas, N anos, corte por país E por
// UF, ranking completo com posição de qualquer país pedido.
//
// RIGOR: o ano corrente é PARCIAL (a base consolida com ~2 meses de defasagem).
// Um ano parcial comparado com um ano cheio produz leitura errada, então cada
// ano carrega `parcial` e `mesesCobertos` — quem apresenta é obrigado a rotular.
// ---------------------------------------------------------------------------

/** Dimensão de corte disponível na base. */
export type DetalheMercado = "pais" | "uf";

export interface MercadoLinha {
  /** Nome do país de origem ou da UF de desembaraço. */
  chave: string;
  /** Posição no ranking COMPLETO do ano (1 = maior), por valor FOB. */
  posicao: number;
  fobUsd: number;
  kg: number;
  toneladas: number;
  /** Preço médio da origem — US$ por TONELADA (o que o mercado negocia). */
  precoMedioUsdT: number | null;
  /** Participação no valor FOB total do ano, em %. */
  sharePct: number;
}

export interface MercadoAno {
  ano: number;
  /** true quando o ano ainda não fechou na base (dado parcial). */
  parcial: boolean;
  /** Quantos meses do ano estão cobertos pelo dado (12 = ano cheio). */
  mesesCobertos: number;
  fobUsd: number;
  kg: number;
  toneladas: number;
  precoMedioUsdT: number | null;
  /** Ranking por país de origem (top N + países fixados). */
  porPais: MercadoLinha[];
  /** Ranking por UF de desembaraço (top N + UFs fixadas). */
  porUf: MercadoLinha[];
  /** Nº de países/UFs no ranking completo, antes do corte top N. */
  totalPaises: number;
  totalUfs: number;
}

export interface MercadoDimensionado {
  /** NCMs efetivamente consultadas (8 dígitos). */
  ncms: string[];
  fluxo: Fluxo;
  anos: MercadoAno[];
  /** Variação do FOB do último ano × ano anterior (null se incomparável). */
  variacaoFobPct: number | null;
  /** Variação do volume (t) do último ano × ano anterior. */
  variacaoVolumePct: number | null;
  /**
   * Anos comparados na variação. Quando um deles é parcial, a comparação é
   * feita apenas se AMBOS tiverem a mesma cobertura em meses — caso contrário
   * fica null, porque comparar 12 meses com 7 meses é erro analítico.
   */
  baseComparacao: { de: number; para: number } | null;
  disponivel: boolean;
  fonte: string;
  /**
   * Anos pedidos que voltaram SEM nenhum dado. Explicitados (em vez de
   * simplesmente ausentes de `anos`) para que a omissão seja visível a quem
   * apresenta — um ano que some da tabela parece um ano que não foi pedido.
   */
  anosSemDado: number[];
  /** Preenchido quando a fonte oficial não respondeu — nunca inventar número. */
  erro?: string;
}

/** Normaliza nome de país/UF para casar "China" com "China, República Popular da". */
function normalizarChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Extrai a UF de desembaraço da linha (tolerante a variações de schema). */
function ufDe(r: ComexRow): string {
  const v =
    (r as any).state ?? (r as any).noUfpt ?? (r as any).uf ??
    (r as any).sgUf ?? (r as any).noUf;
  return String(v ?? "—").trim() || "—";
}

/**
 * Um país "destaque" casa com a linha do ranking quando um nome contém o outro.
 * Resolve "Paraguai" × "Paraguai" e "China" × "China, República Popular da".
 */
function casaDestaque(chave: string, destaque: string): boolean {
  const a = normalizarChave(chave);
  const b = normalizarChave(destaque);
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * AGREGAÇÃO PURA de um recorte (sem rede): linhas brutas → ranking com posição,
 * share e preço médio por tonelada. `destaques` força a presença de chaves
 * específicas (ex.: China e Paraguai) mesmo que caiam fora do top N, com a
 * posição REAL que ocupam no ranking completo.
 */
export function rankearMercado(
  rows: ComexRow[],
  chaveDe: (r: ComexRow) => string,
  topN: number,
  destaques: string[] = [],
): { linhas: MercadoLinha[]; total: number; fobTotal: number; kgTotal: number } {
  const acc = new Map<string, { fob: number; kg: number }>();
  for (const r of rows) {
    const k = chaveDe(r);
    const cur = acc.get(k) ?? { fob: 0, kg: 0 };
    cur.fob += num(r.metricFOB);
    cur.kg += num(r.metricKG);
    acc.set(k, cur);
  }

  const fobTotal = Array.from(acc.values()).reduce((s, v) => s + v.fob, 0);
  const kgTotal = Array.from(acc.values()).reduce((s, v) => s + v.kg, 0);

  // Ranking COMPLETO primeiro — a posição precisa refletir o universo inteiro.
  const completo: MercadoLinha[] = Array.from(acc.entries())
    .map(([chave, v]) => ({
      chave,
      posicao: 0,
      fobUsd: v.fob,
      kg: v.kg,
      toneladas: v.kg / 1000,
      precoMedioUsdT: v.kg > 0 ? v.fob / (v.kg / 1000) : null,
      sharePct: fobTotal > 0 ? (v.fob / fobTotal) * 100 : 0,
    }))
    .sort((a, b) => b.fobUsd - a.fobUsd)
    .map((l, i) => ({ ...l, posicao: i + 1 }));

  const linhas = completo.slice(0, Math.max(1, topN));

  // Fixa os destaques que ficaram de fora, preservando a posição real.
  for (const d of destaques) {
    if (linhas.some((l) => casaDestaque(l.chave, d))) continue;
    const achado = completo.find((l) => casaDestaque(l.chave, d));
    if (achado) linhas.push(achado);
  }

  return { linhas, total: completo.length, fobTotal, kgTotal };
}

/**
 * AGREGAÇÃO PURA de um ano: combina o corte por país e o corte por UF num
 * `MercadoAno` completo. Os totais do ano saem do corte por PAÍS (que é o
 * universo íntegro); o corte por UF é uma visão do mesmo total.
 */
export function agregarMercadoAno(input: {
  ano: number;
  parcial: boolean;
  mesesCobertos: number;
  rowsPais: ComexRow[];
  rowsUf: ComexRow[];
  topN: number;
  paisesDestaque?: string[];
  ufsDestaque?: string[];
}): MercadoAno {
  const pais = rankearMercado(input.rowsPais, paisDe, input.topN, input.paisesDestaque ?? []);
  const uf = rankearMercado(input.rowsUf, ufDe, input.topN, input.ufsDestaque ?? []);

  const fobUsd = pais.fobTotal;
  const kg = pais.kgTotal;
  const toneladas = kg / 1000;

  return {
    ano: input.ano,
    parcial: input.parcial,
    mesesCobertos: input.mesesCobertos,
    fobUsd,
    kg,
    toneladas,
    precoMedioUsdT: toneladas > 0 ? fobUsd / toneladas : null,
    porPais: pais.linhas,
    porUf: uf.linhas,
    totalPaises: pais.total,
    totalUfs: uf.total,
  };
}

/**
 * Corpos de request para um recorte livre (N NCMs, período, dimensão).
 *
 * Exportado para teste: a camada de rede não é exercitável no sandbox, então o
 * que trava o contrato com a fonte é a FORMA do payload — NCMs como strings de
 * 8 dígitos, período YYYY-MM, dimensão de detalhe correta e as três variações
 * conhecidas do schema em ordem de preferência.
 */
export function bodiesMercado(
  fluxo: Fluxo,
  ncms: string[],
  from: string,
  to: string,
  detalhe: DetalheMercado,
): unknown[] {
  const detailId = detalhe === "uf" ? "state" : "country";
  const detailTexto = detalhe === "uf" ? "UF" : "País";

  // Formato do portal atual (filterArray + flags de métrica booleanas).
  const portal = {
    flow: fluxo,
    monthDetail: false,
    period: { from, to },
    filterArray: [{ idInput: "ncm", item: ncms }],
    filterList: [{ id: "ncm", text: "NCM", item: ncms }],
    detailDatabase: [{ id: detailId, text: detailTexto }],
    monthStartEnd: false,
    metricFOB: true,
    metricKG: true,
    metricStatistic: false,
    metricFreight: false,
    metricInsurance: false,
    metricCIF: false,
    formQueue: "general",
    langDefault: "pt",
  };

  // Formato anterior (filterList + metricList) — mantido como fallback.
  const legado = {
    flow: fluxo,
    monthDetail: false,
    period: { from, to },
    filterList: [{ id: "ncm", text: ncms.join(","), item: ncms }],
    detailDatabase: [{ id: detailId, text: detailTexto }],
    metricList: ["metricFOB", "metricKG"],
    langDefault: "pt",
  };

  // Formato enxuto (filters/details/metrics) — terceira variação conhecida.
  const enxuto = {
    flow: fluxo,
    monthDetail: false,
    period: { from, to },
    filters: [{ filter: "ncm", values: ncms.map((n) => Number(n)) }],
    details: [detalhe === "uf" ? "state" : "country"],
    metrics: ["metricFOB", "metricKG"],
  };

  return [portal, legado, enxuto];
}

/** Consulta um recorte tentando os formatos conhecidos; falha graciosa. */
async function queryMercado(
  fluxo: Fluxo,
  ncms: string[],
  from: string,
  to: string,
  detalhe: DetalheMercado,
): Promise<ComexRow[]> {
  for (const body of bodiesMercado(fluxo, ncms, from, to, detalhe)) {
    try {
      const rows = await postComex(body);
      if (rows.length) return rows;
    } catch {
      /* tenta o próximo formato */
    }
  }
  return [];
}

/** Último mês consolidado na base, como { ano, mes }. */
export function ultimoMesConsolidado(base: Date): { ano: number; mes: number } {
  const d = new Date(base.getFullYear(), base.getMonth() - DEFASAGEM_MESES, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

/**
 * Janela de consulta de um ano, respeitando a defasagem de consolidação.
 * Retorna null quando o ano inteiro ainda não tem nenhum mês consolidado.
 */
export function janelaDoAno(
  ano: number,
  base: Date,
): { from: string; to: string; parcial: boolean; mesesCobertos: number } | null {
  const { ano: aMax, mes: mMax } = ultimoMesConsolidado(base);
  if (ano > aMax) return null;
  const ultimoMes = ano === aMax ? mMax : 12;
  if (ultimoMes < 1) return null;
  return {
    from: `${ano}-01`,
    to: `${ano}-${String(ultimoMes).padStart(2, "0")}`,
    parcial: ultimoMes < 12,
    mesesCobertos: ultimoMes,
  };
}

/**
 * DIMENSIONA O MERCADO de um conjunto de NCMs, ano a ano, por país de origem e
 * por UF de desembaraço, com preço médio por tonelada.
 *
 * Falha graciosa: se a fonte oficial não responder, volta `disponivel: false`
 * com `erro` preenchido — quem apresenta deve dizer que a fonte não respondeu,
 * JAMAIS estimar o número.
 */
export async function dimensionarMercadoComex(input: {
  /** NCMs de 8 dígitos (já expandidas a partir de SH4/SH6, se for o caso). */
  ncms: string[];
  /** Anos a consultar (ex.: [2024, 2025]). */
  anos: number[];
  fluxo?: Fluxo;
  /** Países que devem constar no ranking mesmo fora do top N (ex.: Paraguai). */
  paisesDestaque?: string[];
  /** UFs que devem constar no ranking mesmo fora do top N (ex.: SC). */
  ufsDestaque?: string[];
  /** Tamanho do ranking (default 10). */
  topN?: number;
  /** Injetável nos testes — default: agora. */
  hoje?: Date;
}): Promise<MercadoDimensionado> {
  const fluxo: Fluxo = input.fluxo ?? "import";
  const topN = Math.min(30, Math.max(3, input.topN ?? 10));
  const hoje = input.hoje ?? new Date();

  const ncms = Array.from(
    new Set(input.ncms.map((n) => String(n).replace(/\D/g, "")).filter((n) => n.length === 8)),
  );
  const anos = Array.from(new Set(input.anos)).sort((a, b) => a - b);

  const vazio: MercadoDimensionado = {
    ncms, fluxo, anos: [], variacaoFobPct: null, variacaoVolumePct: null,
    baseComparacao: null, disponivel: false,
    fonte: "Comex Stat (MDIC/SECEX)", anosSemDado: [],
  };

  if (!ncms.length) return { ...vazio, erro: "nenhuma NCM de 8 dígitos informada" };
  if (!anos.length) return { ...vazio, erro: "nenhum ano informado" };

  const janelas = anos
    .map((ano) => ({ ano, janela: janelaDoAno(ano, hoje) }))
    .filter((x): x is { ano: number; janela: NonNullable<ReturnType<typeof janelaDoAno>> } => x.janela !== null);

  if (!janelas.length) {
    return { ...vazio, erro: "os anos pedidos ainda não têm meses consolidados na base" };
  }

  // Consultas SERIALIZADAS: disparar os pares (país + UF) de vários anos em
  // paralelo faz a fonte estrangular e devolver vazio — que aqui é
  // indistinguível de "não há dado". O volume é pequeno (2 consultas por ano),
  // então a serialização custa pouco e elimina uma classe inteira de falha.
  const resultados: Array<{
    ano: number;
    janela: NonNullable<ReturnType<typeof janelaDoAno>>;
    rowsPais: ComexRow[];
    rowsUf: ComexRow[];
  }> = [];
  for (const { ano, janela } of janelas) {
    const rowsPais = await queryMercado(fluxo, ncms, janela.from, janela.to, "pais");
    const rowsUf = await queryMercado(fluxo, ncms, janela.from, janela.to, "uf");
    resultados.push({ ano, janela, rowsPais, rowsUf });
  }

  // Um ano sem NENHUM dado é registrado, não descartado em silêncio: sumir da
  // saída faz o leitor achar que o ano não foi pedido.
  const comDado = resultados.filter((r) => r.rowsPais.length > 0 || r.rowsUf.length > 0);
  const anosSemDado = resultados
    .filter((r) => r.rowsPais.length === 0 && r.rowsUf.length === 0)
    .map((r) => r.ano);

  if (!comDado.length) {
    return {
      ...vazio,
      anosSemDado,
      erro: "a fonte oficial não retornou dados para o recorte pedido",
    };
  }

  const anosAgregados = comDado.map(({ ano, janela, rowsPais, rowsUf }) =>
    agregarMercadoAno({
      ano,
      parcial: janela.parcial,
      mesesCobertos: janela.mesesCobertos,
      rowsPais,
      rowsUf,
      topN,
      paisesDestaque: input.paisesDestaque,
      ufsDestaque: input.ufsDestaque,
    }),
  );

  // Variação só entre anos COMPARÁVEIS (mesma cobertura em meses).
  let variacaoFobPct: number | null = null;
  let variacaoVolumePct: number | null = null;
  let baseComparacao: MercadoDimensionado["baseComparacao"] = null;
  if (anosAgregados.length >= 2) {
    const ultimo = anosAgregados[anosAgregados.length - 1];
    const penultimo = anosAgregados[anosAgregados.length - 2];
    if (ultimo.mesesCobertos === penultimo.mesesCobertos) {
      if (penultimo.fobUsd > 0) {
        variacaoFobPct = ((ultimo.fobUsd - penultimo.fobUsd) / penultimo.fobUsd) * 100;
      }
      if (penultimo.toneladas > 0) {
        variacaoVolumePct = ((ultimo.toneladas - penultimo.toneladas) / penultimo.toneladas) * 100;
      }
      baseComparacao = { de: penultimo.ano, para: ultimo.ano };
    }
  }

  return {
    ncms,
    fluxo,
    anos: anosAgregados,
    variacaoFobPct,
    variacaoVolumePct,
    baseComparacao,
    disponivel: true,
    fonte: "Comex Stat (MDIC/SECEX)",
    anosSemDado,
  };
}
