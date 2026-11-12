/**
 * precoNormalizacao — traz observações de preço para uma BASE CANÔNICA comum
 * antes de qualquer média.
 *
 * POR QUE ISTO EXISTE: a consolidação antiga somava `brlPresente` de
 * observações em unidades divergentes (R$/kg com R$/unidade) e Incoterms
 * divergentes (FOB de um fornecedor com CIF de outro). Média entre bases
 * diferentes não é imprecisão de arredondamento — é número sem significado.
 *
 * BASE CANÔNICA POR FAMÍLIA DE UNIDADE. Invoices e cotações declaram a unidade
 * de medida: tonelada, milheiro, metro, unidade. Converter tudo para kg seria
 * errado — milheiro de prego compara com milheiro, metro de cabo com metro.
 * Dentro de uma família a conversão é exata e segura:
 *
 *   massa       → kg    (t, g, lb)
 *   contagem    → un    (milheiro, cento, dúzia, par)
 *   comprimento → m     (km, cm, mm, pé, jarda)
 *   área        → m²
 *   volume      → L     (mL, m³)
 *
 * ENTRE famílias só há conversão com propriedade física conhecida: contagem ↔
 * massa exige `pesoUnitarioKg`. Sem isso, a observação é excluída com motivo —
 * nunca estimada. Comex Stat publica US$/kg, então só entra na comparação
 * quando a base canônica do conjunto é massa.
 *
 * REGRA DURA — nunca converter no chute. Falta peso, falta o frete embutido no
 * CIF, falta câmbio da data, a unidade é ambígua ("MT" é tonelada métrica ou
 * metro?): a observação sai do conjunto COM MOTIVO EXPLÍCITO, para quem chamou
 * poder dizer ao usuário o que ficou de fora e por quê. É a mesma disciplina
 * que separa "não encontrei" de "não consegui consultar".
 *
 * CAMADA PURA: sem rede, sem banco, sem relógio implícito (`hoje` é injetável).
 */

export type FontePreco = "invoice" | "proforma" | "cotacao" | "manual" | "mercado";

export type FamiliaUnidade = "massa" | "contagem" | "comprimento" | "area" | "volume";

/** Agrupamento de Incoterm pelo que precisa ser somado/subtraído para chegar a FOB. */
export type GrupoIncoterm =
  | "fob"            // já é a base canônica
  | "pre_embarque"   // EXW, FCA, FAS — falta levar até o costado/embarcar
  | "pos_embarque"   // CFR, CIF, CPT, CIP — já embute frete (e seguro)
  | "entregue"       // DAP, DPU, DDP — embute frete, seguro e mais
  | "desconhecido";

export type FaixaQuantidade = "amostra" | "parcial" | "conteiner" | "multiplo";

export type MotivoExclusao =
  | "preco_invalido"
  | "sem_cambio"
  | "unidade_desconhecida"
  | "unidade_ambigua"
  | "familia_incompativel"
  | "sem_peso_unitario"
  | "incoterm_desconhecido"
  | "incoterm_sem_componentes"
  | "ajuste_invalido";

/** A unidade de referência de cada família. */
export const UNIDADE_CANONICA: Record<FamiliaUnidade, string> = {
  massa: "kg",
  contagem: "un",
  comprimento: "m",
  area: "m²",
  volume: "L",
};

/** Uma observação de preço como ela chega da base ou de fonte externa. */
export interface ObservacaoPreco {
  /** Identificador de origem (id da linha, nº da proforma) — só para rastreio. */
  ref?: string;
  fonte: FontePreco;
  fornecedorId?: number | null;
  fornecedor?: string | null;
  produto?: string;
  ncm?: string | null;

  /** Preço por `unidade`, na `moeda`. */
  precoUnit: number;
  moeda: string;
  unidade: string;

  /** Quantidade cotada, na mesma `unidade`. */
  quantidade?: number | null;
  /** Peso de UMA peça, em kg — ponte entre contagem e massa. */
  pesoUnitarioKg?: number | null;

