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
 *
 * CONJUNTO DE OBSERVAÇÕES: além da `base` única (contrato original, mantido),
 * aceita `observacoes` — o conjunto inteiro de cotações conhecidas do item.
 * Elas passam por `precoNormalizacao` (FOB US$/kg) ANTES de qualquer
 * comparação, porque média entre Incoterms e unidades diferentes não tem
 * significado. A `base` única é o caso particular de uma lista de um elemento.
 */
import {
  normalizarObservacoes,
  type ObservacaoPreco,
  type ObservacaoNormalizada,
  type ExclusaoPreco,
  type OpcoesNormalizacao,
  type FontePreco,
} from "./precoNormalizacao";

export type { ObservacaoPreco } from "./precoNormalizacao";

export interface BaseRef {
  /** "ativo" é rótulo legado da base interna; o resto vem de `FontePreco`. */
  fonte: "ativo" | FontePreco;
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

/** O conjunto de observações, já normalizado para FOB US$/kg. */
export interface ConjuntoObservacoes {
  consideradas: ObservacaoNormalizada[];
  /** O que não deu para normalizar, com o motivo — nunca estimado. */
  excluidas: ExclusaoPreco[];
  /** Contagem por fonte entre as consideradas. */
  porFonte: Partial<Record<FontePreco, number>>;
  /** Fornecedores distintos — a mesma origem cotando N vezes não é N fontes. */
  fornecedoresDistintos: number;
  /**
   * Observação eleita representante do conjunto.
   *
   * PROVISÓRIO: hoje é a MAIS RECENTE entre as normalizadas. A média ponderada
   * (fonte × recência com meia-vida pela volatilidade × aderência de faixa,
   * com cluster por fornecedor) entra na etapa seguinte e substitui esta
   * escolha. "Mais recente" é um representante defensável; "mais barata" — o
   * critério hoje em `precificarReferencia.ts` — enviesa a base própria para
   * baixo, na mesma direção do viés declaratório do Comex Stat.
   */
  representativa: ObservacaoNormalizada | null;
  /** Faixa observada em US$/kg FOB entre as consideradas. */
  minUsdKg: number | null;
  maxUsdKg: number | null;
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
  /** Null quando o chamador não passou `observacoes` (contrato original). */
  conjunto: ConjuntoObservacoes | null;
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
  base?: BaseRef | null;
  externo?: ExternoRef | null;
  cambioHojeUsdBrl: number | null;
  /** câmbio da moeda da base → BRL hoje (para trazer a valor presente). */
  cambioHojeMoedaBrl?: number | null;
  /**
   * Conjunto completo de cotações conhecidas do item. Normalizado para FOB
   * US$/kg antes de qualquer comparação. Quando `base` não vem, ela é derivada
   * da observação representativa do conjunto.
   */
  observacoes?: ObservacaoPreco[];
  opcoesNormalizacao?: OpcoesNormalizacao;
}): ReferenciaPreco {
  const { termo, externo, cambioHojeUsdBrl, observacoes, opcoesNormalizacao } = input;

  // ----- Conjunto normalizado (FOB US$/kg) -----
  const conjunto = observacoes?.length
    ? montarConjunto(observacoes, opcoesNormalizacao ?? {})
    : null;

  // A base explícita tem precedência (contrato original). Sem ela, a
  // representativa do conjunto assume — já em base canônica.
  const base = input.base ?? (conjunto?.representativa ? baseDaNormalizada(conjunto.representativa, termo) : null);
  // Base derivada já está em USD: o câmbio de hoje dela é o próprio USD→BRL.
  const cambioHojeMoedaBrl = input.base
    ? (input.cambioHojeMoedaBrl ?? null)
    : (input.cambioHojeMoedaBrl ?? cambioHojeUsdBrl ?? null);

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
    conjunto,
    leitura: montarLeitura({ baseOut, externoOut, comparavel, maisCompetitivo, diffPct, conjunto }),
  };
}

/**
 * Normaliza o conjunto e elege a representativa.
 *
 * A eleição é por RECÊNCIA (quem não tem data vai para o fim), não por preço.
 * Escolher a mais barata — como a tool faz hoje — produz viés sistemático para
 * baixo, somando-se ao viés de subdeclaração da fonte pública.
 */
