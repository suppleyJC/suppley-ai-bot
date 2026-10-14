/**
 * precoNormalizacao — traz observações de preço para uma BASE CANÔNICA comum
 * antes de qualquer média.
 *
 * POR QUE ISTO EXISTE: hoje a consolidação soma `brlPresente` de observações
 * cujas unidades divergem (R$/kg de uma proforma com R$/unidade de um ativo) e
 * cujos Incoterms divergem (FOB de fornecedor com CIF de outro). Média entre
 * bases diferentes não é imprecisão de arredondamento — é número sem
 * significado. Comex Stat publica FOB em US$/kg; uma cotação CIF por peça não
 * é comparável com isso sem conversão.
 *
 * BASE CANÔNICA: **FOB, US$/kg**.
 *
 * REGRA DURA — nunca converter no chute. Quando falta o dado para converter
 * (peso unitário, frete embutido no CIF, câmbio da data), a observação é
 * EXCLUÍDA com motivo explícito, não estimada. O motivo volta na saída para
 * quem chamou poder dizer ao usuário o que ficou de fora e por quê — a mesma
 * disciplina que separa "não encontrei" de "não consegui consultar".
 *
 * CAMADA PURA: sem rede, sem banco, sem relógio implícito (`hoje` é injetável).
 * Toda a coleta fica na tool; aqui só há aritmética testável.
 */

export type FontePreco = "invoice" | "proforma" | "cotacao" | "manual" | "mercado";

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
  | "unidade_nao_conversivel"
  | "sem_peso_unitario"
  | "incoterm_desconhecido"
  | "incoterm_sem_componentes"
  | "ajuste_invalido";

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
  /** Peso de UMA unidade, em kg — obrigatório quando `unidade` é por peça. */
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
  /** A base canônica: FOB em US$/kg. */
  precoUsdKg: number;
  /** Quantidade da cotação convertida para kg (null se não informada). */
  quantidadeKg: number | null;
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
}

export interface NormalizacaoResultado {
  consideradas: ObservacaoNormalizada[];
  excluidas: ExclusaoPreco[];
}

const MS_POR_MES = 30.44 * 24 * 3600 * 1000;

/**
 * Fatores de massa. `null` significa "precisa de peso unitário" (itens por
 * peça); ausência do termo significa unidade não suportada.
 */
const FATOR_KG: Array<{ re: RegExp; fator: number | null }> = [
  { re: /^(kgs?|quilos?|quilogramas?|kilograms?|kilos?)$/i, fator: 1 },
  { re: /^(t|ton|tons|tonelada|toneladas|mt|tonne|tonnes)$/i, fator: 1000 },
  { re: /^(g|gr|gramas?|grams?)$/i, fator: 0.001 },
  { re: /^(lb|lbs|libras?|pounds?)$/i, fator: 0.45359237 },
  { re: /^(un|und|unid|unidade|unidades|pc|pcs|pç|peca|pecas|peça|peças|piece|pieces|ea|each|set|sets|kit|kits|par|pares|pair|pairs)$/i, fator: null },
];

const GRUPO_POR_INCOTERM: Record<string, GrupoIncoterm> = {
  FOB: "fob",
  EXW: "pre_embarque", FCA: "pre_embarque", FAS: "pre_embarque",
  CFR: "pos_embarque", CIF: "pos_embarque", CPT: "pos_embarque", CIP: "pos_embarque",
  C$F: "pos_embarque", CNF: "pos_embarque",
  DAP: "entregue", DPU: "entregue", DDP: "entregue", DAT: "entregue", DDU: "entregue",
};

/**
 * Limiares de faixa em kg, pensados para contêiner marítimo (20'/40'). São
 * parâmetros de calibração, não verdade: um dia saem para tabela versionada.
 */
const LIMITE_AMOSTRA_KG = 100;
const LIMITE_PARCIAL_KG = 5_000;
const LIMITE_CONTEINER_KG = 28_000;

/** Normaliza a grafia de uma unidade para casar com os fatores. */
function limparUnidade(unidade: string): string {
  return String(unidade ?? "")
    .trim()
    .replace(/\.$/, "")
    .normalize("NFD")
    .replace(/[̀-̂̄-ͯ]/g, ""); // mantém a cedilha de "peça"
}

/**
 * Fator para converter a unidade em kg.
 * - número: multiplica direto;
 * - "precisa_peso": é por peça — exige `pesoUnitarioKg`;
 * - null: unidade não suportada.
 */
