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

export type DimensaoUnidade = "peso" | "volume" | "contagem" | "desconhecida";

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

  // Sem conversão real (unidade já canônica ou desconhecida) → sem descrição.
  const identidade = fator === 1 || info.dimensao === "desconhecida";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  const descricao =
    !identidade && quantidadeCanonica != null
      ? `${fmt(input.quantity)} ${info.rotulo} = ${fmt(quantidadeCanonica)} ${info.canonica}`
      : !identidade && info.fator === null && info.dimensao === "contagem"
        ? `unidade "${info.rotulo}" é embalagem — informe itens por ${info.rotulo} para converter em unidades`
        : null;

  return {
    unidadeOriginal: info.rotulo,
    dimensao: info.dimensao,
    quantidadeCanonica,
    unidadeCanonica: info.canonica,
    fator,
    pesoTotalKgDerivado,
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
