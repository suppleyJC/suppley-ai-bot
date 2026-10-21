/**
 * Correlação econômica — macro E microeconomia aplicadas ao custo de importar.
 *
 * Matemática PURA (testável): retornos mensais, correlação de Pearson com
 * defasagem (lead-lag) e beta (sensibilidade). Fontes de série:
 *  - BCB/SGS (api.bcb.gov.br, sem chave): Selic, IPCA, IGP-M, INCC — o INCC é
 *    o termômetro do MERCADO INTERNO da construção (caso Suppley).
 *  - PTAX (marketIntelligenceService), FRED commodities, Comex Stat mensal.
 *
 * A correlação roda sobre RETORNOS (variações %), não níveis — nível correlaciona
 * qualquer coisa com tendência (correlação espúria); retorno mede co-movimento real.
 *
 * GUARDRAIL: correlação ≠ causalidade; o resultado é leitura de DIREÇÃO e
 * SENSIBILIDADE para decisão de timing, não modelo de precificação.
 */

export interface PontoYm { t: string; valor: number }

// ---------------------------------------------------------------------------
// BCB/SGS — séries oficiais mensais (sem chave de API)
// ---------------------------------------------------------------------------

/** Séries SGS relevantes. IPCA/IGP-M/INCC já são VARIAÇÃO mensal (%); Selic é nível (% a.a.). */
export const SGS_SERIES = {
  selicMeta: { codigo: 432, label: "Selic (meta, % a.a.)", tipo: "nivel" as const },
  ipca: { codigo: 433, label: "IPCA (var. mensal %)", tipo: "variacao" as const },
  igpm: { codigo: 189, label: "IGP-M (var. mensal %)", tipo: "variacao" as const },
  incc: { codigo: 192, label: "INCC (var. mensal %) — custo da construção (mercado interno)", tipo: "variacao" as const },
};

/** Últimos `n` pontos de uma série SGS do BCB, normalizados para {t:"YYYY-MM", valor}. */
export async function getSgsSerie(codigo: number, n = 30): Promise<PontoYm[]> {
  try {
    const resp = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${n}?formato=json`,
      { headers: { Accept: "application/json" } },
    );
    if (!resp.ok) return [];
    const json: any = await resp.json();
    if (!Array.isArray(json)) return [];
    const pontos: PontoYm[] = [];
    for (const r of json) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r?.data ?? ""));
      const v = Number(String(r?.valor ?? "").replace(",", "."));
      if (!m || !Number.isFinite(v)) continue;
      pontos.push({ t: `${m[3]}-${m[2]}`, valor: v });
    }
    // Uma observação por mês (a última vence — Selic diária vira mensal).
    const porMes = new Map<string, number>();
    for (const p of pontos) porMes.set(p.t, p.valor);
    return Array.from(porMes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, valor]) => ({ t, valor }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Matemática pura
// ---------------------------------------------------------------------------

/** Retornos mensais (%) de uma série de NÍVEL, rotulados pelo mês de chegada. */
export function retornosMensais(serie: PontoYm[]): PontoYm[] {
  const out: PontoYm[] = [];
  for (let i = 1; i < serie.length; i++) {
    if (serie[i - 1].valor !== 0) {
      out.push({ t: serie[i].t, valor: ((serie[i].valor - serie[i - 1].valor) / Math.abs(serie[i - 1].valor)) * 100 });
    }
  }
  return out;
}

/** Diferenças mensais (pontos) — para séries de taxa (Selic). */
export function diferencasMensais(serie: PontoYm[]): PontoYm[] {
  const out: PontoYm[] = [];
  for (let i = 1; i < serie.length; i++) {
    out.push({ t: serie[i].t, valor: serie[i].valor - serie[i - 1].valor });
  }
  return out;
}

/** Alinha duas séries pelos rótulos "YYYY-MM" comuns (ordenado). */
export function alinhar(a: PontoYm[], b: PontoYm[]): { t: string; x: number; y: number }[] {
  const mb = new Map(b.map((p) => [p.t, p.valor]));
  return a
    .filter((p) => mb.has(p.t))
    .map((p) => ({ t: p.t, x: p.valor, y: mb.get(p.t)! }))
    .sort((p, q) => p.t.localeCompare(q.t));
}

/** Correlação de Pearson entre dois vetores do mesmo tamanho. */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

export interface CorrelacaoLag {
  /** r no melhor lag (x ANTECEDE y em `lagMeses`). */
  r: number;
  lagMeses: number;
  /** Sensibilidade: quanto y varia (em %) por 1% de variação de x, no melhor lag. */
  beta: number;
  nPares: number;
}

/**
 * Correlação com defasagem: testa x→y com lag 0..maxLag (x de `lag` meses
 * atrás explica y de hoje) e devolve o lag de MAIOR |r|.
 */
export function correlacionarComLag(
  x: PontoYm[],
  y: PontoYm[],
  maxLag = 3,
): CorrelacaoLag {
  let melhor: CorrelacaoLag = { r: 0, lagMeses: 0, beta: 0, nPares: 0 };
  for (let lag = 0; lag <= maxLag; lag++) {
    // Desloca x `lag` meses para frente: x(t-lag) casa com y(t).
    const xDesloc = x.map((p) => {
      const m = /^(\d{4})-(\d{2})$/.exec(p.t);
      if (!m) return p;
      const d = new Date(Number(m[1]), Number(m[2]) - 1 + lag, 1);
      return { t: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, valor: p.valor };
    });
    const pares = alinhar(xDesloc, y);
    if (pares.length < 6) continue;
    const xs = pares.map((p) => p.x);
    const ys = pares.map((p) => p.y);
    const r = pearson(xs, ys);
    if (Math.abs(r) > Math.abs(melhor.r)) {
      // beta = cov/var — inclinação de y sobre x.
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
      const my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < xs.length; i++) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) ** 2;
      }
      melhor = { r, lagMeses: lag, beta: sxx > 0 ? sxy / sxx : 0, nPares: pares.length };
    }
  }
  return melhor;
}

/** Classificação verbal da força da correlação. */
export function forcaCorrelacao(r: number): "forte" | "moderada" | "fraca" | "irrelevante" {
  const a = Math.abs(r);
  return a >= 0.6 ? "forte" : a >= 0.4 ? "moderada" : a >= 0.25 ? "fraca" : "irrelevante";
}