  incoterm?: string | null;
  /**
   * Componentes para converter o Incoterm, POR UNIDADE e na MESMA moeda do
   * preço. Sem eles não há conversão: CIF→FOB exige saber o frete embutido.
   */
  freteUnit?: number | null;
  seguroUnit?: number | null;
  /** Custos até o embarque (EXW/FCA/FAS → FOB). Zero é um valor válido. */
  despesasEmbarqueUnit?: number | null;

  /** ISO yyyy-mm-dd. */
  dataCotacao?: string | null;

  /** Câmbio moeda→USD na data da cotação. Tem precedência sobre o par BRL. */
  cambioMoedaUsd?: number | null;
  /** Alternativa: moeda→BRL e USD→BRL na data (deriva moeda→USD). */
  cambioMoedaBrl?: number | null;
  cambioUsdBrl?: number | null;
}

export interface ObservacaoNormalizada {
  obs: ObservacaoPreco;
  /** Preço em USD por unidade canônica da família do conjunto. */
  precoUsdCanonico: number;
  /** Quantidade convertida para a unidade canônica (null se não informada). */
  quantidadeCanonica: number | null;
  faixa: FaixaQuantidade | null;
  /** Meses entre `dataCotacao` e `hoje` (null quando não há data). */
  idadeMeses: number | null;
  /** O que foi aplicado, em ordem — para a memória de cálculo. */
  ajustes: string[];
}

export interface ExclusaoPreco {
  obs: ObservacaoPreco;
  motivo: MotivoExclusao;
  detalhe: string;
}

export interface OpcoesNormalizacao {
  /** Injetável para teste. Default: agora. */
  hoje?: Date;
  /**
   * Trata Incoterm ausente como FOB. DESLIGADO por padrão: assumir a base
   * errada desloca o preço inteiro em silêncio. Ligue só quando a origem do
   * dado garantir FOB (Comex Stat publica FOB).
   */
  assumirFobQuandoDesconhecido?: boolean;
  /**
   * Família alvo. Omitida: detectada do próprio conjunto (a mais frequente;
   * empate resolve em massa, que é a base do Comex Stat).
   */
  familia?: FamiliaUnidade;
}

export interface NormalizacaoResultado {
  consideradas: ObservacaoNormalizada[];
  excluidas: ExclusaoPreco[];
  /** Família eleita para o conjunto. Null quando nada foi interpretável. */
  familia: FamiliaUnidade | null;
  /** Rótulo da unidade canônica correspondente ("kg", "un", "m"…). */
  unidadeCanonica: string | null;
}

const MS_POR_MES = 30.44 * 24 * 3600 * 1000;

/**
 * `fator` = quantas unidades CANÔNICAS cabem em uma unidade cotada.
 * 1 tonelada = 1000 kg; 1 milheiro = 1000 un; 1 pé = 0,3048 m.
 */
