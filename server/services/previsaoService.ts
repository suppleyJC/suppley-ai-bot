/**
 * Previsão de séries — o núcleo MATEMÁTICO da análise preditiva da Excambia.
 *
 * Funções PURAS (testáveis, sem rede): regressão linear, sazonalidade
 * multiplicativa, volatilidade e projeção com banda de confiança. As fontes
 * (PTAX/BCB, Comex Stat mensal, FRED) entram pelas tools; aqui só matemática.
 *
 * GUARDRAIL: projeção é apoio à decisão (tendência + faixa), não promessa.
 * A banda usa o erro-padrão da regressão (~80% com z=1.28).
 */

export interface PontoSerie {
  /** Rótulo temporal (ex.: "2026-03") — apenas para exibição. */
  t: string;
  valor: number;
}

export interface Projecao {
  passo: number;        // 1 = próximo período
  t: string;            // rótulo estimado do período
  valor: number;        // projeção central
  min: number;          // banda inferior (~80%)
  max: number;          // banda superior (~80%)
}

export interface AnalisePreditiva {
  n: number;
  media: number;
  ultimo: number;
  tendencia: "alta" | "baixa" | "estavel";
  /** Inclinação da regressão em % da média POR PERÍODO (ex.: +1,2%/mês). */
  inclinacaoPctPorPeriodo: number;
  /** Coeficiente de determinação da regressão (0–1): confiança na tendência. */
  r2: number;
  /** Volatilidade: desvio-padrão dos retornos por período (%). */
  volatilidadePct: number;
  /** Posição do último valor vs média (%): >0 = acima da média histórica. */
  desvioDaMediaPct: number;
  sazonalidadeAplicada: boolean;
  projecoes: Projecao[];
  disponivel: boolean;
}

const Z80 = 1.28; // banda ~80%

/** Regressão linear simples y = a + b·x sobre índices 0..n-1. */
export function regressaoLinear(y: number[]): {
  a: number; b: number; r2: number; stderr: number;
} {
  const n = y.length;
  if (n < 2) return { a: y[0] ?? 0, b: 0, r2: 0, stderr: 0 };
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (y[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - (a + b * xs[i])) ** 2;
  const r2 = syy > 0 ? 1 - sse / syy : 0;
  const stderr = n > 2 ? Math.sqrt(sse / (n - 2)) : Math.sqrt(sse / n);
  return { a, b, r2: Math.max(0, Math.min(1, r2)), stderr };
}

/**
 * Índices sazonais multiplicativos por posição no ciclo (ex.: mês 0–11).
 * Exige ao menos 2 ciclos completos; senão retorna null (sem sazonalidade).
 */
export function indicesSazonais(y: number[], ciclo = 12): number[] | null {
  if (ciclo < 2 || y.length < 2 * ciclo) return null;
  const media = y.reduce((s, v) => s + v, 0) / y.length;
  if (media === 0) return null;
  const somas = new Array(ciclo).fill(0);
  const contagens = new Array(ciclo).fill(0);
  for (let i = 0; i < y.length; i++) {
    somas[i % ciclo] += y[i];
    contagens[i % ciclo]++;
  }
  const indices = somas.map((s, i) => (contagens[i] > 0 ? s / contagens[i] / media : 1));
  // Normaliza para média 1 (índice puro).
  const m = indices.reduce((s, v) => s + v, 0) / ciclo;
  return m > 0 ? indices.map((v) => v / m) : null;
}

/** Volatilidade: desvio-padrão dos retornos percentuais por período. */
export function volatilidadePct(y: number[]): number {
  if (y.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < y.length; i++) {
    if (y[i - 1] > 0) rets.push((y[i] - y[i - 1]) / y[i - 1]);
  }
  if (rets.length < 2) return 0;
  const m = rets.reduce((s, v) => s + v, 0) / rets.length;
  const va = rets.reduce((s, v) => s + (v - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(va) * 100;
}

/** Rótulo do período seguinte a partir de "YYYY-MM" (fallback: "+k"). */
function proximoRotulo(ultimo: string, passo: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ultimo);
  if (!m) return `+${passo}`;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + passo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Analisa uma série (idealmente mensal, ≥6 pontos) e projeta `horizonte`
 * períodos com banda ~80%. Aplica sazonalidade quando há ≥2 ciclos.
 */
export function analisarEProjetar(
  serie: PontoSerie[],
  horizonte = 3,
  ciclo = 12,
): AnalisePreditiva {
  const y = serie.map((p) => p.valor).filter((v) => Number.isFinite(v));
  const n = y.length;
  if (n < 4) {
    return {
      n, media: 0, ultimo: y[n - 1] ?? 0, tendencia: "estavel",
      inclinacaoPctPorPeriodo: 0, r2: 0, volatilidadePct: 0, desvioDaMediaPct: 0,
      sazonalidadeAplicada: false, projecoes: [], disponivel: false,
    };
  }

  const media = y.reduce((s, v) => s + v, 0) / n;
  const ultimo = y[n - 1];

  // Dessazonaliza para regredir a tendência limpa; re-sazonaliza na projeção.
  const sazonal = indicesSazonais(y, ciclo);
  const dessaz = sazonal ? y.map((v, i) => v / (sazonal[i % ciclo] || 1)) : y;

  const { a, b, r2, stderr } = regressaoLinear(dessaz);
  const inclinacaoPct = media > 0 ? (b / media) * 100 : 0;

  // Tendência: inclinação relevante E regressão minimamente explicativa.
  const tendencia: AnalisePreditiva["tendencia"] =
    Math.abs(inclinacaoPct) < 0.3 || r2 < 0.15 ? "estavel" : inclinacaoPct > 0 ? "alta" : "baixa";

  const ultimoRotulo = serie[serie.length - 1]?.t ?? "";
  const projecoes: Projecao[] = [];
  for (let h = 1; h <= horizonte; h++) {
    const x = n - 1 + h;
    const base = a + b * x;
    const fator = sazonal ? sazonal[x % ciclo] || 1 : 1;
    const central = Math.max(0, base * fator);
    // Banda cresce com a raiz do horizonte (incerteza acumula).
    const banda = Z80 * stderr * Math.sqrt(h) * fator;
    projecoes.push({
      passo: h,
      t: proximoRotulo(ultimoRotulo, h),
      valor: central,
      min: Math.max(0, central - banda),
      max: central + banda,
    });
  }

  return {
    n,
    media,
    ultimo,
    tendencia,
    inclinacaoPctPorPeriodo: inclinacaoPct,
    r2,
    volatilidadePct: volatilidadePct(y),
    desvioDaMediaPct: media > 0 ? ((ultimo - media) / media) * 100 : 0,
    sazonalidadeAplicada: !!sazonal,
    projecoes,
    disponivel: true,
  };
}

/** Agrega uma série diária em médias mensais (para PTAX → mensal). */
export function agregarMensal(pontos: { data: string; valor: number }[]): PontoSerie[] {
  const porMes = new Map<string, { soma: number; n: number }>();
  for (const p of pontos) {
    const ym = p.data.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || !Number.isFinite(p.valor)) continue;
    const acc = porMes.get(ym) ?? { soma: 0, n: 0 };
    acc.soma += p.valor;
    acc.n++;
    porMes.set(ym, acc);
  }
  return Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, { soma, n }]) => ({ t, valor: soma / n }));
}