export function fatorParaKg(unidade: string): number | "precisa_peso" | null {
  const u = limparUnidade(unidade);
  if (!u) return null;
  for (const { re, fator } of FATOR_KG) {
    if (re.test(u)) return fator === null ? "precisa_peso" : fator;
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
export function faixaQuantidade(kg: number | null): FaixaQuantidade | null {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return null;
  if (kg < LIMITE_AMOSTRA_KG) return "amostra";
  if (kg < LIMITE_PARCIAL_KG) return "parcial";
  if (kg <= LIMITE_CONTEINER_KG) return "conteiner";
  return "multiplo";
}

/** Câmbio moeda→USD: direto, ou derivado do par BRL. */
function cambioParaUsd(obs: ObservacaoPreco): number | null {
  if (obs.cambioMoedaUsd != null && obs.cambioMoedaUsd > 0) return obs.cambioMoedaUsd;
  const { cambioMoedaBrl: mBrl, cambioUsdBrl: uBrl } = obs;
  if (mBrl != null && mBrl > 0 && uBrl != null && uBrl > 0) return mBrl / uBrl;
  // USD cotado em USD dispensa câmbio.
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
 * Note que `0` é componente VÁLIDO (frete zero é informação); só `null` e
 * `undefined` significam ausência.
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
 * Normaliza UMA observação para FOB US$/kg.
 * Ordem: valida → ajusta Incoterm → converte moeda → converte unidade.
 */
export function normalizarObservacao(
  obs: ObservacaoPreco,
  opts: OpcoesNormalizacao = {},
): ObservacaoNormalizada | ExclusaoPreco {
  if (!ehNumero(obs.precoUnit) || obs.precoUnit <= 0) {
    return { obs, motivo: "preco_invalido", detalhe: `Preço "${obs.precoUnit}" não é um número positivo.` };
  }

  const fob = ajustarParaFob(obs, opts);
  if ("motivo" in fob) return { obs, motivo: fob.motivo, detalhe: fob.detalhe };

  const taxa = cambioParaUsd(obs);
  if (taxa == null) {
    return {
      obs,
      motivo: "sem_cambio",
      detalhe: `Sem câmbio ${obs.moeda}→USD na data da cotação.`,
    };
  }

  const fator = fatorParaKg(obs.unidade);
  if (fator === null) {
    return { obs, motivo: "unidade_nao_conversivel", detalhe: `Unidade "${obs.unidade}" não converte para kg.` };
  }

  let kgPorUnidade: number;
  const ajustes = [...fob.ajustes];
  if (fator === "precisa_peso") {
    const peso = obs.pesoUnitarioKg;
    if (!ehNumero(peso) || peso <= 0) {
      return {
        obs,
        motivo: "sem_peso_unitario",
        detalhe: `Preço por "${obs.unidade}" exige pesoUnitarioKg para virar US$/kg.`,
      };
    }
    kgPorUnidade = peso;
    ajustes.push(`${obs.unidade}→kg: ${peso} kg por unidade`);
  } else {
    kgPorUnidade = fator;
    if (fator !== 1) ajustes.push(`${obs.unidade}→kg: ×${fator}`);
  }

  if (taxa !== 1) ajustes.push(`${obs.moeda}→USD: ×${taxa.toFixed(6)}`);

  const precoUsdKg = (fob.preco * taxa) / kgPorUnidade;
  if (!Number.isFinite(precoUsdKg) || precoUsdKg <= 0) {
    return { obs, motivo: "ajuste_invalido", detalhe: "Conversão resultou em valor não positivo." };
  }

  const quantidadeKg = ehNumero(obs.quantidade) && obs.quantidade > 0
    ? obs.quantidade * kgPorUnidade
    : null;

  const hoje = opts.hoje ?? new Date();
  let idadeMeses: number | null = null;
  if (obs.dataCotacao) {
    const t = new Date(obs.dataCotacao).getTime();
    if (Number.isFinite(t)) idadeMeses = Math.max(0, (hoje.getTime() - t) / MS_POR_MES);
  }

  return {
    obs,
    precoUsdKg,
    quantidadeKg,
    faixa: faixaQuantidade(quantidadeKg),
    idadeMeses,
    ajustes,
  };
}

/** Normaliza um conjunto, separando o que entrou do que ficou de fora e por quê. */
export function normalizarObservacoes(
  observacoes: ObservacaoPreco[],
  opts: OpcoesNormalizacao = {},
): NormalizacaoResultado {
  const consideradas: ObservacaoNormalizada[] = [];
  const excluidas: ExclusaoPreco[] = [];

  for (const obs of observacoes ?? []) {
    const r = normalizarObservacao(obs, opts);
    if ("motivo" in r) excluidas.push(r);
    else consideradas.push(r);
  }

  return { consideradas, excluidas };
}

/** Agrupa as exclusões por motivo — material pronto para a resposta ao usuário. */
export function resumirExclusoes(excluidas: ExclusaoPreco[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of excluidas) out[e.motivo] = (out[e.motivo] ?? 0) + 1;
  return out;
}
