/**
 * unitConversionService — normalização de unidades de medida do cálculo.
 *
 * O motor certificado calcula o custo unitário NA UNIDADE INFORMADA (passthrough).
 * Este módulo dá a camada de INTELIGÊNCIA DE UNIDADES por cima, sem tocar na
 * matemática do motor (paridade de planilha preservada):
 *
 *   1) Reconhece a unidade digitada em linguagem natural (pt/en, com acento,
 *      plural, abreviação): "toneladas", "milheiro", "cx", "L", "grama"…
 *   2) Converte para a unidade CANÔNICA da dimensão:
 *        peso     → kg      (g, kg, ton…)
 *        volume   → L       (ml, L, m³…)
 *        contagem → un      (un, pc, pct*, cx*, milheiro, dúzia, cento, par…)
 *      (*) pct/cx só convertem quando se informa itensPorEmbalagem.
 *   3) Deriva automaticamente o peso total (kg) quando a unidade é de peso —
 *      habilita o custo/kg sem o usuário repetir o peso.
 *
 * Invariante matemática: converter quantidade exige converter o preço unitário
 * pelo fator INVERSO — o total FOB nunca muda. 2 ton × $500/ton ≡ 2000 kg × $0,50/kg.
 */

export type DimensaoUnidade = "peso" | "volume" | "contagem" | "comprimento" | "desconhecida";

export interface UnidadeInfo {
  /** Dimensão física/comercial da unidade. */
  dimensao: DimensaoUnidade;
  /** Rótulo normalizado para exibição (ex.: "ton", "milheiro", "kg"). */
  rotulo: string;
  /** Unidade canônica da dimensão ("kg" | "L" | "un"). */
  canonica: string;
  /**
   * Fator → canônica: 1 <rotulo> = <fator> <canonica>.
   * null quando a conversão depende de dado externo (pct/cx sem itensPorEmbalagem).
   */
  fator: number | null;
}

export interface ConversaoItem {
  /** Unidade original informada (rótulo normalizado). */
  unidadeOriginal: string;
  dimensao: DimensaoUnidade;
  /** Quantidade na unidade canônica (null se não conversível). */
  quantidadeCanonica: number | null;
  unidadeCanonica: string;
  /** 1 unidadeOriginal = fator unidadeCanonica (null se não conversível). */
  fator: number | null;
  /** Peso total em kg derivado da unidade (só p/ dimensão peso). */
  pesoTotalKgDerivado: number | null;
  /**
   * Comprimento total em metros — derivado da própria unidade (dimensão
   * comprimento) ou de metrosPorUnidade × unidades contadas (bens lineares
   * vendidos por peça/caixa, ex.: rodapé de 2,4 m). Habilita o custo/m.
   */
  comprimentoTotalM: number | null;
  /** Frase curta explicando a conversão (para o chat/planilha). */
  descricao: string | null;
}

// ---------------------------------------------------------------------------
// Tabela de unidades: chave = forma normalizada (minúscula, sem acento/ponto).
// ---------------------------------------------------------------------------
interface DefUnidade { dim: DimensaoUnidade; rotulo: string; fator: number | null }

