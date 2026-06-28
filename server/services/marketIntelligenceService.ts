/**
 * Market Intelligence Service — transforma dados oficiais e gratuitos em SINAIS
 * e INSIGHTS de decisão para importação.
 *
 * Fontes (oficiais, gratuitas, legais):
 *  - BCB (Olinda/PTAX): série histórica do câmbio USD/BRL.
 *  - FRED (St. Louis Fed): commodities/macro globais (alumínio, ferro, cobre,
 *    petróleo). Requer FRED_API_KEY no ambiente (nunca hardcoded).
 *
 * Camadas:
 *  1) Provedores → séries históricas.
 *  2) Sinais     → tendência (alta/baixa/estável) por variação %.
 *  3) Insights   → recomendações: melhor momento de importar, tendência do
 *     câmbio, antecipar/adiar compra, reforço de estoque, alertas/oportunidades.
 *
 * GUARDRAIL: aqui é INTELIGÊNCIA (apoio à decisão), não cálculo fiscal. O custo
 * definitivo continua saindo do motor certificado.
 */

export type Tendencia = "alta" | "baixa" | "estavel";

export interface SeriePonto {
  data: string;   // ISO yyyy-mm-dd
  valor: number;
}

export interface Sinal {
  chave: string;            // ex.: "USD/BRL", "Alumínio"
  fonte: string;            // ex.: "BCB/PTAX", "FRED"
  atual: number;
  anterior: number;
  variacaoPct: number;      // variação % no período
  tendencia: Tendencia;
  unidade?: string;
  detalhe?: string;
}

export interface Insight {
  titulo: string;
  texto: string;
  tipo: "cambio" | "commodity" | "oportunidade" | "alerta" | "geral";
  severidade: "info" | "atencao" | "oportunidade";
}

const LIMIAR_PCT = 2; // ±2% define alta/baixa; entre eles, estável

function classifica(variacaoPct: number): Tendencia {
  if (variacaoPct > LIMIAR_PCT) return "alta";
  if (variacaoPct < -LIMIAR_PCT) return "baixa";
  return "estavel";
}

function pct(atual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((atual - anterior) / anterior) * 100;
}

/* ---------- BCB: série histórica do câmbio USD/BRL ---------- */
function fmtBcbDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

/** Últimos `dias` corridos de PTAX (venda) USD/BRL. */
export async function getPtaxSerie(dias = 90): Promise<SeriePonto[]> {
  const fim = new Date();
  const ini = new Date();
  ini.setDate(ini.getDate() - dias);
  const url =
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` +
    `CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?` +
    `@dataInicial='${fmtBcbDate(ini)}'&@dataFinalCotacao='${fmtBcbDate(fim)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const vals = (json?.value ?? []) as Array<{ cotacaoVenda: number; dataHoraCotacao: string }>;
    return vals
      .filter((v) => v.cotacaoVenda > 0)
      .map((v) => ({ data: v.dataHoraCotacao.slice(0, 10), valor: v.cotacaoVenda }));
  } catch {
    return [];
  }
}

/* ---------- FRED: séries de commodities/macro ---------- */
export interface FredCommodity { id: string; label: string; unidade: string; }

/** Commodities relevantes para o custo de importação (séries FRED). */
export const FRED_COMMODITIES: FredCommodity[] = [
  { id: "PALUMUSDM", label: "Alumínio", unidade: "USD/ton" },
  { id: "PIORECRUSDM", label: "Minério de ferro", unidade: "USD/ton" },
  { id: "PCOPPUSDM", label: "Cobre", unidade: "USD/ton" },
  { id: "DCOILBRENTEU", label: "Petróleo Brent", unidade: "USD/barril" },
];

export function fredDisponivel(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}

/** Observações de uma série FRED (mais recentes primeiro). */
export async function getFredSerie(seriesId: string, limite = 24): Promise<SeriePonto[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${key}&file_type=json&sort_order=desc&limit=${limite}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const obs = (json?.observations ?? []) as Array<{ date: string; value: string }>;
    return obs
      .map((o) => ({ data: o.date, valor: Number(o.value) }))
      .filter((p) => Number.isFinite(p.valor))
      .reverse(); // crescente por data
  } catch {
    return [];
  }
}

