/**
 * Reference Pricing Service — preço de referência a VALOR PRESENTE e comparação
 * com dados externos oficiais.
 *
 * É o motor por trás do fluxo "quanto custaria importar tal item?":
 *  1) o último preço cotado na NOSSA base é trazido a valor presente (câmbio de
 *     hoje vs câmbio da data da cotação);
 *  2) compara-se com o preço médio OFICIAL de importação (Comex Stat);
 *  3) recomenda-se o mais competitivo — argumento direto de negociação.
 *
 * Esta camada é PURA (sem rede/DB): recebe os dados já coletados e calcula. A
 * coleta fica na tool (precificar_referencia). GUARDRAIL: é referência/apoio à
 * decisão, não cálculo fiscal — o custo nacionalizado sai do motor certificado.
 */

export interface BaseRef {
  fonte: "proforma" | "ativo";
  produto: string;
  ncm: string | null;
  fornecedor: string | null;
  moeda: string;          // ISO: USD, EUR, BRL...
  precoUnit: number;      // por unidade, na moeda
  unidade: string;
  dataCotacao: string | null; // ISO yyyy-mm-dd
  /** câmbio moeda→BRL vigente na data da cotação (null se desconhecido). */
  cambioNaData: number | null;
}

export interface ExternoRef {
  disponivel: boolean;
  ncm: string;
  precoMedioUsdKg: number | null;
  tendenciaPreco: string;
  topOrigens: Array<{ pais: string; precoMedioUsdKg: number | null }>;
  /** "brasil" = importação para o Brasil (Comex Stat); "global" = mundo (Comtrade). */
  escopo: "brasil" | "global";
}

export interface ReferenciaPreco {
  termo: string;
  encontrouBase: boolean;
  base: (BaseRef & {
    brlNaData: number | null;
    brlPresente: number | null;
    variacaoCambialPct: number | null;
  }) | null;
  externo: (ExternoRef & {
    brlPorKgPresente: number | null;
  }) | null;
  cambioHojeUsdBrl: number | null;
  /** comparação direta só é válida quando a base é por kg. */
  comparavel: boolean;
  /** quem está mais barato: "base" | "externo" | "empate" | null */
  maisCompetitivo: "base" | "externo" | "empate" | null;
  diffPct: number | null; // base vs externo, % (negativo = base mais barata)
  leitura: string;        // texto curto pronto para a Excambia adaptar
}

const KG_RE = /\b(kg|quilo|quilograma|kilogram)\b/i;

function isKg(unidade: string): boolean {
  return KG_RE.test(unidade || "");
}

/**
 * Valor presente de um preço cotado: traz o preço (na moeda) para BRL de hoje e
 * para BRL da data da cotação, e calcula a variação cambial entre os dois.
 */
export function valorPresente(
  precoUnit: number,
  cambioNaData: number | null,
  cambioHoje: number | null,
): { brlNaData: number | null; brlPresente: number | null; variacaoCambialPct: number | null } {
  const taxaHoje = cambioHoje ?? cambioNaData;
  const taxaData = cambioNaData ?? cambioHoje;
  return {
    brlNaData: taxaData != null ? precoUnit * taxaData : null,
    brlPresente: taxaHoje != null ? precoUnit * taxaHoje : null,
    variacaoCambialPct: taxaData && taxaHoje ? ((taxaHoje - taxaData) / taxaData) * 100 : null,
  };
}

/**
 * Calcula valor presente + comparação. Tudo opcional: se faltar base ou externo,
 * preenche o que dá e a `leitura` reflete o que foi possível.
 */