function montarConjunto(
  observacoes: ObservacaoPreco[],
  opts: OpcoesNormalizacao,
): ConjuntoObservacoes {
  const { consideradas, excluidas } = normalizarObservacoes(observacoes, opts);

  const porFonte: Partial<Record<FontePreco, number>> = {};
  const fornecedores = new Set<string>();
  for (const c of consideradas) {
    porFonte[c.obs.fonte] = (porFonte[c.obs.fonte] ?? 0) + 1;
    const chave = c.obs.fornecedorId != null
      ? `id:${c.obs.fornecedorId}`
      : (c.obs.fornecedor ?? "").trim().toLowerCase();
    if (chave) fornecedores.add(chave);
  }

  const representativa = consideradas.length
    ? [...consideradas].sort(
        (a, b) => (a.idadeMeses ?? Number.POSITIVE_INFINITY) - (b.idadeMeses ?? Number.POSITIVE_INFINITY),
      )[0]
    : null;

  const precos = consideradas.map((c) => c.precoUsdKg);

  return {
    consideradas,
    excluidas,
    porFonte,
    fornecedoresDistintos: fornecedores.size,
    representativa,
    minUsdKg: precos.length ? Math.min(...precos) : null,
    maxUsdKg: precos.length ? Math.max(...precos) : null,
  };
}

/** Converte uma observação normalizada no formato `BaseRef` (USD, kg). */
function baseDaNormalizada(n: ObservacaoNormalizada, termo: string): BaseRef {
  return {
    fonte: n.obs.fonte,
    produto: n.obs.produto ?? termo,
    ncm: n.obs.ncm ?? null,
    fornecedor: n.obs.fornecedor ?? null,
    moeda: "USD",
    precoUnit: n.precoUsdKg,
    unidade: "kg",
    dataCotacao: n.obs.dataCotacao ?? null,
    cambioNaData: n.obs.cambioUsdBrl ?? null,
  };
}

function brl(n: number | null | undefined): string {
  return n == null ? "n/d" : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Como cada fonte é nomeada na leitura — invoice pesa diferente de oferta. */
const ROTULO_FONTE: Record<string, string> = {
  invoice: "invoice executada",
  proforma: "última cotação na base",
  cotacao: "cotação recebida",
  manual: "referência lançada manualmente",
  mercado: "referência de mercado",
  ativo: "referência na base",
};

function montarLeitura(p: {
  baseOut: ReferenciaPreco["base"];
  externoOut: ReferenciaPreco["externo"];
  comparavel: boolean;
  maisCompetitivo: ReferenciaPreco["maisCompetitivo"];
  diffPct: number | null;
  conjunto?: ConjuntoObservacoes | null;
}): string {
  const { baseOut, externoOut, comparavel, maisCompetitivo, diffPct, conjunto } = p;

  if (!baseOut && !externoOut?.disponivel) {
    return "Sem preço na base e sem dado externo para este item.";
  }

  const partes: string[] = [];

  if (baseOut) {
    const fnt = ROTULO_FONTE[baseOut.fonte] ?? "referência na base";
    let l = `Pela ${fnt} (${baseOut.fornecedor || "fornecedor n/d"}): ${baseOut.moeda} ${baseOut.precoUnit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/${baseOut.unidade}`;
    if (baseOut.brlPresente != null) l += ` → a valor presente ${brl(baseOut.brlPresente)}/${baseOut.unidade}`;
    if (baseOut.variacaoCambialPct != null && Math.abs(baseOut.variacaoCambialPct) >= 1) {
      l += ` (câmbio ${baseOut.variacaoCambialPct >= 0 ? "subiu" : "caiu"} ${Math.abs(baseOut.variacaoCambialPct).toFixed(1)}% desde a cotação)`;
    }
    partes.push(l + ".");
  }

  // Composição do conjunto — factual, sem enquadrar como fragilidade. A
  // decisão de produto de não expor a idade do dado ao usuário continua
  // valendo; aqui só se diz quantas cotações sustentam o número e em que
  // faixa elas caem, o que é argumento de negociação, não confissão.
  if (conjunto && conjunto.consideradas.length >= 2 && conjunto.minUsdKg != null && conjunto.maxUsdKg != null) {
    const n = conjunto.consideradas.length;
    const forn = conjunto.fornecedoresDistintos;
    partes.push(
      `Base com ${n} cotações normalizadas a FOB US$/kg` +
      (forn > 1 ? ` de ${forn} fornecedores` : "") +
      `: US$ ${conjunto.minUsdKg.toFixed(2)}–${conjunto.maxUsdKg.toFixed(2)}/kg.`,
    );
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