/* ---------- Sinais ---------- */
/** Deriva um sinal de uma série: compara o ponto atual com ~30% atrás. */
function sinalDeSerie(serie: SeriePonto[], chave: string, fonte: string, unidade?: string): Sinal | null {
  if (serie.length < 2) return null;
  const atual = serie[serie.length - 1].valor;
  const idxAnt = Math.max(0, Math.floor(serie.length * 0.7) - 1);
  const anterior = serie[idxAnt].valor;
  const variacaoPct = pct(atual, anterior);
  return {
    chave, fonte, atual, anterior,
    variacaoPct,
    tendencia: classifica(variacaoPct),
    unidade,
    detalhe: `${chave}: ${atual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${unidade ? " " + unidade : ""} ` +
      `(${variacaoPct >= 0 ? "+" : ""}${variacaoPct.toFixed(1)}% no período).`,
  };
}

/** Coleta os sinais de mercado (câmbio + commodities disponíveis). */
export async function coletarSinais(): Promise<Sinal[]> {
  const sinais: Sinal[] = [];

  const ptax = await getPtaxSerie(90);
  const sCambio = sinalDeSerie(ptax, "USD/BRL", "BCB/PTAX");
  if (sCambio) sinais.push(sCambio);

  if (fredDisponivel()) {
    const series = await Promise.all(
      FRED_COMMODITIES.map((c) => getFredSerie(c.id).then((s) => ({ c, s }))),
    );
    for (const { c, s } of series) {
      const sig = sinalDeSerie(s, c.label, "FRED", c.unidade);
      if (sig) sinais.push(sig);
    }
  }
  return sinais;
}

/* ---------- Insights / recomendações ---------- */
export async function gerarInsights(): Promise<{ sinais: Sinal[]; insights: Insight[] }> {
  const sinais = await coletarSinais();
  const insights: Insight[] = [];

  const cambio = sinais.find((s) => s.chave === "USD/BRL");
  if (cambio) {
    if (cambio.tendencia === "alta") {
      insights.push({
        tipo: "cambio", severidade: "atencao",
        titulo: "Câmbio em alta — importação ficando mais cara",
        texto: `O USD/BRL subiu ${cambio.variacaoPct.toFixed(1)}% no período (atual R$ ${cambio.atual.toFixed(4)}). ` +
          `O custo nacionalizado tende a subir. Avalie ANTECIPAR fechamentos de câmbio/compras já planejadas e ` +
          `evitar adiar pedidos sensíveis a preço.`,
      });
    } else if (cambio.tendencia === "baixa") {
      insights.push({
        tipo: "oportunidade", severidade: "oportunidade",
        titulo: "Câmbio em baixa — janela favorável para importar",
        texto: `O USD/BRL caiu ${Math.abs(cambio.variacaoPct).toFixed(1)}% no período (atual R$ ${cambio.atual.toFixed(4)}). ` +
          `É um momento mais favorável para importar e fechar câmbio. Considere reforçar estoque de itens recorrentes.`,
      });
    } else {
      insights.push({
        tipo: "cambio", severidade: "info",
        titulo: "Câmbio estável",
        texto: `O USD/BRL está estável (R$ ${cambio.atual.toFixed(4)}, ${cambio.variacaoPct >= 0 ? "+" : ""}${cambio.variacaoPct.toFixed(1)}% no período). ` +
          `Sem pressão cambial relevante para decidir o timing agora.`,
      });
    }
  }

  for (const s of sinais.filter((x) => x.fonte === "FRED")) {
    if (s.tendencia === "alta") {
      insights.push({
        tipo: "alerta", severidade: "atencao",
        titulo: `Alerta de custo — ${s.chave} em alta`,
        texto: `${s.chave} subiu ${s.variacaoPct.toFixed(1)}% (atual ${s.atual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${s.unidade ?? ""}). ` +
          `Insumos ligados a ${s.chave.toLowerCase()} tendem a encarecer — considere antecipar compra ou reforçar estoque.`,
      });
    } else if (s.tendencia === "baixa") {
      insights.push({
        tipo: "oportunidade", severidade: "oportunidade",
        titulo: `Oportunidade — ${s.chave} em baixa`,
        texto: `${s.chave} caiu ${Math.abs(s.variacaoPct).toFixed(1)}% (atual ${s.atual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${s.unidade ?? ""}). ` +
          `Pode ser bom momento para comprar insumos ligados a ${s.chave.toLowerCase()}.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      tipo: "geral", severidade: "info",
      titulo: "Sem sinais relevantes agora",
      texto: "Não há movimentos de câmbio ou commodities fortes o suficiente para uma recomendação no momento.",
    });
  }

  return { sinais, insights };
}