export function montarReferencia(input: {
  termo: string;
  base: BaseRef | null;
  externo: ExternoRef | null;
  cambioHojeUsdBrl: number | null;
  /** câmbio da moeda da base → BRL hoje (para trazer a valor presente). */
  cambioHojeMoedaBrl: number | null;
}): ReferenciaPreco {
  const { termo, base, externo, cambioHojeUsdBrl, cambioHojeMoedaBrl } = input;

  // ----- Base a valor presente -----
  let baseOut: ReferenciaPreco["base"] = null;
  if (base) {
    const vp = valorPresente(base.precoUnit, base.cambioNaData, cambioHojeMoedaBrl);
    baseOut = { ...base, ...vp };
  }

  // ----- Externo (Comex Stat) a valor presente -----
  let externoOut: ReferenciaPreco["externo"] = null;
  if (externo) {
    const brlPorKgPresente =
      externo.precoMedioUsdKg != null && cambioHojeUsdBrl != null
        ? externo.precoMedioUsdKg * cambioHojeUsdBrl
        : null;
    externoOut = { ...externo, brlPorKgPresente };
  }

  // ----- Comparação (só direta quando a base é por kg) -----
  let comparavel = false;
  let maisCompetitivo: ReferenciaPreco["maisCompetitivo"] = null;
  let diffPct: number | null = null;

  if (
    baseOut?.brlPresente != null &&
    externoOut?.brlPorKgPresente != null &&
    isKg(baseOut.unidade)
  ) {
    comparavel = true;
    const b = baseOut.brlPresente;
    const e = externoOut.brlPorKgPresente;
    diffPct = ((b - e) / e) * 100;
    maisCompetitivo = Math.abs(diffPct) < 2 ? "empate" : b < e ? "base" : "externo";
  }

  return {
    termo,
    encontrouBase: Boolean(base),
    base: baseOut,
    externo: externoOut,
    cambioHojeUsdBrl: cambioHojeUsdBrl ?? null,
    comparavel,
    maisCompetitivo,
    diffPct,
    leitura: montarLeitura({ baseOut, externoOut, comparavel, maisCompetitivo, diffPct }),
  };
}

function brl(n: number | null | undefined): string {
  return n == null ? "n/d" : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function montarLeitura(p: {
  baseOut: ReferenciaPreco["base"];
  externoOut: ReferenciaPreco["externo"];
  comparavel: boolean;
  maisCompetitivo: ReferenciaPreco["maisCompetitivo"];
  diffPct: number | null;
}): string {
  const { baseOut, externoOut, comparavel, maisCompetitivo, diffPct } = p;

  if (!baseOut && !externoOut?.disponivel) {
    return "Sem preço na base e sem dado externo para este item.";
  }

  const partes: string[] = [];

  if (baseOut) {
    const fnt = baseOut.fonte === "proforma" ? "última cotação na base" : "referência na base";
    let l = `Pela ${fnt} (${baseOut.fornecedor || "fornecedor n/d"}): ${baseOut.moeda} ${baseOut.precoUnit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/${baseOut.unidade}`;
    if (baseOut.brlPresente != null) l += ` → a valor presente ${brl(baseOut.brlPresente)}/${baseOut.unidade}`;
    if (baseOut.variacaoCambialPct != null && Math.abs(baseOut.variacaoCambialPct) >= 1) {
      l += ` (câmbio ${baseOut.variacaoCambialPct >= 0 ? "subiu" : "caiu"} ${Math.abs(baseOut.variacaoCambialPct).toFixed(1)}% desde a cotação)`;
    }
    partes.push(l + ".");
  }

  if (externoOut?.disponivel && externoOut.precoMedioUsdKg != null) {
    // Brasil (Comex Stat) → sem rótulo. Global (Comtrade) → sinaliza sutilmente.
    const rotulo = externoOut.escopo === "global"
      ? "Preço médio de referência global"
      : "Média de importação para o Brasil";
    let l = `${rotulo}: US$ ${externoOut.precoMedioUsdKg.toFixed(2)}/kg`;
    if (externoOut.brlPorKgPresente != null) l += ` (~${brl(externoOut.brlPorKgPresente)}/kg)`;
    partes.push(l + ".");
  }

  if (comparavel && maisCompetitivo && diffPct != null) {
    if (maisCompetitivo === "base") {
      partes.push(`Sua base está ${Math.abs(diffPct).toFixed(0)}% ABAIXO da média oficial — preço competitivo; bom argumento para manter/fechar.`);
    } else if (maisCompetitivo === "externo") {
      partes.push(`Sua base está ${Math.abs(diffPct).toFixed(0)}% ACIMA da média oficial — há espaço para negociar; use a média como alavanca.`);
    } else {
      partes.push("Sua base está em linha com a média oficial.");
    }
  } else if (baseOut && externoOut?.disponivel) {
    partes.push("Comparação direta limitada: a base está por unidade e o oficial por kg — confirme o peso por unidade para comparar com precisão.");
  }

  return partes.join(" ");
}