const UNIDADES: Record<string, DefUnidade> = {
  // ---- peso → kg ----
  g: { dim: "peso", rotulo: "g", fator: 0.001 },
  gr: { dim: "peso", rotulo: "g", fator: 0.001 },
  grama: { dim: "peso", rotulo: "g", fator: 0.001 },
  gramas: { dim: "peso", rotulo: "g", fator: 0.001 },
  mg: { dim: "peso", rotulo: "mg", fator: 0.000001 },
  kg: { dim: "peso", rotulo: "kg", fator: 1 },
  kgs: { dim: "peso", rotulo: "kg", fator: 1 },
  quilo: { dim: "peso", rotulo: "kg", fator: 1 },
  quilos: { dim: "peso", rotulo: "kg", fator: 1 },
  kilo: { dim: "peso", rotulo: "kg", fator: 1 },
  kilos: { dim: "peso", rotulo: "kg", fator: 1 },
  quilograma: { dim: "peso", rotulo: "kg", fator: 1 },
  quilogramas: { dim: "peso", rotulo: "kg", fator: 1 },
  t: { dim: "peso", rotulo: "ton", fator: 1000 },
  ton: { dim: "peso", rotulo: "ton", fator: 1000 },
  tons: { dim: "peso", rotulo: "ton", fator: 1000 },
  tonelada: { dim: "peso", rotulo: "ton", fator: 1000 },
  toneladas: { dim: "peso", rotulo: "ton", fator: 1000 },
  mt: { dim: "peso", rotulo: "ton", fator: 1000 },       // metric ton
  lb: { dim: "peso", rotulo: "lb", fator: 0.453592 },
  lbs: { dim: "peso", rotulo: "lb", fator: 0.453592 },
  libra: { dim: "peso", rotulo: "lb", fator: 0.453592 },
  libras: { dim: "peso", rotulo: "lb", fator: 0.453592 },

  // ---- volume → L ----
  ml: { dim: "volume", rotulo: "ml", fator: 0.001 },
  mililitro: { dim: "volume", rotulo: "ml", fator: 0.001 },
  mililitros: { dim: "volume", rotulo: "ml", fator: 0.001 },
  l: { dim: "volume", rotulo: "L", fator: 1 },
  lt: { dim: "volume", rotulo: "L", fator: 1 },
  lts: { dim: "volume", rotulo: "L", fator: 1 },
  litro: { dim: "volume", rotulo: "L", fator: 1 },
  litros: { dim: "volume", rotulo: "L", fator: 1 },
  m3: { dim: "volume", rotulo: "m³", fator: 1000 },
  "m³": { dim: "volume", rotulo: "m³", fator: 1000 },
  gal: { dim: "volume", rotulo: "gal", fator: 3.78541 },
  galao: { dim: "volume", rotulo: "gal", fator: 3.78541 },
  galoes: { dim: "volume", rotulo: "gal", fator: 3.78541 },

  // ---- comprimento → m ----
  // Bens lineares (rodapé, perfil, tubo, cabo, tecido): o mercado cota por
  // metro; sem esta dimensão a planilha só falava em caixa/peça e a comparação
  // com cotações R$/m exigia conversão manual (fonte real de erro de leitura).
  m: { dim: "comprimento", rotulo: "m", fator: 1 },
  metro: { dim: "comprimento", rotulo: "m", fator: 1 },
  metros: { dim: "comprimento", rotulo: "m", fator: 1 },
  mts: { dim: "comprimento", rotulo: "m", fator: 1 },
  mlinear: { dim: "comprimento", rotulo: "m", fator: 1 },
  metrolinear: { dim: "comprimento", rotulo: "m", fator: 1 },
  metroslineares: { dim: "comprimento", rotulo: "m", fator: 1 },
  cm: { dim: "comprimento", rotulo: "cm", fator: 0.01 },
  mm: { dim: "comprimento", rotulo: "mm", fator: 0.001 },
  km: { dim: "comprimento", rotulo: "km", fator: 1000 },

  // ---- contagem → un ----
  un: { dim: "contagem", rotulo: "un", fator: 1 },
  und: { dim: "contagem", rotulo: "un", fator: 1 },
  unid: { dim: "contagem", rotulo: "un", fator: 1 },
  unidade: { dim: "contagem", rotulo: "un", fator: 1 },
  unidades: { dim: "contagem", rotulo: "un", fator: 1 },
  pc: { dim: "contagem", rotulo: "un", fator: 1 },
  pcs: { dim: "contagem", rotulo: "un", fator: 1 },
  pca: { dim: "contagem", rotulo: "un", fator: 1 },       // "pça"
  peca: { dim: "contagem", rotulo: "un", fator: 1 },
  pecas: { dim: "contagem", rotulo: "un", fator: 1 },
  piece: { dim: "contagem", rotulo: "un", fator: 1 },
  pieces: { dim: "contagem", rotulo: "un", fator: 1 },
  par: { dim: "contagem", rotulo: "par", fator: 2 },
  pares: { dim: "contagem", rotulo: "par", fator: 2 },
  duzia: { dim: "contagem", rotulo: "dúzia", fator: 12 },
  duzias: { dim: "contagem", rotulo: "dúzia", fator: 12 },
  dz: { dim: "contagem", rotulo: "dúzia", fator: 12 },
  cento: { dim: "contagem", rotulo: "cento", fator: 100 },
  centos: { dim: "contagem", rotulo: "cento", fator: 100 },
  milheiro: { dim: "contagem", rotulo: "milheiro", fator: 1000 },
  milheiros: { dim: "contagem", rotulo: "milheiro", fator: 1000 },
  mil: { dim: "contagem", rotulo: "milheiro", fator: 1000 },
  // Embalagens: fator depende de itensPorEmbalagem (null = precisa do dado).
  pct: { dim: "contagem", rotulo: "pct", fator: null },
  pacote: { dim: "contagem", rotulo: "pct", fator: null },
  pacotes: { dim: "contagem", rotulo: "pct", fator: null },
  cx: { dim: "contagem", rotulo: "cx", fator: null },
  caixa: { dim: "contagem", rotulo: "cx", fator: null },
  caixas: { dim: "contagem", rotulo: "cx", fator: null },
  fardo: { dim: "contagem", rotulo: "fardo", fator: null },
  fardos: { dim: "contagem", rotulo: "fardo", fator: null },
  rolo: { dim: "contagem", rotulo: "rolo", fator: null },
  rolos: { dim: "contagem", rotulo: "rolo", fator: null },
  saco: { dim: "contagem", rotulo: "saco", fator: null },
  sacos: { dim: "contagem", rotulo: "saco", fator: null },
};

