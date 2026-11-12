/**
 * Custos logísticos — calculadora DETERMINÍSTICA de fretamento internacional:
 * demurrage/detention, THC/capatazia, LCL vs FCL (w/m e ponto de virada).
 *
 * Funções PURAS (testáveis). Os VALORES DE REFERÊNCIA (tabelas) são premissas
 * declaradas — mercado muda; a Excambia apresenta como "referência de mercado"
 * e ajusta quando o usuário informa o número real do seu contrato.
 *
 * GUARDRAIL: apoio à decisão/planejamento; o custo contratual vem do armador/
 * forwarder. Nada aqui substitui o motor fiscal (montar_calculo).
 */

export type TipoContainer = "20DV" | "40DV" | "40HC";

// ---------------------------------------------------------------------------
// TABELAS DE REFERÊNCIA (premissas declaradas — atualizáveis)
// ---------------------------------------------------------------------------

/** THC (capatazia) de REFERÊNCIA por porto brasileiro, BRL por contêiner. */
export const THC_REF_BRL: Record<string, number> = {
  santos: 1450,
  itajai: 1250,
  navegantes: 1250,
  paranagua: 1350,
  "rio grande": 1300,
  itapoa: 1250,
  suape: 1400,
  salvador: 1350,
  vitoria: 1350,
  "rio de janeiro": 1450,
  manaus: 1600,
  fortaleza: 1400,
};

/** Free time típico (dias corridos) por tipo de operação. */
export const FREE_TIME_REF_DIAS = 7;

/**
 * Demurrage de REFERÊNCIA (USD/dia por contêiner), ESCALONADA — o custo por
 * dia SOBE por faixa de atraso (padrão de mercado dos armadores).
 */
export const DEMURRAGE_REF_USD: Record<TipoContainer, { ate7: number; ate14: number; apos14: number }> = {
  "20DV": { ate7: 120, ate14: 180, apos14: 260 },
  "40DV": { ate7: 180, ate14: 260, apos14: 380 },
  "40HC": { ate7: 190, ate14: 280, apos14: 400 },
};

/** Capacidade útil de referência por contêiner (m³ e kg). */
export const CAPACIDADE_CONTAINER: Record<TipoContainer, { m3: number; kg: number }> = {
  "20DV": { m3: 28, kg: 24_000 },
  "40DV": { m3: 58, kg: 26_000 },
  "40HC": { m3: 68, kg: 26_000 },
};

/** Taxas fixas típicas de destino no LCL (desconsolidação etc.), USD por embarque. */
export const LCL_TAXAS_FIXAS_USD = 180;
/** THC proporcional típico no LCL, USD por w/m. */
export const LCL_THC_USD_POR_WM = 28;

// ---------------------------------------------------------------------------
// DEMURRAGE
// ---------------------------------------------------------------------------

export interface DemurrageResultado {
  diasAlemFreeTime: number;
  custoUsd: number;
  detalhe: string; // faixas aplicadas
}

/**
 * Custo de demurrage para `diasPorto` dias corridos no porto, dado o free time.
 * Escalonamento: dias 1–7 além do free time na faixa 1, 8–14 na faixa 2, 15+ na 3.
 */
