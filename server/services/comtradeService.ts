/**
 * UN Comtrade Service — preço médio GLOBAL de comércio por HS (mundo todo).
 *
 * Complementa o Comex Stat (que cobre só o Brasil): quando NÃO há importação
 * registrada para o Brasil de um NCM, o Comtrade dá o preço médio mundial em
 * US$/kg — uma ordem de grandeza para QUALQUER produto. Por ser global (não
 * "importação para o Brasil"), a Excambia sinaliza isso de forma sutil.
 *
 * API: comtradeapi.un.org (v1). O acesso usa a chave de assinatura gratuita em
 * COMTRADE_API_KEY (header Ocp-Apim-Subscription-Key). Sem chave, tenta anônimo
 * e, se não der, retorna indisponível (a camada de web cobre o resto).
 *
 * GUARDRAIL: referência/apoio à decisão, não cálculo fiscal.
 */

const COMTRADE_URL = "https://comtradeapi.un.org/data/v1/get/C/A/HS";

export type FluxoComtrade = "import" | "export";

export interface ComtradeRow {
  primaryValue?: number | string; // valor do comércio em US$
  netWgt?: number | string;       // peso líquido em kg
  qty?: number | string;
  [k: string]: unknown;
}

export interface ComtradeResumo {
  hs6: string;
  fluxo: FluxoComtrade;
  ano: number | null;
  valorUsd: number;
  kg: number;
  precoMedioUsdKg: number | null;
  escopo: "global";
  disponivel: boolean;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Agregação pura (testável): soma valor e peso e calcula US$/kg. */
export function resumoComtrade(
  hs6: string,
  fluxo: FluxoComtrade,
  ano: number | null,
  rows: ComtradeRow[],
): ComtradeResumo {
  let valorUsd = 0;
  let kg = 0;
  for (const r of rows) {
    valorUsd += num(r.primaryValue);
    kg += num(r.netWgt);
  }
  const precoMedioUsdKg = kg > 0 ? valorUsd / kg : null;
  return {
    hs6, fluxo, ano, valorUsd, kg, precoMedioUsdKg,
    escopo: "global",
    disponivel: rows.length > 0 && precoMedioUsdKg != null,
  };
}

async function getComtrade(
  hs6: string,
  fluxo: FluxoComtrade,
  ano: number,
  opts: { todosPaises?: boolean } = {},
): Promise<ComtradeRow[]> {
  const params = new URLSearchParams({
    partnerCode: "0",    // World
    period: String(ano),
    cmdCode: hs6,
    flowCode: fluxo === "import" ? "M" : "X",
    motCode: "0",
    customsCode: "C00",
    partner2Code: "0",
    includeDesc: "true",
  });
  // reporterCode "0" = agregado mundial; omitido = TODOS os países (um por linha).
  if (!opts.todosPaises) params.set("reporterCode", "0");
  const key = process.env.COMTRADE_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers["Ocp-Apim-Subscription-Key"] = key;

  const resp = await fetch(`${COMTRADE_URL}?${params.toString()}`, { headers });
  if (!resp.ok) return [];
  const json: any = await resp.json();
  const data = json?.data ?? json?.dataset ?? [];
  return Array.isArray(data) ? (data as ComtradeRow[]) : [];
}

// ---------------------------------------------------------------------------
// MAPA DE MERCADO DE SUPRIMENTO GLOBAL — quem exporta o produto, quem está
// CRESCENDO e a que preço. Correlaciona dois anos fechados por país exportador
// e deriva: ranking por valor, crescimento (%) e preço médio US$/kg.
// ---------------------------------------------------------------------------

export interface ExportadorPais {
  pais: string;
  valorUsd: number;
  kg: number;
  precoMedioUsdKg: number | null;
  /** Crescimento do valor exportado vs ano anterior disponível (%; null sem base). */
  crescimentoPct: number | null;
  shareGlobalPct: number;
}

export interface MapaMercadoGlobal {
  hs6: string;
  anoBase: number | null;
  anoComparacao: number | null;
  totalGlobalUsd: number;
  /** Top exportadores por valor (líderes de suprimento). */
  lideres: ExportadorPais[];
  /** Exportadores em CRESCIMENTO acelerado (mercados emergentes do produto). */
  emergentes: ExportadorPais[];
  disponivel: boolean;
}

/** Agregação pura (testável): cruza dois anos por país e deriva o mapa. */
export function montarMapaMercado(
  hs6: string,
  anoBase: number | null,
  anoComparacao: number | null,
  rowsBase: ComtradeRow[],
  rowsComp: ComtradeRow[],
  topN = 10,
): MapaMercadoGlobal {
  const nome = (r: ComtradeRow) =>
    String((r as any).reporterDesc ?? (r as any).reporterISO ?? (r as any).reporterCode ?? "").trim();

  // Consolida por país (a API pode fragmentar por sub-fluxo).
  const porPais = new Map<string, { valorUsd: number; kg: number }>();
  for (const r of rowsBase) {
    const p = nome(r);
    if (!p || /world|total/i.test(p)) continue;
    const acc = porPais.get(p) ?? { valorUsd: 0, kg: 0 };
    acc.valorUsd += num(r.primaryValue);
    acc.kg += num(r.netWgt);
    porPais.set(p, acc);
  }
  const compPorPais = new Map<string, number>();
  for (const r of rowsComp) {
    const p = nome(r);
    if (!p || /world|total/i.test(p)) continue;
    compPorPais.set(p, (compPorPais.get(p) ?? 0) + num(r.primaryValue));
  }

  const totalGlobalUsd = Array.from(porPais.values()).reduce((s, v) => s + v.valorUsd, 0);
  const paises: ExportadorPais[] = Array.from(porPais.entries())
    .map(([pais, v]) => {
      const anterior = compPorPais.get(pais) ?? 0;
      return {
        pais,
        valorUsd: v.valorUsd,
        kg: v.kg,
        precoMedioUsdKg: v.kg > 0 ? v.valorUsd / v.kg : null,
        crescimentoPct: anterior > 0 ? ((v.valorUsd - anterior) / anterior) * 100 : null,
        shareGlobalPct: totalGlobalUsd > 0 ? (v.valorUsd / totalGlobalUsd) * 100 : 0,
      };
    })
    .filter((p) => p.valorUsd > 0);

  const lideres = [...paises].sort((a, b) => b.valorUsd - a.valorUsd).slice(0, topN);
  // Emergentes: crescimento relevante COM volume mínimo (>= 0,3% do global) —
  // evita "crescimento de 400%" sobre base irrisória.
  const emergentes = paises
    .filter((p) => p.crescimentoPct != null && p.crescimentoPct > 10 && p.shareGlobalPct >= 0.3)
    .sort((a, b) => (b.crescimentoPct ?? 0) - (a.crescimentoPct ?? 0))
    .slice(0, topN);

  return {
    hs6, anoBase, anoComparacao, totalGlobalUsd, lideres, emergentes,
    disponivel: lideres.length > 0,
  };
}

/**
 * Mapa do mercado global de suprimento de um HS6: quem exporta, quem cresce e
 * a que preço. Usa os dois últimos anos fechados. Falha graciosa.
 */
export async function mapearMercadoGlobal(input: {
  ncm: string;
  anoBase?: number;
  topN?: number;
}): Promise<MapaMercadoGlobal> {
  const hs6 = (input.ncm || "").replace(/\D/g, "").slice(0, 6);
  if (hs6.length < 6) return montarMapaMercado(hs6, null, null, [], []);

  const anoAtual = input.anoBase ?? new Date().getFullYear();
  // Dados anuais consolidam com defasagem: tenta (ano-1 vs ano-2), senão recua.
  for (const base of [anoAtual - 1, anoAtual - 2]) {
    try {
      const rowsBase = await getComtrade(hs6, "export", base, { todosPaises: true });
      if (!rowsBase.length) continue;
      const rowsComp = await getComtrade(hs6, "export", base - 1, { todosPaises: true });
      const mapa = montarMapaMercado(hs6, base, base - 1, rowsBase, rowsComp, input.topN ?? 10);
      if (mapa.disponivel) return mapa;
    } catch {
      /* tenta o ano anterior */
    }
  }
  return montarMapaMercado(hs6, null, null, [], []);
}

/**
 * Preço médio global do HS (deriva HS6 do NCM). Tenta os últimos anos fechados.
 * Falha graciosa (disponivel=false) se a fonte não responder.
 */
export async function consultarComtradeGlobal(input: {
  ncm: string;
  fluxo?: FluxoComtrade;
  anoBase?: number; // para teste/determinismo; default = ano atual
}): Promise<ComtradeResumo> {
  const fluxo: FluxoComtrade = input.fluxo ?? "import";
  const hs6 = (input.ncm || "").replace(/\D/g, "").slice(0, 6);
  if (hs6.length < 6) return resumoComtrade(hs6, fluxo, null, []);

  const anoAtual = input.anoBase ?? new Date().getFullYear();
  // dados anuais consolidam com defasagem — tenta ano-1, depois ano-2
  for (const ano of [anoAtual - 1, anoAtual - 2]) {
    try {
      const rows = await getComtrade(hs6, fluxo, ano);
      const resumo = resumoComtrade(hs6, fluxo, ano, rows);
      if (resumo.disponivel) return resumo;
    } catch {
      /* tenta o próximo ano */
    }
  }
  return resumoComtrade(hs6, fluxo, null, []);
}
