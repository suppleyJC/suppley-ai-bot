/**
 * NCM — normalização canônica. O ÚNICO lugar que decide como um código vira
 * texto para gravar e comparar.
 *
 * Por que existe: o campo `products.ncmCode` acumulou a mesma NCM em até CINCO
 * grafias ('3304.30.00', '3304.3000', '33043000', '3304300000', '3304300062'),
 * porque só o caminho da extração normalizava e todos os outros gravavam o que
 * recebiam. `getNCMByCode` tirava os pontos NA LEITURA, o que fazia tudo parecer
 * funcionar enquanto agrupamento, cache e junção se fragmentavam em silêncio.
 *
 * Sob DUIMP isso deixou de ser dívida interna: o catálogo é a fonte de uma
 * declaração oficial e precisa de uma grafia só.
 *
 * REGRA CENTRAL: esta função nunca ADIVINHA. Um código de 7 dígitos pode ter
 * perdido um zero no fim ('7007190' → 70071900) ou no começo ('7007190' →
 * 07007190) — resolver isso exige conferir a nomenclatura, então aqui ele sai
 * marcado como ambíguo e a decisão fica com quem tem o banco na mão
 * (`resolverNcmAmbiguo` em ncmService). Chutar aqui produziria classificação
 * errada com aparência de certeza, que é exatamente o defeito que estamos
 * consertando.
 */

/** Como o código bruto se relaciona com a forma canônica de 8 dígitos. */
export type ClasseNcm =
  /** Já está em 8 dígitos limpos — nada a fazer. */
  | "canonico"
  /** 8 dígitos, grafia divergente (pontos, espaços). Conserto determinístico. */
  | "formato"
  /** Mais de 8 dígitos (preenchimento ou sufixo interno). Trunca para 8. */
  | "excesso"
  /** 2, 4 ou 6 dígitos: é um NÍVEL da hierarquia, não um item. Não é conserto
   *  de formato — exige descer até o item, o que é classificação. */
  | "parcial"
  /** Comprimento que não resolve sozinho (ex.: 7 dígitos). Requer a nomenclatura. */
  | "ambiguo"
  /** Sem dígito nenhum ('<UNKNOWN>') ou sentinela de vazio ('00000000'). */
  | "ausente";

export interface NcmNormalizado {
  /** O valor como estava gravado. */
  original: string;
  /** Só os dígitos, na ordem em que apareciam. */
  digitos: string;
  /** Forma canônica de 8 dígitos, ou null quando não se resolve sem a nomenclatura. */
  canonico: string | null;
  classe: ClasseNcm;
}

/** Sentinelas historicamente usados no lugar de "não classificado". */
const SENTINELAS = new Set(["00000000", "0", "00", "000000"]);

/**
 * Normaliza um código NCM em qualquer grafia para a forma canônica de 8 dígitos.
 *
 * @example normalizarNcm("3923.30.90") // { canonico: "39233090", classe: "formato" }
 * @example normalizarNcm("3304300062") // { canonico: "33043000", classe: "excesso" }
 * @example normalizarNcm("<UNKNOWN>")  // { canonico: null, classe: "ausente" }
 * @example normalizarNcm("7007190")    // { canonico: null, classe: "ambiguo" }
 */
export function normalizarNcm(bruto: unknown): NcmNormalizado {
  const original = typeof bruto === "string" ? bruto : String(bruto ?? "");
  const digitos = original.replace(/\D/g, "");

  if (!digitos || SENTINELAS.has(digitos)) {
    return { original, digitos, canonico: null, classe: "ausente" };
  }

  if (digitos.length === 8) {
    // Grafia idêntica ao canônico = já está certo; qualquer diferença (pontos,
    // espaços) é conserto determinístico, sem juízo de classificação.
    return {
      original,
      digitos,
      canonico: digitos,
      classe: original === digitos ? "canonico" : "formato",
    };
  }

  if (digitos.length > 8) {
    // NCM tem 8 dígitos; o excedente é preenchimento com zeros ou sufixo de
    // sistema interno ('3304300062'). Os 8 primeiros são a classificação.
    return { original, digitos, canonico: digitos.slice(0, 8), classe: "excesso" };
  }

  // Abaixo de 8: se for um nível válido da hierarquia (capítulo, posição,
  // subposição), não é erro de digitação — é classificação incompleta, e
  // completar exige escolher o item. Os demais comprimentos são ambíguos.
  if (digitos.length === 2 || digitos.length === 4 || digitos.length === 6) {
    return { original, digitos, canonico: null, classe: "parcial" };
  }

  return { original, digitos, canonico: null, classe: "ambiguo" };
}

/**
 * Forma canônica para gravar, ou null se o código não se resolve sozinho.
 * É o atalho para os pontos de ESCRITA — use `normalizarNcm` quando precisar
 * saber por que falhou.
 */
export function ncmCanonico(bruto: unknown): string | null {
  return normalizarNcm(bruto).canonico;
}

/**
 * Candidatos de 8 dígitos para um código ambíguo, em ordem de plausibilidade.
 * Quem chama DEVE conferir cada um contra a nomenclatura e só aceitar os que
 * existem — sem essa conferência isto é chute, não normalização.
 *
 * O caso real da base: '7007190' (7 dígitos). Perder o zero final é o erro de
 * digitação/exportação comum, então `${d}0` vem primeiro; `0${d}` cobre a perda
 * do zero inicial de capítulos de 1 dígito significativo (01 a 09).
 */
export function candidatosNcmAmbiguo(digitos: string): string[] {
  if (digitos.length !== 7) return [];
  return [`${digitos}0`, `0${digitos}`];
}

/** Formatação de exibição: 8 dígitos → '3923.30.90'. */
export function formatarNcm(canonico: string): string {
  if (!/^\d{8}$/.test(canonico)) return canonico;
  return `${canonico.slice(0, 4)}.${canonico.slice(4, 6)}.${canonico.slice(6, 8)}`;
}
