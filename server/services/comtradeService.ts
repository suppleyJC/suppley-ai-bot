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

async function getComtrade(hs6: string, fluxo: FluxoComtrade, ano: number): Promise<ComtradeRow[]> {
  const params = new URLSearchParams({
    reporterCode: "0",   // World (agregado)
    partnerCode: "0",    // World
    period: String(ano),
    cmdCode: hs6,
    flowCode: fluxo === "import" ? "M" : "X",
    motCode: "0",
    customsCode: "C00",
    partner2Code: "0",
  });
  const key = process.env.COMTRADE_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers["Ocp-Apim-Subscription-Key"] = key;

  const resp = await fetch(`${COMTRADE_URL}?${params.toString()}`, { headers });
  if (!resp.ok) return [];
  const json: any = await resp.json();
  const data = json?.data ?? json?.dataset ?? [];
  return Array.isArray(data) ? (data as ComtradeRow[]) : [];
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