const CANONICA_POR_DIM: Record<DimensaoUnidade, string> = {
  peso: "kg",
  volume: "L",
  contagem: "un",
  comprimento: "m",
  desconhecida: "",
};

/** Normaliza a string da unidade: minúscula, sem acento, sem pontuação/espaço. */
function chaveUnidade(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\s]/g, "")
    .trim();
}

/** Identifica a unidade digitada. Sempre retorna algo (desconhecida = passthrough). */
export function parseUnidade(raw?: string | null): UnidadeInfo {
  const key = raw ? chaveUnidade(raw) : "";
  const def = key ? UNIDADES[key] : undefined;
  if (!def) {
    return {
      dimensao: "desconhecida",
      rotulo: raw?.trim() || "un",
      canonica: raw?.trim() || "un",
      fator: null,
    };
  }
  return {
    dimensao: def.dim,
    rotulo: def.rotulo,
    canonica: CANONICA_POR_DIM[def.dim],
    fator: def.fator,
  };
}

/**
 * Converte a quantidade de um item para a unidade canônica da dimensão.
 * `itensPorEmbalagem` resolve pct/cx/fardo/rolo/saco (1 cx = N un).
 */
export function converterItem(input: {
  quantity: number;
  unit?: string | null;
  itensPorEmbalagem?: number | null;
  /** Metros por unidade CONTADA (peça): rodapé de 2,4 m → 2.4. Habilita custo/m. */
  metrosPorUnidade?: number | null;
}): ConversaoItem {
  const info = parseUnidade(input.unit);
  const fator =
    info.fator ??
    (info.dimensao === "contagem" && input.itensPorEmbalagem && input.itensPorEmbalagem > 0
      ? input.itensPorEmbalagem
      : null);

  const quantidadeCanonica = fator != null ? input.quantity * fator : null;
  const pesoTotalKgDerivado =
    info.dimensao === "peso" && quantidadeCanonica != null ? quantidadeCanonica : null;

  // Comprimento total: direto (unidade já é de comprimento) ou derivado do
  // metros-por-peça sobre as unidades contadas (cx → un → m).
  const unidadesContadas =
    info.dimensao === "contagem"
      ? quantidadeCanonica
      : info.dimensao === "desconhecida"
        ? input.quantity
        : null;
  const mpu = input.metrosPorUnidade ?? null;
  const comprimentoTotalM =
    info.dimensao === "comprimento"
      ? quantidadeCanonica
      : mpu != null && mpu > 0 && unidadesContadas != null
        ? unidadesContadas * mpu
        : null;

  // Sem conversão real (unidade já canônica ou desconhecida) → sem descrição.
  const identidade = fator === 1 || info.dimensao === "desconhecida";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  let descricao =
    !identidade && quantidadeCanonica != null
      ? `${fmt(input.quantity)} ${info.rotulo} = ${fmt(quantidadeCanonica)} ${info.canonica}`
      : !identidade && info.fator === null && info.dimensao === "contagem"
        ? `unidade "${info.rotulo}" é embalagem — informe itens por ${info.rotulo} para converter em unidades`
        : null;
  // Metragem derivada entra na descrição — é ela que permite comparar com
  // cotações de mercado em R$/m sem conversão manual.
  if (comprimentoTotalM != null && info.dimensao !== "comprimento") {
    const base = descricao ?? `${fmt(unidadesContadas ?? input.quantity)} ${info.canonica || "un"}`;
    descricao = `${base} = ${fmt(comprimentoTotalM)} m (${fmt(mpu!)} m/un)`;
  }

  return {
    unidadeOriginal: info.rotulo,
    dimensao: info.dimensao,
    quantidadeCanonica,
    unidadeCanonica: info.canonica,
    fator,
    pesoTotalKgDerivado,
    comprimentoTotalM,
    descricao,
  };
}

