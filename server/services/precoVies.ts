/**
 * precoVies — estima o fator de subdeclaração das fontes declaratórias.
 *
 * O PROBLEMA. Comex Stat (e as bases pagas) publicam o que os importadores
 * DECLARARAM. Parte declara a menor, então a média oficial fica abaixo do
 * preço real. O erro é SISTEMÁTICO e direcional — não some com mais amostra.
 *
 * POR QUE NÃO SE RESOLVE COM PESO. Baixar o peso da fonte enviesada reduz a
 * influência dela, mas o que entra na média continua puxando para baixo. Só
 * que menos. Viés direcional exige CORREÇÃO: multiplicar o valor declarado por
 * um fator k.
 *
 * DE ONDE SAI O k. Não é arbitrado: é medido. Onde existe invoice própria E
 * valor declarado para a mesma NCM no mesmo período, a razão entre os dois é
 * uma observação direta do fator. A estimativa é a MEDIANA dessas razões —
 * não a média, porque a cauda é suja (mix de produtos dentro da mesma NCM,
 * negócio pontual, erro de unidade) e a mediana não se deixa arrastar por
 * poucos pontos extremos.
 *
 * HIERARQUIA. Sobreposição por NCM de 8 dígitos costuma ser fina. Quando falta
 * amostra, o estimador sobe a própria hierarquia da nomenclatura —
 * NCM8 → SH6 → SH4 → capítulo → global — e informa de que nível veio. Subir
 * troca especificidade por amostra, e o chamador precisa saber qual dos dois
 * ele está recebendo.
 *
 * QUANDO NÃO DÁ, k = 1 COM `estimado: false`. Não corrigir é uma resposta
 * honesta; inventar um fator plausível não é. O aviso correspondente já existe
 * na ponderação ("fonte declaratória sem correção de viés").
 *
 * CAMADA PURA: recebe os pares já coletados e calcula.
 */

export type NivelEstimativa = "ncm8" | "sh6" | "sh4" | "capitulo" | "global" | "nenhum";

/** Uma sobreposição: o mesmo item, na mesma base, pelos dois caminhos. */
export interface ParObservado {
  /** NCM de 8 dígitos, só dígitos. */
  ncm: string;
  /** Preço da NOSSA base (invoice/proforma), em US$ por unidade canônica. */
  precoProprio: number;
  /** Preço DECLARADO (Comex Stat etc.), na MESMA base e unidade. */
  precoDeclarado: number;
  /** ISO yyyy-mm-dd — usada para a janela temporal. */
  data?: string | null;
}

export interface FatorVies {
  /** Multiplica o preço declarado. 1 = sem correção. */
  k: number;
  nivel: NivelEstimativa;
  /** Prefixo da NCM usado (ex.: "28369920", "2836", "28"); null em global/nenhum. */
  chave: string | null;
  /** Pares que sustentaram a estimativa. */
  n: number;
  /** false quando não houve amostra suficiente em nenhum nível. */
  estimado: boolean;
  /** true quando o valor bruto foi aparado para a faixa admissível. */
  limitado: boolean;
  /** Dispersão robusta (MAD relativa à mediana), em %. */
  dispersaoPct: number | null;
  aviso: string | null;
}

/**
 * Amostra mínima por nível. Mais larga a agregação, mais heterogêneo o que
 * está dentro — então exige-se mais evidência para confiar na mediana.
 */
const MINIMO_POR_NIVEL: Record<Exclude<NivelEstimativa, "nenhum">, number> = {
  ncm8: 3,
  sh6: 4,
  sh4: 5,
  capitulo: 8,
  global: 12,
};

/**
 * Faixa admissível do fator. Fora dela, o dado quase certamente está sujo
 * (base trocada, unidade errada, produto diferente dentro da mesma NCM), e
 * aplicar o valor bruto faria mais estrago que não corrigir.
 *
 * O piso abaixo de 1 é proposital: se a medição disser que nosso preço é
 * MENOR que o declarado, isso é evidência contra a hipótese de subdeclaração
 * naquela NCM, e merece aparecer — com aviso — em vez de ser silenciada.
 */
const K_MIN = 0.7;
const K_MAX = 2.5;

/** Janela padrão: razões muito antigas descrevem outro mercado. */
const JANELA_PADRAO_MESES = 36;

const MS_POR_MES = 30.44 * 24 * 3600 * 1000;

export interface OpcoesVies {
  /** Injetável para teste. Default: agora. */
  hoje?: Date;
  /** Descarta pares mais antigos que isto. Default: 36 meses. */
  janelaMeses?: number;
  /** Permite exigir um nível específico (teste e auditoria). */
  nivelMinimo?: Exclude<NivelEstimativa, "nenhum">;
}

function digitos(ncm: string): string {
  return String(ncm ?? "").replace(/\D/g, "");
}