const UNIDADES: Array<{ re: RegExp; familia: FamiliaUnidade; fator: number }> = [
  // ---- massa → kg
  { re: /^(kgs?|quilos?|quilogramas?|kilograms?|kilos?)$/i, familia: "massa", fator: 1 },
  { re: /^(t|ton|tons|tonelada|toneladas|tonne|tonnes|tm)$/i, familia: "massa", fator: 1000 },
  { re: /^(g|gr|gramas?|grams?)$/i, familia: "massa", fator: 0.001 },
  { re: /^(lb|lbs|libras?|pounds?)$/i, familia: "massa", fator: 0.45359237 },
  { re: /^(arroba|@)$/i, familia: "massa", fator: 15 },
  // ---- contagem → un
  { re: /^(un|und|unid|unidade|unidades|pc|pcs|pç|peca|pecas|peça|peças|piece|pieces|ea|each)$/i, familia: "contagem", fator: 1 },
  { re: /^(milheiro|milheiros|mlh|mil|m²?il)$/i, familia: "contagem", fator: 1000 },
  { re: /^(cento|centos)$/i, familia: "contagem", fator: 100 },
  { re: /^(duzia|duzias|dz|dozen)$/i, familia: "contagem", fator: 12 },
  { re: /^(par|pares|pair|pairs|pr)$/i, familia: "contagem", fator: 2 },
  // ---- comprimento → m
  { re: /^(m|metro|metros|meter|meters)$/i, familia: "comprimento", fator: 1 },
  { re: /^(km|quilometros?)$/i, familia: "comprimento", fator: 1000 },
  { re: /^(cm|centimetros?)$/i, familia: "comprimento", fator: 0.01 },
  { re: /^(mm|milimetros?)$/i, familia: "comprimento", fator: 0.001 },
  { re: /^(pe|pes|ft|feet|foot)$/i, familia: "comprimento", fator: 0.3048 },
  { re: /^(jarda|jardas|yd|yard|yards)$/i, familia: "comprimento", fator: 0.9144 },
  // ---- área → m²
  { re: /^(m2|m²|metro quadrado|metros quadrados|sqm)$/i, familia: "area", fator: 1 },
  { re: /^(cm2|cm²)$/i, familia: "area", fator: 0.0001 },
  { re: /^(ft2|ft²|sqft)$/i, familia: "area", fator: 0.09290304 },
  // ---- volume → L
  { re: /^(l|lt|lts|litro|litros|liter|liters)$/i, familia: "volume", fator: 1 },
  { re: /^(ml|mililitros?)$/i, familia: "volume", fator: 0.001 },
  { re: /^(m3|m³|metro cubico|metros cubicos)$/i, familia: "volume", fator: 1000 },
  { re: /^(gal|galao|galoes|gallon|gallons)$/i, familia: "volume", fator: 3.785411784 },
];

/**
 * Unidades que significam coisas diferentes conforme o contexto e por isso
 * NÃO são interpretadas. "MT" é tonelada métrica no comércio exterior e metro
 * em obra; "cx" depende de quantas peças cabem na caixa. Adivinhar aqui
 * desloca o preço por ordens de grandeza.
 */
const UNIDADES_AMBIGUAS = /^(mt|mts|cx|caixa|caixas|box|boxes|fardo|fardos|pacote|pacotes|pack|rolo|rolos|roll|bobina|bobinas|saco|sacos|bag|bags|lote|lotes|kit|kits|set|sets|cj|conjunto)$/i;

const GRUPO_POR_INCOTERM: Record<string, GrupoIncoterm> = {
  FOB: "fob",
  EXW: "pre_embarque", FCA: "pre_embarque", FAS: "pre_embarque",
  CFR: "pos_embarque", CIF: "pos_embarque", CPT: "pos_embarque", CIP: "pos_embarque",
  CNF: "pos_embarque",
  DAP: "entregue", DPU: "entregue", DDP: "entregue", DAT: "entregue", DDU: "entregue",
};

/**
 * Limiares de faixa por família, em unidade canônica. São parâmetros de
 * calibração, não verdade — um dia saem para tabela versionada.
 */
const LIMIARES: Record<FamiliaUnidade, [number, number, number]> = {
  massa: [100, 5_000, 28_000],       // kg — contêiner marítimo 20'/40'
  contagem: [100, 5_000, 50_000],    // un
  comprimento: [100, 5_000, 50_000], // m
  area: [50, 1_000, 10_000],         // m²
  volume: [100, 5_000, 25_000],      // L
};

/** Normaliza a grafia de uma unidade para casar com a tabela. */
function limparUnidade(unidade: string): string {
  return String(unidade ?? "")
    .trim()
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-̂̄-ͯ]/g, ""); // mantém cedilha de "peça"
}

export interface UnidadeInterpretada {
  familia: FamiliaUnidade;
  /** Unidades canônicas por unidade cotada. */
  fator: number;
}

/**
 * Interpreta a unidade cotada.
 * - objeto: família + fator;
 * - "ambigua": reconhecida como armadilha (MT, caixa, rolo…);
 * - null: desconhecida.
 */