export function calcularDemurrage(
  tipo: TipoContainer,
  diasPorto: number,
  freeTimeDias = FREE_TIME_REF_DIAS,
  containers = 1,
  tabela = DEMURRAGE_REF_USD,
): DemurrageResultado {
  const alem = Math.max(0, Math.floor(diasPorto) - Math.floor(freeTimeDias));
  if (alem === 0) {
    return { diasAlemFreeTime: 0, custoUsd: 0, detalhe: "dentro do free time" };
  }
  const t = tabela[tipo];
  const f1 = Math.min(alem, 7);
  const f2 = Math.min(Math.max(alem - 7, 0), 7);
  const f3 = Math.max(alem - 14, 0);
  const custo = (f1 * t.ate7 + f2 * t.ate14 + f3 * t.apos14) * containers;
  const partes = [
    f1 > 0 ? `${f1}d × US$${t.ate7}` : null,
    f2 > 0 ? `${f2}d × US$${t.ate14}` : null,
    f3 > 0 ? `${f3}d × US$${t.apos14}` : null,
  ].filter(Boolean);
  return {
    diasAlemFreeTime: alem,
    custoUsd: custo,
    detalhe: `${partes.join(" + ")}${containers > 1 ? ` × ${containers} ctn` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// LCL × FCL
// ---------------------------------------------------------------------------

export interface ComparacaoLclFcl {
  wm: number;                 // chargeable weight/measure (t vs m³, o maior)
  custoLclUsd: number;
  custoFclUsd: number;
  recomendacao: "LCL" | "FCL";
  economiaUsd: number;
  /** Volume (m³) em que o LCL empata com o FCL, mantidas as taxas. */
  breakevenM3: number | null;
  cabeNoFcl: boolean;
  detalhe: string;
}

/**
 * Compara LCL (cobrança por w/m) com FCL (contêiner fechado) para uma carga.
 * O LCL cobra pelo MAIOR entre toneladas e m³ (w/m) + taxas fixas + THC w/m;
 * o FCL paga frete cheio + THC do contêiner.
 */
export function compararLclFcl(input: {
  volumeM3: number;
  pesoKg: number;
  freteLclUsdPorWm: number;   // tarifa LCL US$/w/m
  freteFclUsd: number;        // frete do contêiner fechado
  tipoFcl?: TipoContainer;
  thcFclBrl?: number;         // THC destino do FCL (BRL)
  cambio?: number;            // p/ converter THC BRL→USD (default 5.0)
  taxasFixasLclUsd?: number;
  thcLclUsdPorWm?: number;
}): ComparacaoLclFcl {
  const tipo = input.tipoFcl ?? "20DV";
  const cap = CAPACIDADE_CONTAINER[tipo];
  const cambio = input.cambio && input.cambio > 0 ? input.cambio : 5.0;
  const taxasFixas = input.taxasFixasLclUsd ?? LCL_TAXAS_FIXAS_USD;
  const thcWm = input.thcLclUsdPorWm ?? LCL_THC_USD_POR_WM;
  const thcFclUsd = (input.thcFclBrl ?? 1300) / cambio;

  const wm = Math.max(input.volumeM3, input.pesoKg / 1000);
  const custoLcl = wm * input.freteLclUsdPorWm + wm * thcWm + taxasFixas;
  const custoFcl = input.freteFclUsd + thcFclUsd;

  const cabe = input.volumeM3 <= cap.m3 && input.pesoKg <= cap.kg;
  const recomendacao = cabe && custoFcl < custoLcl ? "FCL" : "LCL";
  const economia = Math.abs(custoLcl - custoFcl);

  // Breakeven: volume (com peso proporcional ≤ densidade atual) em que LCL = FCL.
  const custoPorWm = input.freteLclUsdPorWm + thcWm;
  const breakevenM3 = custoPorWm > 0 ? (custoFcl - taxasFixas) / custoPorWm : null;

  return {
    wm,
    custoLclUsd: custoLcl,
    custoFclUsd: custoFcl,
    recomendacao,
    economiaUsd: economia,
    breakevenM3: breakevenM3 != null && breakevenM3 > 0 ? breakevenM3 : null,
    cabeNoFcl: cabe,
    detalhe:
      `LCL: ${wm.toFixed(1)} w/m × US$${input.freteLclUsdPorWm}/wm + THC US$${thcWm}/wm + fixas US$${taxasFixas} = US$${custoLcl.toFixed(0)}` +
      ` · FCL ${tipo}: frete US$${input.freteFclUsd} + THC ~US$${thcFclUsd.toFixed(0)} = US$${custoFcl.toFixed(0)}`,
  };
}

// ---------------------------------------------------------------------------
// THC / custos de porto
// ---------------------------------------------------------------------------

/** THC de referência do porto (case-insensitive; null se não mapeado). */
export function thcPorto(porto: string): number | null {
  const key = porto.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  return THC_REF_BRL[key] ?? null;
}
