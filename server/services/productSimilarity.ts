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