export function interpretarUnidade(unidade: string): UnidadeInterpretada | "ambigua" | null {
  const u = limparUnidade(unidade);
  if (!u) return null;
  if (UNIDADES_AMBIGUAS.test(u)) return "ambigua";
  for (const { re, familia, fator } of UNIDADES) {
    if (re.test(u)) return { familia, fator };
  }
  return null;
}

/** Classifica o Incoterm pelo que falta ajustar até FOB. */
export function grupoIncoterm(incoterm: string | null | undefined): GrupoIncoterm {
  const sigla = String(incoterm ?? "").trim().toUpperCase().slice(0, 3);
  if (!sigla) return "desconhecido";
  return GRUPO_POR_INCOTERM[sigla] ?? "desconhecido";
}

/** Faixa de quantidade, para a aderência pesar cotação de amostra vs de lote. */
export function faixaQuantidade(
  quantidadeCanonica: number | null,
  familia: FamiliaUnidade,
): FaixaQuantidade | null {
  const q = quantidadeCanonica;
  if (q == null || !Number.isFinite(q) || q <= 0) return null;
  const [amostra, parcial, conteiner] = LIMIARES[familia];
  if (q < amostra) return "amostra";
  if (q < parcial) return "parcial";
  if (q <= conteiner) return "conteiner";
  return "multiplo";
}

/** Câmbio moeda→USD: direto, ou derivado do par BRL. */
function cambioParaUsd(obs: ObservacaoPreco): number | null {
  if (obs.cambioMoedaUsd != null && obs.cambioMoedaUsd > 0) return obs.cambioMoedaUsd;
  const { cambioMoedaBrl: mBrl, cambioUsdBrl: uBrl } = obs;
  if (mBrl != null && mBrl > 0 && uBrl != null && uBrl > 0) return mBrl / uBrl;
  if (String(obs.moeda ?? "").trim().toUpperCase() === "USD") return 1;
  return null;
}

function ehNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Leva o preço ao Incoterm FOB. Devolve o preço ajustado e o que foi aplicado,
 * ou um motivo de exclusão quando os componentes não estão disponíveis.
 *
 * `0` é componente VÁLIDO (frete zero é informação); só `null` e `undefined`
 * significam ausência.
 */
function ajustarParaFob(
  obs: ObservacaoPreco,
  opts: OpcoesNormalizacao,
): { preco: number; ajustes: string[] } | { motivo: MotivoExclusao; detalhe: string } {
  const grupo = grupoIncoterm(obs.incoterm);
  const ajustes: string[] = [];

  if (grupo === "desconhecido") {
    if (!opts.assumirFobQuandoDesconhecido) {
      return {
        motivo: "incoterm_desconhecido",
        detalhe: obs.incoterm
          ? `Incoterm "${obs.incoterm}" não reconhecido.`
          : "Incoterm não informado — a base do preço é indeterminada.",
      };
    }
    ajustes.push("Incoterm ausente assumido como FOB (opção explícita do chamador)");
    return { preco: obs.precoUnit, ajustes };
  }

  if (grupo === "fob") return { preco: obs.precoUnit, ajustes };

  if (grupo === "pre_embarque") {
    const desp = obs.despesasEmbarqueUnit;
    if (!ehNumero(desp)) {
      return {
        motivo: "incoterm_sem_componentes",
        detalhe: `${obs.incoterm} → FOB exige as despesas até o embarque (despesasEmbarqueUnit).`,
      };
    }
    if (desp < 0) return { motivo: "ajuste_invalido", detalhe: "Despesas de embarque negativas." };
    ajustes.push(`${obs.incoterm}→FOB: +${desp} ${obs.moeda}/${obs.unidade} de despesas até o embarque`);
    return { preco: obs.precoUnit + desp, ajustes };
  }

  // pos_embarque e entregue: subtrair o que está embutido.
  const frete = obs.freteUnit;
  const seguro = obs.seguroUnit ?? 0;
  if (!ehNumero(frete)) {
    return {
      motivo: "incoterm_sem_componentes",
      detalhe: `${obs.incoterm} → FOB exige o frete embutido (freteUnit).`,
    };
  }
  if (frete < 0 || seguro < 0) {
    return { motivo: "ajuste_invalido", detalhe: "Frete ou seguro negativos." };
  }
  const preco = obs.precoUnit - frete - seguro;
  if (preco <= 0) {
    return {
      motivo: "ajuste_invalido",
      detalhe: `${obs.incoterm} → FOB resultaria em ${preco} — frete/seguro maiores que o preço.`,
    };
  }
  ajustes.push(
    `${obs.incoterm}→FOB: −${frete}${seguro ? ` −${seguro}` : ""} ${obs.moeda}/${obs.unidade} (frete${seguro ? " e seguro" : ""} embutidos)`,
  );
  if (grupo === "entregue") {
    ajustes.push(`ATENÇÃO: ${obs.incoterm} embute também custos no destino não deduzidos — FOB resultante é teto`);
  }
  return { preco, ajustes };
}

