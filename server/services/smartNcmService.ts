/**
 * smartNcmService — classificação inteligente de NCM com reutilização de histórico.
 *
 * Estratégia: quando um produto precisa de NCM, em vez de sempre fazer nova busca:
 * 1. Procura produtos SIMILARES já classificados (com NCM validado)
 * 2. Se encontrar com score alto, reutiliza o NCM (economia de API + consistência)
 * 3. Se não encontrar, faz busca normal
 *
 * Isso resolve o problema: "Excambia retorna NCMs imprecisos mesmo quando o produto
 * já foi vinculado antes". Agora ela reutiliza automaticamente.
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import { products } from "../../drizzle/schema";
import { findTopSimilarProducts } from "./productSimilarity";
import { suggestNCMBatch } from "./ncmService";

export interface SmartNcmResult {
  ncmCode: string;
  source: "similar_product" | "search"; // onde veio a classificação
  confidence: number; // 0.0–1.0
  similarProductId?: number;
  similarProductName?: string;
}

/**
 * Sugere NCM para um produto novo, reutilizando histórico quando possível.
 *
 * 1. Busca produtos similares já classificados (validado)
 * 2. Se encontrar com similaridade > 0.7, reutiliza o NCM
 * 3. Senão, faz busca normal
 */
export async function suggestNCMSmart(
  productName: string,
  userId: number,
): Promise<SmartNcmResult | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Carrega todos os produtos DO USUÁRIO já classificados (validados)
    const classified = await db
      .select({
        id: products.id,
        name: products.name,
        ncmCode: products.ncmCode,
      })
      .from(products)
      .where(
        and(
          eq(products.userId, userId),
          eq(products.ncmStatus, "validado"), // só reutiliza classificações já validadas pelo usuário
        ),
      );

    if (classified.length > 0) {
      // Busca os 3 produtos mais similares (usa só o name para similaridade)
      const prodNamesWithCode = classified.map((c) => ({ id: c.id, name: c.name }));
      const similar = findTopSimilarProducts(productName, prodNamesWithCode, 3, 0.7);

      if (similar.length > 0 && similar[0].score >= 0.7) {
        // Score alto: reutiliza o NCM do produto mais similar
        const best = similar[0];
        const classifiedProduct = classified.find((c) => c.id === best.id);
        if (classifiedProduct) {
          return {
            ncmCode: classifiedProduct.ncmCode,
            source: "similar_product",
            confidence: best.score,
            similarProductId: best.id,
            similarProductName: best.name,
          };
        }
      }
    }

    // Fallback: faz busca normal no banco de NCMs público
    const suggestedMap = await suggestNCMBatch([{ name: productName }]);
    const suggestion = suggestedMap.get(productName);
    if (suggestion?.suggestedNCM?.ncmCode) {
      return {
        ncmCode: suggestion.suggestedNCM.ncmCode,
        source: "search",
        confidence: 0.5, // busca automática tem confiança menor
      };
    }

    return null;
  } catch (err) {
    console.error("[smartNcmService] erro ao sugerir NCM:", err);
    return null;
  }
}

/**
 * Sugestão em batch (múltiplos produtos).
 * Útil para quando o agente extrai vários itens de uma proforma/planilha.
 */
export async function suggestNCMBatchSmart(
  productNames: string[],
  userId: number,
): Promise<Array<SmartNcmResult | null>> {
  return Promise.all(productNames.map((name) => suggestNCMSmart(name, userId)));
}