/**
 * Custo na unidade canônica a partir do custo total do item.
 * Ex.: item de 2 ton com custo líquido R$ 10.000 → R$ 5,00/kg.
 */
export function custoPorCanonica(
  custoTotal: number,
  conv: ConversaoItem,
): { valor: number; unidade: string } | null {
  if (conv.quantidadeCanonica == null || conv.quantidadeCanonica <= 0) return null;
  if (conv.fator === 1) return null; // já está na canônica — evita linha duplicada
  return { valor: custoTotal / conv.quantidadeCanonica, unidade: conv.unidadeCanonica };
}

/**
 * Custo por METRO a partir do custo total do item (bens lineares).
 * Ex.: 19.200 rodapés de 2,4 m (46.080 m) a custo líquido R$ 304.349 → R$ 6,60/m.
 */
export function custoPorMetro(
  custoTotal: number,
  conv: ConversaoItem,
): { valor: number; unidade: "m" } | null {
  if (conv.comprimentoTotalM == null || conv.comprimentoTotalM <= 0) return null;
  if (conv.dimensao === "comprimento" && conv.fator === 1) return null; // já cotado em m
  return { valor: custoTotal / conv.comprimentoTotalM, unidade: "m" };
}

/**
 * Extrai o comprimento por peça (em metros) do nome/descrição do produto.
 * Reconhece "2,4m", "2.4 m", "3 metros", "240cm", "2400 mm"; ignora m², m³ e
 * medidas coladas em outras palavras. Heurística de leitura — o campo
 * explícito (comprimentoPorUnidadeM) sempre prevalece.
 */
export function extrairComprimentoM(nome: string): number | null {
  if (!nome) return null;
  const re = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|mts?|metros?)(?![a-z0-9²³])/gi;
  const fatores: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, mt: 1, mts: 1, metro: 1, metros: 1 };
  let melhor: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(nome)) !== null) {
    const valor = parseFloat(match[1].replace(",", "."));
    const fator = fatores[match[2].toLowerCase()] ?? 1;
    const metros = valor * fator;
    // Só aceita comprimentos plausíveis de BEM LINEAR (0,5 m a 100 m) e fica
    // com o MAIOR (num "rodapé 8cm x 2,4m" o comprimento é 2,4 m, não a
    // altura). Abaixo de 0,5 m ("parafuso 50mm") o falso positivo é mais
    // provável que o acerto — nesses casos use o campo explícito.
    if (metros >= 0.5 && metros <= 100 && (melhor == null || metros > melhor)) melhor = metros;
  }
  return melhor;
}