/**
 * Converte o preço da unidade cotada para a unidade canônica da família alvo.
 * Dentro da família é aritmética; entre contagem e massa exige peso unitário.
 */
function converterUnidade(
  obs: ObservacaoPreco,
  interp: UnidadeInterpretada,
  alvo: FamiliaUnidade,
): { divisor: number; ajustes: string[] } | { motivo: MotivoExclusao; detalhe: string } {
  const ajustes: string[] = [];
  const canonAlvo = UNIDADE_CANONICA[alvo];

  if (interp.familia === alvo) {
    if (interp.fator !== 1) ajustes.push(`${obs.unidade}→${canonAlvo}: ÷${interp.fator}`);
    return { divisor: interp.fator, ajustes };
  }

  const peso = obs.pesoUnitarioKg;
  const pontePossivel =
    (interp.familia === "contagem" && alvo === "massa") ||
    (interp.familia === "massa" && alvo === "contagem");

  if (!pontePossivel) {
    return {
      motivo: "familia_incompativel",
      detalhe: `"${obs.unidade}" é de ${interp.familia}; o conjunto está em ${alvo} (${canonAlvo}). ` +
        "Conversão exigiria propriedade física que não temos.",
    };
  }
  if (!ehNumero(peso) || peso <= 0) {
    return {
      motivo: "sem_peso_unitario",
      detalhe: `Converter ${interp.familia}→${alvo} exige pesoUnitarioKg.`,
    };
  }

  if (interp.familia === "contagem") {
    // preço/unidade cotada → preço/un → preço/kg
    ajustes.push(`${obs.unidade}→un: ÷${interp.fator}`, `un→kg: ÷${peso} (peso unitário)`);
    return { divisor: interp.fator * peso, ajustes };
  }
  // massa → contagem: preço/unidade cotada → preço/kg → preço/un
  ajustes.push(`${obs.unidade}→kg: ÷${interp.fator}`, `kg→un: ×${peso} (peso unitário)`);
  return { divisor: interp.fator / peso, ajustes };
}