/** Prefixo da NCM correspondente a cada nível de agregação. */
function chaveDoNivel(ncm: string, nivel: Exclude<NivelEstimativa, "nenhum">): string | null {
  const d = digitos(ncm);
  switch (nivel) {
    case "ncm8": return d.length >= 8 ? d.slice(0, 8) : null;
    case "sh6": return d.length >= 6 ? d.slice(0, 6) : null;
    case "sh4": return d.length >= 4 ? d.slice(0, 4) : null;
    case "capitulo": return d.length >= 2 ? d.slice(0, 2) : null;
    case "global": return null;
  }
}

export function mediana(valores: number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Desvio absoluto mediano — companheiro robusto da mediana. Resiste a
 * outliers que arruinariam um desvio-padrão.
 */
export function mad(valores: number[]): number | null {
  const med = mediana(valores);
  if (med == null) return null;
  return mediana(valores.map((v) => Math.abs(v - med)));
}

/** Pares válidos: ambos os preços positivos e dentro da janela. */
function filtrarPares(pares: ParObservado[], opts: OpcoesVies): ParObservado[] {
  const hoje = opts.hoje ?? new Date();
  const janela = opts.janelaMeses ?? JANELA_PADRAO_MESES;
  return (pares ?? []).filter((p) => {
    if (!(p.precoProprio > 0) || !(p.precoDeclarado > 0)) return false;
    if (!p.data) return true; // sem data entra; a janela não pode excluir por omissão
    const t = new Date(p.data).getTime();
    if (!Number.isFinite(t)) return true;
    return (hoje.getTime() - t) / MS_POR_MES <= janela;
  });
}

const ORDEM_NIVEIS: Array<Exclude<NivelEstimativa, "nenhum">> = [
  "ncm8", "sh6", "sh4", "capitulo", "global",
];

/**
 * Estima o fator de viés para uma NCM, descendo a hierarquia até achar
 * amostra suficiente.
 */
export function estimarFatorVies(
  ncmAlvo: string,
  pares: ParObservado[],
  opts: OpcoesVies = {},
): FatorVies {
  const validos = filtrarPares(pares, opts);
  const naoEstimado: FatorVies = {
    k: 1, nivel: "nenhum", chave: null, n: 0, estimado: false,
    limitado: false, dispersaoPct: null,
    aviso: "Sem sobreposição suficiente entre base própria e fonte declaratória — valor declarado usado sem correção.",
  };
  if (!validos.length) return naoEstimado;

  const inicio = opts.nivelMinimo ? ORDEM_NIVEIS.indexOf(opts.nivelMinimo) : 0;

  for (let i = Math.max(0, inicio); i < ORDEM_NIVEIS.length; i++) {
    const nivel = ORDEM_NIVEIS[i];
    const chave = chaveDoNivel(ncmAlvo, nivel);
    if (nivel !== "global" && !chave) continue;

    const doNivel = nivel === "global"
      ? validos
      : validos.filter((p) => digitos(p.ncm).startsWith(chave as string));

    if (doNivel.length < MINIMO_POR_NIVEL[nivel]) continue;

    const razoes = doNivel.map((p) => p.precoProprio / p.precoDeclarado);
    const bruto = mediana(razoes);
    if (bruto == null || !Number.isFinite(bruto) || bruto <= 0) continue;

    const k = Math.min(K_MAX, Math.max(K_MIN, bruto));
    const limitado = k !== bruto;

    const dispersao = mad(razoes);
    const dispersaoPct = dispersao != null && bruto > 0 ? (dispersao / bruto) * 100 : null;

    const avisos: string[] = [];
    if (limitado) {
      avisos.push(
        `Fator bruto ${bruto.toFixed(2)} fora da faixa admissível — aparado para ${k.toFixed(2)}; ` +
        "verifique se a base de comparação é a mesma.",
      );
    }
    if (nivel !== "ncm8") {
      avisos.push(`Estimado no nível ${rotuloNivel(nivel)}, não na NCM específica — menos preciso.`);
    }
    if (bruto < 1) {
      avisos.push(
        "A medição indica preço próprio ABAIXO do declarado nesta faixa — evidência contra subdeclaração aqui.",
      );
    }
    if (dispersaoPct != null && dispersaoPct > 40) {
      avisos.push(`Razões muito dispersas (${dispersaoPct.toFixed(0)}%) — o fator é indicativo.`);
    }

    return {
      k,
      nivel,
      chave,
      n: doNivel.length,
      estimado: true,
      limitado,
      dispersaoPct,
      aviso: avisos.length ? avisos.join(" ") : null,
    };
  }

  return naoEstimado;
}

function rotuloNivel(nivel: NivelEstimativa): string {
  return { ncm8: "NCM", sh6: "subposição (SH6)", sh4: "posição (SH4)", capitulo: "capítulo", global: "geral", nenhum: "—" }[nivel];
}

/**
 * Atalho para a ponderação: devolve o mapa `correcaoPorFonte` já no formato
 * que `ponderarPrecos` espera. Só a fonte "mercado" é corrigida — a base
 * própria é a referência contra a qual o fator foi medido, então corrigi-la
 * seria circular.
 */
export function correcaoParaPonderacao(fator: FatorVies): { mercado: number } | undefined {
  return fator.estimado ? { mercado: fator.k } : undefined;
}
