/**
 * Auto Supplier Service - Cadastro automático de fornecedor pela SOFIA
 * Extrai dados do fornecedor de cotações e cria/atualiza cadastro automaticamente
 */

import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { suppliers } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { registerSupplierPrice } from "./priceComparisonService";

export interface ExtractedSupplierData {
  name: string;
  country: string;
  city?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  products?: string[];
  notes?: string;
  isMercosul: boolean;
}

// Países do Mercosul
const MERCOSUL_COUNTRIES = [
  "argentina", "brasil", "brazil", "paraguai", "paraguay", "uruguai", "uruguay",
  "venezuela", "bolívia", "bolivia"
];

/**
 * Extrai dados do fornecedor de uma cotação usando LLM
 */
export async function extractSupplierDataFromQuotation(
  quotationText: string,
  supplierName?: string,
  supplierCountry?: string
): Promise<ExtractedSupplierData> {
  console.log("[AutoSupplier] Extracting supplier data from quotation...");
  
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um especialista em análise de documentos comerciais. Sua tarefa é extrair informações do fornecedor de uma cotação de importação.

Analise o texto da cotação e extraia:
1. Nome completo da empresa fornecedora
2. País de origem (identifique pelo endereço, telefone ou contexto)
3. Cidade (se disponível)
4. Nome do contato comercial
5. Email de contato
6. Telefone de contato (com código do país)
7. Website (se disponível)
8. Lista de produtos que o fornecedor fabrica/vende (baseado nos itens da cotação)
9. Observações relevantes (condições de pagamento, prazos, etc.)

IMPORTANTE:
- Se o país for Argentina, Brasil, Paraguai, Uruguai, Venezuela ou Bolívia, marque como Mercosul
- Normalize o nome do país para português (ex: "Paraguay" → "Paraguai")
- Extraia o máximo de informações disponíveis
- Para campos não encontrados, deixe como null`
        },
        {
          role: "user",
          content: `Analise esta cotação e extraia os dados do fornecedor:

Nome do fornecedor (se conhecido): ${supplierName || "Não informado"}
País (se conhecido): ${supplierCountry || "Não informado"}

Texto da cotação:
${quotationText.substring(0, 5000)}

Retorne os dados em formato JSON.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "supplier_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome da empresa fornecedora" },
              country: { type: "string", description: "País de origem" },
              city: { type: "string", description: "Cidade" },
              contactName: { type: "string", description: "Nome do contato" },
              contactEmail: { type: "string", description: "Email de contato" },
              contactPhone: { type: "string", description: "Telefone com código do país" },
              website: { type: "string", description: "Website da empresa" },
              products: { 
                type: "array", 
                items: { type: "string" },
                description: "Lista de produtos fabricados/vendidos" 
              },
              notes: { type: "string", description: "Observações relevantes" }
            },
            required: ["name", "country", "city", "contactName", "contactEmail", "contactPhone", "website", "products", "notes"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Resposta vazia do LLM");
    }

    const extracted = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    
    // Determinar se é Mercosul
    const countryLower = (extracted.country || supplierCountry || "").toLowerCase();
    const isMercosul = MERCOSUL_COUNTRIES.some(c => countryLower.includes(c));

    return {
      name: extracted.name || supplierName || "Fornecedor Desconhecido",
      country: extracted.country || supplierCountry || "Desconhecido",
      city: extracted.city || undefined,
      contactName: extracted.contactName || undefined,
      contactEmail: extracted.contactEmail || undefined,
      contactPhone: extracted.contactPhone || undefined,
      website: extracted.website || undefined,
      products: extracted.products || [],
      notes: extracted.notes || undefined,
      isMercosul
    };
  } catch (error) {
    console.error("[AutoSupplier] Error extracting supplier data:", error);
    
    // Fallback com dados básicos
    const countryLower = (supplierCountry || "").toLowerCase();
    const isMercosul = MERCOSUL_COUNTRIES.some(c => countryLower.includes(c));
    
    return {
      name: supplierName || "Fornecedor Desconhecido",
      country: supplierCountry || "Desconhecido",
      isMercosul
    };
  }
}

/**
 * Busca fornecedor existente pelo nome
 */
export async function findExistingSupplier(userId: number, supplierName: string) {
  const db = await getDb();
  if (!db) return null;
  
  const normalizedName = supplierName.toLowerCase().trim();
  
  const allSuppliers = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.userId, userId));
  
  // Busca por nome similar
  return allSuppliers.find((s: typeof suppliers.$inferSelect) => 
    s.name.toLowerCase().trim() === normalizedName ||
    s.name.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(s.name.toLowerCase())
  );
}

/**
 * Cria ou atualiza fornecedor automaticamente
 */