/** Normaliza UMA observação para a família alvo. */
export function normalizarObservacao(
  obs: ObservacaoPreco,
  alvo: FamiliaUnidade,
  opts: OpcoesNormalizacao = {},
): ObservacaoNormalizada | ExclusaoPreco {
  if (!ehNumero(obs.precoUnit) || obs.precoUnit <= 0) {
    return { obs, motivo: "preco_invalido", detalhe: `Preço "${obs.precoUnit}" não é um número positivo.` };
  }

  const interp = interpretarUnidade(obs.unidade);
  if (interp === null) {
    return { obs, motivo: "unidade_desconhecida", detalhe: `Unidade "${obs.unidade}" não reconhecida.` };
  }
  if (interp === "ambigua") {
    return {
      obs,
      motivo: "unidade_ambigua",
      detalhe: `Unidade "${obs.unidade}" significa coisas diferentes conforme o contexto — não é interpretada.`,
    };
  }

  const fob = ajustarParaFob(obs, opts);
  if ("motivo" in fob) return { obs, motivo: fob.motivo, detalhe: fob.detalhe };

  const taxa = cambioParaUsd(obs);
  if (taxa == null) {
    return { obs, motivo: "sem_cambio", detalhe: `Sem câmbio ${obs.moeda}→USD na data da cotação.` };
  }

  const conv = converterUnidade(obs, interp, alvo);
  if ("motivo" in conv) return { obs, motivo: conv.motivo, detalhe: conv.detalhe };

  const ajustes = [...fob.ajustes, ...conv.ajustes];
  if (taxa !== 1) ajustes.push(`${obs.moeda}→USD: ×${taxa.toFixed(6)}`);

  const precoUsdCanonico = (fob.preco * taxa) / conv.divisor;
  if (!Number.isFinite(precoUsdCanonico) || precoUsdCanonico <= 0) {
    return { obs, motivo: "ajuste_invalido", detalhe: "Conversão resultou em valor não positivo." };
  }

  const quantidadeCanonica = ehNumero(obs.quantidade) && obs.quantidade > 0
    ? obs.quantidade * conv.divisor
    : null;

  const hoje = opts.hoje ?? new Date();
  let idadeMeses: number | null = null;
  if (obs.dataCotacao) {
    const t = new Date(obs.dataCotacao).getTime();
    if (Number.isFinite(t)) idadeMeses = Math.max(0, (hoje.getTime() - t) / MS_POR_MES);
  }

  return {
    obs,
    precoUsdCanonico,
    quantidadeCanonica,
    faixa: faixaQuantidade(quantidadeCanonica, alvo),
    idadeMeses,
    ajustes,
  };
}

/**
 * Elege a família do conjunto: a mais frequente entre as unidades
 * interpretáveis. Empate resolve em massa — é a base do Comex Stat, e manter
 * a comparabilidade com a referência oficial vale o desempate.
 */
export function detectarFamilia(observacoes: ObservacaoPreco[]): FamiliaUnidade | null {
  const contagem = new Map<FamiliaUnidade, number>();
  for (const o of observacoes ?? []) {
    const i = interpretarUnidade(o.unidade);
    if (i && i !== "ambigua") contagem.set(i.familia, (contagem.get(i.familia) ?? 0) + 1);
  }
  if (!contagem.size) return null;
  let melhor: FamiliaUnidade | null = null;
  let max = -1;
  contagem.forEach((n, familia) => {
    if (n > max || (n === max && familia === "massa")) {
      melhor = familia;
      max = n;
    }
  });
  return melhor;
}

/** Normaliza um conjunto, separando o que entrou do que ficou de fora e por quê. */
export function normalizarObservacoes(
  observacoes: ObservacaoPreco[],
  opts: OpcoesNormalizacao = {},
): NormalizacaoResultado {
  const lista = observacoes ?? [];
  const familia = opts.familia ?? detectarFamilia(lista);

  if (!familia) {
    return {
      consideradas: [],
      excluidas: lista.map((obs) => {
        const i = interpretarUnidade(obs.unidade);
        return i === "ambigua"
          ? { obs, motivo: "unidade_ambigua" as const, detalhe: `Unidade "${obs.unidade}" é ambígua.` }
          : { obs, motivo: "unidade_desconhecida" as const, detalhe: `Unidade "${obs.unidade}" não reconhecida.` };
      }),
      familia: null,
      unidadeCanonica: null,
    };
  }

  const consideradas: ObservacaoNormalizada[] = [];
  const excluidas: ExclusaoPreco[] = [];
  for (const obs of lista) {
    const r = normalizarObservacao(obs, familia, opts);
    if ("motivo" in r) excluidas.push(r);
    else consideradas.push(r);
  }

  return { consideradas, excluidas, familia, unidadeCanonica: UNIDADE_CANONICA[familia] };
}

/** Agrupa as exclusões por motivo — material pronto para a resposta ao usuário. */
export function resumirExclusoes(excluidas: ExclusaoPreco[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of excluidas) out[e.motivo] = (out[e.motivo] ?? 0) + 1;
  return out;
}
