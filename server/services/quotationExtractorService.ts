import { invokeLLM } from "../_core/llm";

export interface ExtractedProduct {
  productName: string;
  sku?: string;
  ncmCode?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  pdfLineReference?: string;
}

export interface ExtractedQuotation {
  supplierName?: string;
  supplierCountry?: string;
  quotationDate?: string;
  quotationNumber?: string;
  currency: string;
  products: ExtractedProduct[];
  totalValue?: number;
  freight?: number;
  insurance?: number;
  incoterm?: string;
  notes?: string;
}

/**
 * Extract product and quotation data from a PDF data URL using LLM
 * This version accepts a data URL directly (data:application/pdf;base64,...)
 */
export async function extractQuotationFromPdfDirect(dataUrl: string): Promise<ExtractedQuotation> {
  console.log("[QuotationExtractor] Extracting data from PDF data URL, length:", dataUrl.length);

  // Validate data URL and extract base64
  if (!dataUrl || !dataUrl.startsWith("data:application/pdf;base64,")) {
    throw new Error("Data URL do PDF inválida");
  }

  const base64Data = dataUrl.replace("data:application/pdf;base64,", "");

  try {
    console.log("[QuotationExtractor] Calling LLM with base64 PDF...");
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um especialista em análise de cotações de importação. Sua tarefa é extrair informações estruturadas de PDFs de cotações de fornecedores estrangeiros.

O documento pode estar em português, espanhol ou inglês. Analise cuidadosamente tabelas, listas de produtos e valores.

Extraia as seguintes informações do PDF:
1. Dados do fornecedor (nome, país - identifique pelo endereço ou cabeçalho)
2. Dados da cotação (número, data)
3. Lista de produtos com:
   - Nome/Descrição: COPIE EXATAMENTE o texto da coluna DESCRIPCIÓN ou similar (ex: "Clavo con cabeza 10 x 10", "Clavo sin cabeza 17 x 21")
   - SKU/Código: Copie da coluna PULG., MEDIDA ou similar (ex: "1 x 18", "2 x 11 s/c")
   - Código NCM (se disponível no documento)
   - Quantidade: Use o valor da coluna PESO (KG) ou similar. Se for preço por kg, use 1000 para representar 1 tonelada
   - Unidade de medida: Use KG se a coluna U.M. mostrar "kg"
   - Preço unitário: Use o valor da coluna PRECIO (preço por kg)
   - Preço total: Use o valor da coluna PRECIO x TON (preço por tonelada)
4. Moeda utilizada (USD, EUR, etc. - identifique pelo símbolo ou texto)
5. Valor do frete (se informado)
6. Valor do seguro (se informado)
7. Incoterm (FOB, CIF, EXW, etc. - procure em "Condición de venta" ou similar)
8. Valor total da cotação

IMPORTANTE:
- NUNCA use nomes genéricos como "Produto 1", "Produto 2". Copie o nome EXATO do PDF.
- ATENÇÃO aos formatos de número: "USD 1,20" significa 1.20 USD (vírgula é separador decimal)
- "USD 1.200,0" significa 1200.0 USD (ponto é separador de milhar, vírgula é decimal)
- Se o NCM não estiver no documento, deixe o campo ncmCode como string vazia ""
- Converta todos os valores numéricos para números JavaScript (use ponto como decimal)
- Use códigos de moeda ISO (USD, EUR, GBP, etc.)
- Para unidades, use: UN (unidade), KG (quilograma), TON (tonelada), CX (caixa), PC (peça)
- Se houver múltiplos produtos, liste TODOS separadamente
- Identifique o país do fornecedor pelo endereço (ex: "Lambaré, Paraguay" = Paraguai)
- Para campos opcionais não encontrados, use string vazia "" ou 0 para números

Retorne os dados em formato JSON com a seguinte estrutura:
{
  "supplierName": "Nome do fornecedor",
  "supplierCountry": "País",
  "quotationDate": "YYYY-MM-DD",
  "quotationNumber": "Número",
  "currency": "USD",
  "products": [
    {
      "productName": "Nome exato do produto",
      "sku": "Código/Medida",
      "ncmCode": "",
      "quantity": 1000,
      "unit": "KG",
      "unitPrice": 1.18,
      "totalPrice": 1180
    }
  ],
  "totalValue": 0,
  "freight": 0,
  "insurance": 0,
  "incoterm": "FOB",
  "notes": ""
}`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analise este PDF de cotação e extraia todas as informações dos produtos e valores. Retorne os dados em formato JSON estruturado."
            },
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_object"
      }
    });

    console.log("[QuotationExtractor] LLM response received");
    
    // Check for error in response
    if ((response as any).error) {
      console.error("[QuotationExtractor] LLM returned error:", (response as any).error);
      throw new Error((response as any).error.message || "Erro na API de extração");
    }
    
    const content = response.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("[QuotationExtractor] Empty response from LLM");
      throw new Error("Resposta vazia do processador de PDF");
    }
    
    // Handle both string and array content
    let textContent: string;
    if (typeof content === "string") {
      textContent = content;
    } else if (Array.isArray(content)) {
      // Extract text from array of content parts
      const textPart = content.find((p: any) => p.type === "text");
      if (textPart && "text" in textPart) {
        textContent = textPart.text;
      } else {
        throw new Error("Formato de resposta inesperado");
      }
    } else {
      throw new Error("Formato de resposta inválido");
    }

    try {
      const extracted = JSON.parse(textContent) as ExtractedQuotation;
      
      // Validate extracted data
      if (!extracted.products || !Array.isArray(extracted.products)) {
        console.error("[QuotationExtractor] Invalid products array");
        throw new Error("Estrutura de produtos inválida");
      }
      
      // Add currency to each product and clean up empty strings
      extracted.products = extracted.products.map(p => ({
        ...p,
        currency: extracted.currency || "USD",
        ncmCode: p.ncmCode || undefined,
        sku: p.sku || undefined,
        pdfLineReference: p.pdfLineReference || undefined
      }));
      
      console.log("[QuotationExtractor] Extracted", extracted.products.length, "products");
      return extracted;
    } catch (parseError) {
      console.error("[QuotationExtractor] Failed to parse LLM response:", parseError);
      console.error("[QuotationExtractor] Raw content:", textContent.substring(0, 500));
      throw new Error("Erro ao processar resposta da extração. O PDF pode não conter dados de cotação reconhecíveis.");
    }
  } catch (error) {
    console.error("[QuotationExtractor] Error extracting from PDF:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Erro ao processar o PDF. Verifique se o arquivo é uma cotação válida.");
  }
}

/**
 * Extract product and quotation data from a PDF URL using LLM
 * This version downloads the PDF first and converts to data URL
 */
export async function extractQuotationFromPdf(pdfUrl: string): Promise<ExtractedQuotation> {
  console.log("[QuotationExtractor] Extracting data from PDF URL:", pdfUrl);
  
  // Validate URL
  if (!pdfUrl || !pdfUrl.startsWith("http")) {
    throw new Error("URL do PDF inválida");
  }
  
  // Download PDF and convert to data URL
  console.log("[QuotationExtractor] Downloading PDF...");
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Erro ao baixar PDF: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  const dataUrl = `data:application/pdf;base64,${base64}`;
  
  console.log("[QuotationExtractor] PDF downloaded, size:", buffer.length, "bytes");
  
  return extractQuotationFromPdfDirect(dataUrl);
}

/**
 * Validate and normalize extracted product data
 */
export function normalizeExtractedProducts(products: ExtractedProduct[]): ExtractedProduct[] {
  return products.map((p, index) => ({
    productName: p.productName?.trim() || `Produto ${index + 1}`,
    sku: p.sku?.trim() || undefined,
    ncmCode: p.ncmCode?.replace(/\D/g, "").slice(0, 8) || undefined,
    quantity: Math.max(1, Math.round(p.quantity || 1)),
    unit: normalizeUnit(p.unit),
    unitPrice: Math.max(0, p.unitPrice || 0),
    totalPrice: Math.max(0, p.totalPrice || (p.unitPrice * p.quantity) || 0),
    currency: p.currency || "USD",
    pdfLineReference: p.pdfLineReference || undefined
  }));
}

function normalizeUnit(unit: string): string {
  const normalized = (unit || "UN").toUpperCase().trim();
  const unitMap: Record<string, string> = {
    "UNIDADE": "UN",
    "UNIDADES": "UN",
    "UNIT": "UN",
    "UNITS": "UN",
    "PCS": "PC",
    "PIECE": "PC",
    "PIECES": "PC",
    "PEÇA": "PC",
    "PEÇAS": "PC",
    "QUILOGRAMA": "KG",
    "QUILOGRAMAS": "KG",
    "KILOGRAM": "KG",
    "KILOGRAMS": "KG",
    "TONELADA": "TON",
    "TONELADAS": "TON",
    "TONNE": "TON",
    "TONNES": "TON",
    "CAIXA": "CX",
    "CAIXAS": "CX",
    "BOX": "CX",
    "BOXES": "CX"
  };
  return unitMap[normalized] || normalized;
}