export async function autoCreateOrUpdateSupplier(
  userId: number,
  supplierData: ExtractedSupplierData
): Promise<{ supplierId: number; isNew: boolean; updated: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se fornecedor já existe
  const existing = await findExistingSupplier(userId, supplierData.name);
  
  if (existing) {
    // Atualizar dados faltantes
    const updates: Record<string, any> = {};
    
    if (!existing.city && supplierData.city) updates.city = supplierData.city;
    if (!existing.contactName && supplierData.contactName) updates.contactName = supplierData.contactName;
    if (!existing.contactEmail && supplierData.contactEmail) updates.contactEmail = supplierData.contactEmail;
    if (!existing.contactPhone && supplierData.contactPhone) updates.contactPhone = supplierData.contactPhone;
    
    // Adicionar produtos às notas se houver novos
    if (supplierData.products && supplierData.products.length > 0) {
      const existingNotes = existing.notes || "";
      const newProducts = supplierData.products.filter(p => !existingNotes.includes(p));
      if (newProducts.length > 0) {
        updates.notes = existingNotes + (existingNotes ? "\n" : "") + 
          "Produtos: " + newProducts.join(", ");
      }
    }
    
    if (Object.keys(updates).length > 0) {
      const dbConn = await getDb();
      if (dbConn) {
        await dbConn
          .update(suppliers)
          .set(updates)
          .where(eq(suppliers.id, existing.id));
      }
      
      console.log(`[AutoSupplier] Updated supplier ${existing.id} with new data`);
      return { supplierId: existing.id, isNew: false, updated: true };
    }
    
    return { supplierId: existing.id, isNew: false, updated: false };
  }
  
  // Criar novo fornecedor
  const notes = supplierData.products && supplierData.products.length > 0
    ? `Produtos: ${supplierData.products.join(", ")}${supplierData.notes ? "\n" + supplierData.notes : ""}`
    : supplierData.notes;
  
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
  const result = await dbConn.insert(suppliers).values({
    userId,
    name: supplierData.name,
    country: supplierData.country,
    city: supplierData.city,
    contactName: supplierData.contactName,
    contactEmail: supplierData.contactEmail,
    contactPhone: supplierData.contactPhone,
    notes,
    isMercosul: supplierData.isMercosul
  });
  
  const supplierId = Number(result[0].insertId);
  console.log(`[AutoSupplier] Created new supplier ${supplierId}: ${supplierData.name}`);
  
  return { supplierId, isNew: true, updated: false };
}

/**
 * Processa cotação e cadastra fornecedor automaticamente
 */
export async function processQuotationForSupplier(
  userId: number,
  quotationText: string,
  supplierName?: string,
  supplierCountry?: string,
  productNames?: string[]
): Promise<{ supplierId: number; isNew: boolean; supplierData: ExtractedSupplierData }> {
  // Extrair dados do fornecedor
  const supplierData = await extractSupplierDataFromQuotation(
    quotationText,
    supplierName,
    supplierCountry
  );
  
  // Adicionar produtos da cotação se não foram extraídos
  if (productNames && productNames.length > 0 && (!supplierData.products || supplierData.products.length === 0)) {
    supplierData.products = productNames;
  }
  
  // Criar ou atualizar fornecedor
  const result = await autoCreateOrUpdateSupplier(userId, supplierData);
  
  return {
    supplierId: result.supplierId,
    isNew: result.isNew,
    supplierData
  };
}

/**
 * Salva preços dos produtos de uma cotação para histórico e comparação
 */
export async function saveQuotationPrices(
  userId: number,
  supplierId: number,
  quotationId: number,
  products: Array<{
    name: string;
    ncmCode?: string;
    sku?: string;
    unitPriceCents: number;
    currency: string;
    unit: string;
    quantity: number;
  }>,
  exchangeRate: number
): Promise<{ savedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let savedCount = 0;
  
  for (const product of products) {
    try {
      // Converter preço para BRL
      const unitPriceBrlCents = Math.round(product.unitPriceCents * exchangeRate / 1000000);
      
      await registerSupplierPrice({
        userId,
        supplierId,
        quotationId,
        productName: product.name,
        ncmCode: product.ncmCode,
        sku: product.sku,
        unitPriceCents: product.unitPriceCents,
        currency: product.currency,
        unit: product.unit,
        unitPriceBrlCents,
        exchangeRate,
        quantity: product.quantity,
      });
      
      savedCount++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
      errors.push(`Erro ao salvar preço de "${product.name}": ${errorMsg}`);
    }
  }
  
  console.log(`[AutoSupplier] Saved ${savedCount}/${products.length} prices for quotation ${quotationId}`);
  
  return { savedCount, errors };
}

/**
 * Processa cotação completa: cadastra fornecedor e salva preços
 */
export async function processFullQuotation(
  userId: number,
  quotationId: number,
  quotationText: string,
  supplierName: string | undefined,
  supplierCountry: string | undefined,
  products: Array<{
    name: string;
    ncmCode?: string;
    sku?: string;
    unitPriceCents: number;
    currency: string;
    unit: string;
    quantity: number;
  }>,
  exchangeRate: number
): Promise<{
  supplierId: number;
  isNewSupplier: boolean;
  supplierData: ExtractedSupplierData;
  pricesSaved: number;
  errors: string[];
}> {
  // 1. Cadastrar/atualizar fornecedor
  const productNames = products.map(p => p.name);
  const supplierResult = await processQuotationForSupplier(
    userId,
    quotationText,
    supplierName,
    supplierCountry,
    productNames
  );
  
  // 2. Salvar preços dos produtos
  const pricesResult = await saveQuotationPrices(
    userId,
    supplierResult.supplierId,
    quotationId,
    products,
    exchangeRate
  );
  
  return {
    supplierId: supplierResult.supplierId,
    isNewSupplier: supplierResult.isNew,
    supplierData: supplierResult.supplierData,
    pricesSaved: pricesResult.savedCount,
    errors: pricesResult.errors,
  };
}
