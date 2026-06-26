/**
 * Product Categorization Service — inferência inteligente de hierarquia de produtos.
 *
 * Quando um produto chega da proforma sem categoria/subcategoria preenchida,
 * tenta inferir automaticamente a partir de:
 *   1. Similaridade com produtos já classificados (reutiliza a categorização)
 *   2. Análise do nome do produto (extração de palavras-chave de classe)
 *   3. Histórico de NCM (produto com mesmo NCM pode ter categoria associada)
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/connection";
import { products } from "../../drizzle/schema";
import { findTopSimilarProducts } from "./productSimilarity";
import { normalizeProductName } from "./priceComparisonService";

export interface InferredCategories {
  classe?: string;
  categoria?: string;
  subcategoria?: string;
}

/**
 * Mapa de palavras-chave → classe operacional.
 * Usado para extrair classe do nome do produto.
 */
const CLASS_KEYWORDS: Record<string, string> = {
  // Fixadores
  prego: "Fixadores",
  parafuso: "Fixadores",
  abraçadeira: "Fixadores",
  fita: "Fixadores",
  clipe: "Fixadores",
  chapa: "Fixadores",
  arruela: "Fixadores",
  porca: "Fixadores",

  // Escoramento
  escora: "Escoramento",
  andaime: "Escoramento",
  escada: "Escoramento",
  suporte: "Escoramento",

  // Proteção / EPI
  capacete: "EPI",
  luva: "EPI",
  protetor: "EPI",
  colete: "EPI",
  máscara: "EPI",

  // Cabos e conexões
  cabo: "Cabos & Conexões",
  fio: "Cabos & Conexões",
  conector: "Cabos & Conexões",
  tomada: "Cabos & Conexões",

  // Ferramentas
  martelo: "Ferramentas",
  chave: "Ferramentas",
  alicate: "Ferramentas",
  broca: "Ferramentas",

  // Acabamento
  tinta: "Acabamento",
  verniz: "Acabamento",
  primer: "Acabamento",
  selador: "Acabamento",

  // Tubos e canos
  tubo: "Tubos & Canos",
  cano: "Tubos & Canos",
  condute: "Tubos & Canos",

  // Plástico
  plástico: "Plásticos",
  pvc: "Plásticos",
  poliestireno: "Plásticos",
  polietileno: "Plásticos",
};

/**
 * Extrai possível classe do nome do produto
 */
export function inferClassFromName(productName: string): string | undefined {
  const lower = productName.toLowerCase();
  for (const [keyword, classe] of Object.entries(CLASS_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return classe;
    }
  }
  return undefined;
}

/**
 * Extrai material do nome do produto (comum em nomes técnicos)
 */
export function inferMaterialFromName(productName: string): string | undefined {
  const materials = [
    "aço", "ferro", "alumínio", "cobre", "galvanizado", "inoxidável",
    "nylon", "plástico", "vidro", "madeira", "borracha", "silicone",
    "poliestireno", "poliéster", "polietileno", "latão", "zinco"
  ];
  const lower = productName.toLowerCase();
  for (const mat of materials) {
    if (lower.includes(mat)) {
      return mat.charAt(0).toUpperCase() + mat.slice(1);
    }
  }
  return undefined;
}

/**
 * Inferir categorização a partir de um nome de produto e histórico do usuário.
 *
 * Estratégia:
 * 1. Busca produtos similares já classificados
 * 2. Se encontrar (score > 0.6), reutiliza classe/categoria/subcategoria
 * 3. Senão, tenta extrair da análise do nome
 * 4. Retorna parcial se conseguir alguns campos
 */
export async function inferCategories(
  productName: string,
  userId: number,
  ncmCode?: string,
): Promise<InferredCategories> {
  const db = await getDb();
  if (!db) return {};

  try {
    // 1. Procura produtos similares já classificados
    const classified = await db
      .select({
        id: products.id,
        name: products.name,
        classe: products.classe,
        categoria: products.categoria,
        subcategoria: products.subcategoria,
        material: products.material,
      })
      .from(products)
      .where(
        and(
          eq(products.userId, userId),
          // Pelo menos um desses campos deve estar preenchido
          (db as any).or?.(
            (f: any) => f.ne(products.classe, null),
            (f: any) => f.ne(products.categoria, null),
          ),
        ),
      );

    if (classified.length > 0) {
      const prodNames = classified.map((c) => ({ id: c.id, name: c.name }));
      const similar = findTopSimilarProducts(productName, prodNames, 3, 0.6);

      if (similar.length > 0 && similar[0].score >= 0.6) {
        // Reutiliza a categorização do produto mais similar
        const best = similar[0];
        const classifiedProduct = classified.find((c) => c.id === best.id);
        if (classifiedProduct) {
          return {
            classe: classifiedProduct.classe || undefined,
            categoria: classifiedProduct.categoria || undefined,
            subcategoria: classifiedProduct.subcategoria || undefined,
          };
        }
      }
    }

    // 2. Se não encontrou similar, tenta extrair do nome
    const result: InferredCategories = {};

    // Classe a partir de palavras-chave
    const classe = inferClassFromName(productName);
    if (classe) result.classe = classe;

    // Material a partir do nome
    const material = inferMaterialFromName(productName);
    if (material) {
      // Material pode virar subcategoria em alguns contextos
      if (!result.subcategoria && material !== classe) {
        result.subcategoria = material;
      }
    }

    // 3. Se temos NCM, podemos buscar um produto com mesmo NCM para copiar categorias
    if (ncmCode && ncmCode !== "00000000") {
      const sameNcm = await db
        .select({
          classe: products.classe,
          categoria: products.categoria,
          subcategoria: products.subcategoria,
        })
        .from(products)
        .where(
          and(
            eq(products.userId, userId),
            eq(products.ncmCode, ncmCode),
          ),
        )
        .limit(1);

      if (sameNcm.length > 0) {
        const ref = sameNcm[0];
        result.classe = result.classe || ref.classe || undefined;
        result.categoria = result.categoria || ref.categoria || undefined;
        result.subcategoria = result.subcategoria || ref.subcategoria || undefined;
      }
    }

    return result;
  } catch (err) {
    console.error("[productCategorizationService] erro ao inferir categorias:", err);
    return {};
  }
}

/**
 * Encontra um produto existente por nome normalizado e fornecedor.
 * Usado para dedup na distribuição de proforma.
 */
export async function findProductByNameAndSupplier(
  userId: number,
  productName: string,
  supplierId?: number,
): Promise<{ id: number; name: string } | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const normalized = normalizeProductName(productName);

    // Busca produto com nome normalizado idêntico
    const existing = await db
      .select({
        id: products.id,
        name: products.name,
        supplierId: products.supplierId,
      })
      .from(products)
      .where(
        and(
          eq(products.userId, userId),
          // Produto com nome normalizado próximo (usando o serviço de similaridade de nome)
        ),
      );

    // Filtro manual por similaridade de nome normalizado
    for (const product of existing) {
      const productNormalized = normalizeProductName(product.name);
      if (productNormalized === normalized) {
        // Se fornecedor foi passado, verifica se é o mesmo
        if (supplierId && product.supplierId !== supplierId) {
          continue; // outro fornecedor, skip
        }
        return { id: product.id, name: product.name };
      }
    }

    return null;
  } catch (err) {
    console.error("[productCategorizationService] erro ao buscar produto:", err);
    return null;
  }
}
