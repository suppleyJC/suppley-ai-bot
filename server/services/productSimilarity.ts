/**
 * productSimilarity — busca inteligente de produtos por similaridade.
 *
 * Quando o usuário menciona um produto no chat ("prego 17x2", "escora 4 metros"),
 * o sistema tenta encontrar produtos similares no banco usando:
 * 1. Levenshtein distance (distância de edição entre strings)
 * 2. Tokenização (quebra em palavras-chave)
 * 3. Validação de contexto (se o NCM foi usado antes, reutiliza)
 *
 * Isso melhora a precisão da Excambia ao relacionar mencões no chat com produtos reais.
 */

/** Calcula Levenshtein distance entre duas strings (1.0 = idêntico, 0.0 = totalmente diferente). */
export function levenshteinSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= s2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s1.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1, // insert
        matrix[i - 1][j] + 1, // delete
        matrix[i - 1][j - 1] + cost, // replace
      );
    }
  }

  const dist = matrix[s2.length][s1.length];
  const maxLen = Math.max(s1.length, s2.length);
  return 1.0 - dist / maxLen;
}

/** Extrai tokens de uma string (palavras significativas). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2); // ignora palavras muito curtas
}

/** Token similarity: quantas palavras em comum têm (Jaccard index). */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  const aArr = Array.from(tokensA);
  const bArr = Array.from(tokensB);
  const intersection = new Set(aArr.filter((t) => tokensB.has(t)));
  const union = new Set([...aArr, ...bArr]);
  return union.size > 0 ? intersection.size / union.size : 0.0;
}

/**
 * Combina Levenshtein e token similarity para um score mais robusto.
 * Weighing: 40% Levenshtein (exatidão geral), 60% token (palavras em comum).
 */
export function productSimilarity(a: string, b: string): number {
  const lev = levenshteinSimilarity(a, b);
  const tok = tokenSimilarity(a, b);
  return 0.4 * lev + 0.6 * tok;
}

/**
 * Encontra o produto mais similar em uma lista.
 * Retorna { product, score } onde score é 0.0–1.0.
 * Se score < threshold (defaut 0.6), retorna null.
 */
export function findSimilarProduct(
  query: string,
  products: Array<{ id: number; name: string }>,
  threshold = 0.6,
): { id: number; name: string; score: number } | null {
  let best: { id: number; name: string; score: number } | null = null;

  for (const p of products) {
    const score = productSimilarity(query, p.name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { ...p, score };
    }
  }

  return best;
}

/**
 * Normaliza um texto para BUSCA de catálogo, tolerando as variações típicas do
 * domínio: o símbolo de multiplicação (× / ✕ / *) vira "x" (para "17×27" casar
 * com "17x27"), acentos são removidos, tudo minúsculo e só alfanumérico.
 */
export function normalizeForSearch(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[×✕*]/g, "x")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ") // só letras/números
    .replace(/\s+/g, " ")
    .trim();
}

// Ruído comum que não ajuda a identificar a variante do produto.
const SEARCH_STOPWORDS = new Set([
  "de", "da", "do", "para", "com", "e", "um", "uma", "the", "of",
  "container", "conteiner", "carga", "lote",
]);

/**
 * Sinônimos PT↔EN do domínio (siderurgia/construção/fixadores). Resolve o caso
 * de proformas cadastradas em inglês: "prego" casa com "nail", "vergalhão" com
 * "wire rod/rebar", "arame" com "wire" etc. Tokens normalizados (sem acento).
 * Bidirecional: a chave também é encontrada a partir do termo em inglês.
 */
const TERM_SYNONYMS: Record<string, string[]> = {
  // fixadores
  prego: ["nail"], nail: ["prego"],
  parafuso: ["screw", "bolt"], screw: ["parafuso"], bolt: ["parafuso"],
  porca: ["nut"], nut: ["porca"],
  arruela: ["washer"], washer: ["arruela"],
  abracadeira: ["clamp", "tie", "strap"], clamp: ["abracadeira"], tie: ["abracadeira"],
  // arame / fios / vergalhão
  arame: ["wire"], wire: ["arame", "fio"], fio: ["wire"],
  vergalhao: ["rebar", "rod", "wirerod"], rebar: ["vergalhao"], rod: ["vergalhao", "barra"],
  // chapas / tubos / telas
  chapa: ["sheet", "plate"], sheet: ["chapa"], plate: ["chapa"],
  tubo: ["tube", "pipe"], tube: ["tubo"], pipe: ["tubo"],
  tela: ["mesh", "net"], mesh: ["tela"],
  // escoramento (core do negócio)
  escora: ["shore", "prop", "scaffold"], andaime: ["scaffold", "scaffolding"],
  // atributos
  cabeca: ["head"], head: ["cabeca"],
  simples: ["common", "comum"], common: ["simples", "comum"], comum: ["common", "simples"],
  duplo: ["duplex", "double"], duplex: ["duplo"], double: ["duplo"],
  polido: ["polished", "bright"], polished: ["polido"],
  galvanizado: ["galvanized", "galv", "zinc"], galvanized: ["galvanizado"],
  aco: ["steel"], steel: ["aco"], ferro: ["iron"], iron: ["ferro"],
  nylon: ["nylon", "plastic"],
};

/** True se o token (ou um sinônimo dele) aparece no texto candidato. */
function tokenPresente(token: string, candidato: string): boolean {
  if (candidato.includes(token)) return true;
  const syns = TERM_SYNONYMS[token];
  return syns ? syns.some((s) => candidato.includes(s)) : false;
}

/** Tokens de busca — MANTÉM numéricos curtos (17, 27) que diferenciam variantes. */
function catalogTokens(s: string): string[] {
  return normalizeForSearch(s)
    .split(" ")
    .filter((t) => (t.length >= 2 || /\d/.test(t)) && !SEARCH_STOPWORDS.has(t));
}

/**
 * Score 0..1 entre o que a pessoa digitou e um item do catálogo.
 * Combina a similaridade textual (Levenshtein + Jaccard) com CONTAINMENT de
 * tokens: se todos os tokens da consulta aparecem no item, casa com alta
 * confiança. Isso resolve os dois problemas reais do domínio:
 *   - ordem das palavras diferente ("prego 17x27 cabeça simples" ×
 *     "Prego cabeça simples 17x27");
 *   - símbolo × vs letra x e acentuação.
 */
export function catalogMatchScore(query: string, candidate: string): number {
  const c = normalizeForSearch(candidate);
  if (!normalizeForSearch(query) || !c) return 0;

  let score = productSimilarity(normalizeForSearch(query), c);
  const qt = catalogTokens(query);
  if (qt.length) {
    // containment com sinônimos PT↔EN (acha proforma cadastrada em inglês)
    const present = qt.filter((t) => tokenPresente(t, c)).length;
    score = Math.max(score, (present / qt.length) * 0.95);
  }
  return score;
}

/**
 * Encontra os N produtos mais similares, ordenados por score (descendente).
 */
export function findTopSimilarProducts(
  query: string,
  products: Array<{ id: number; name: string }>,
  topN = 3,
  minScore = 0.5,
): Array<{ id: number; name: string; score: number }> {
  const results = products
    .map((p) => ({ ...p, score: productSimilarity(query, p.name) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return results;
}
