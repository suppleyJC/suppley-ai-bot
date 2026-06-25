/**
 * Proforma Service — ingestão e distribuição de proformas/invoices.
 *
 * Materializa a porta de entrada estruturada da Excambia (blueprint):
 *   upload/manual → extrai (IA) → proforma → revisão humana → distribui p/ base
 *     • fornecedor → industries (tipoEntidade=fornecedor)
 *     • itens/preços → products (Ativos & Insumos)
 */
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { suggestNCMWithAI, suggestNCMBatch } from "./ncmService";
import { suggestNCMSmart } from "./smartNcmService";
import type { InsertProforma, InsertProformaItem } from "../../drizzle/schema";

// ============================================================
// Tipos
// ============================================================

export interface ProformaItemInput {
  /** Nome curto comercial em PT-BR (ex.: "Escora de aço Q235"). */
  productName: string;
  /** Especificações técnicas completas (medidas, material, acabamento...). */
  description?: string;
  /** Nome original como aparece no documento (antes da tradução p/ PT-BR). */
  productNameOriginal?: string;
  ncmCode?: string;
  /** Confiança da NCM sugerida (0-100); presente quando a NCM veio do classificador. */
  ncmConfidence?: number;
  quantity: number;
  unit: string;
  unitPriceCents: number;
}

export interface ProformaExtraction {
  supplierName?: string;
  supplierCountry?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  currency: string;
  incoterm: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  moq?: number;
  totalFobCents?: number;
  quotationDate?: string; // ISO 8601 date string (YYYY-MM-DD)
  items: ProformaItemInput[];
  confidence: number; // 0-100
}

// ============================================================
// 1) EXTRAÇÃO (IA) — a Excambia lê a proforma e estrutura
// ============================================================

const EXTRACTION_SCHEMA = {
  name: "proforma_extraction",
  schema: {
    type: "object",
    properties: {
      supplierName: { type: ["string", "null"], description: "Nome do fornecedor/fabricante" },
      supplierCountry: { type: ["string", "null"], description: "País do fornecedor" },
      supplierEmail: { type: ["string", "null"] },
      supplierPhone: { type: ["string", "null"] },
      currency: { type: "string", description: "Moeda ISO (USD, EUR, CNY...)" },
      incoterm: { type: "string", description: "FOB, CIF, EXW, DDP, etc." },
      paymentTerms: { type: ["string", "null"] },
      leadTimeDays: { type: ["number", "null"], description: "Prazo de produção em dias" },
      moq: { type: ["number", "null"], description: "Quantidade mínima de pedido" },
      totalFobCents: { type: ["number", "null"], description: "Valor total FOB em centavos da moeda" },
      quotationDate: { type: ["string", "null"], description: "Data da proforma/orçamento em formato YYYY-MM-DD (ex: 2026-06-25)" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            productName: { type: "string", description: "Nome comercial CURTO em PT-BR que IDENTIFICA A VARIANTE específica. Inclua os atributos que diferenciam o item e IMPACTAM O PREÇO: tamanho/bitola, diâmetro do tubo, classe do material, acabamento. NÃO inclua specs secundárias (peso, embalagem, tolerâncias). Mantenha conciso (~100 chars). Ex: 'Prego cabeça simples 17x27'; 'Escora de aço 4m, tubo 60, galvanizada a fogo' (≠ 'Escora de aço 3,5m, tubo 48, pré-galvanizada')." },
            description: { type: ["string", "null"], description: "Ficha técnica COMPLETA do produto em PT-BR (pode repetir o que está no nome + todo o resto): medidas exatas, material, componentes, acabamento, dimensões, peso bruto, embalagem. Ex: 'Tubo interno 48x2,2x2200mm; Tubo externo 60x2,2x2000mm; Placa de base 120x120x5mm; Pino G 12mm; Galvanizado por imersão a quente; Altura ajustável 2200-4000mm; Peso bruto 13kg'. Null se não houver specs." },
            productNameOriginal: { type: ["string", "null"], description: "Nome do produto EXATAMENTE como aparece no documento, sem traduzir" },
            ncmCode: { type: ["string", "null"], description: "NCM apenas se estiver explícito no documento; senão null (será classificada depois)" },
            quantity: { type: "number" },
            unit: { type: "string" },
            unitPriceCents: { type: "number", description: "Preço unitário em centavos da moeda" },
          },
          required: ["productName", "quantity", "unit", "unitPriceCents"],
        },
      },
      confidence: { type: "number", description: "Confiança da extração de 0 a 100" },
    },
    required: ["currency", "incoterm", "items", "confidence"],
  },
} as const;

/**
 * Extrai os dados de uma proforma (PDF/imagem) usando a Excambia (Claude).
 */
export async function extractProformaFromFile(
  fileUrl: string,
  mimeType: string,
  hints?: { supplierName?: string; expectedProducts?: string[] }
): Promise<ProformaExtraction> {
  const prompt = `Você é um especialista em comércio exterior processando uma PROFORMA INVOICE.

Extraia os dados com máxima precisão:
1. Fornecedor/fabricante: nome, país, email, telefone
2. Data do documento: mês, dia, ano (quando disponível)
3. Cada item: nome do produto, NCM (se houver), quantidade, unidade, preço unitário
4. Moeda, incoterm (FOB/CIF/EXW/DDP), condições de pagamento, lead time, MOQ, total FOB

TRADUÇÃO E ESTRUTURAÇÃO DOS PRODUTOS (importante):
- "productName": nome comercial CURTO em PORTUGUÊS DO BRASIL que IDENTIFICA A VARIANTE. Inclua só os atributos que diferenciam o item e IMPACTAM O PREÇO (tamanho/bitola, diâmetro do tubo, classe do material, acabamento); deixe peso/embalagem/tolerâncias fora. Variantes da mesma classe DEVEM ter nomes distintos, pois entram no histórico de preço separadamente:
    • "Prego cabeça simples 17x27" ≠ "Prego cabeça simples 18x36"
    • "Escora de aço 4m, tubo 60, galvanizada a fogo" ≠ "Escora de aço 3,5m, tubo 48, pré-galvanizada"
- "description": ficha técnica COMPLETA em PT-BR (pode repetir o que está no nome + todo o resto: medidas exatas, material, tubos, placa, pino, acabamento, altura, peso, embalagem). Ex: "Tubo interno 48x2,2x2200mm; Tubo externo 60x2,2x2000mm; Placa de base 120x120x5mm; Galvanizado por imersão a quente; Altura ajustável 2200-4000mm; Peso bruto 13kg". Null se não houver specs.
- "productNameOriginal": mantenha o nome EXATAMENTE como está no documento, sem traduzir.

IMPORTANTE:
- Preços SEMPRE em centavos (multiplique por 100). Ex: USD 12.50 → 1250.
- "quotationDate": extraia a data da proforma em formato YYYY-MM-DD (ex: 2026-06-25). Se não encontrar data explícita, retorne null.
- NCM: só preencha "ncmCode" se a NCM estiver EXPLÍCITA no documento. Caso contrário deixe null — a classificação será feita por um motor certificado depois.
- Se um campo não existir, retorne null.
- "confidence" = sua certeza geral (0-100).
${hints?.supplierName ? `- Fornecedor esperado: ${hints.supplierName}` : ""}
${hints?.expectedProducts?.length ? `- Produtos esperados: ${hints.expectedProducts.join(", ")}` : ""}`;

  let base64Data: string;
  try {
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`HTTP ${fileResponse.status} ao baixar arquivo`);
    }
    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    base64Data = buffer.toString("base64");
  } catch (downloadError) {
    throw new Error(`Erro ao baixar arquivo: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`);
  }

  const mediaType = mimeType === "application/pdf" ? "application/pdf" : "image/jpeg";
  const contentType = mimeType === "application/pdf" ? "document" : "image";

  const result = await invokeLLM({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: contentType as any,
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Data,
            },
          } as any,
        ],
      },
    ],
    outputSchema: EXTRACTION_SCHEMA as any,
    maxTokens: 4096,
  });

  const content = result.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const parsed = JSON.parse(text) as ProformaExtraction;
  // Normaliza
  parsed.items = parsed.items || [];
  parsed.currency = parsed.currency || "USD";
  parsed.incoterm = parsed.incoterm || "FOB";
  parsed.confidence = typeof parsed.confidence === "number" ? parsed.confidence : 50;

  // Classifica a NCM dos itens que vieram sem NCM no documento, usando o motor
  // certificado (busca no banco real de NCMs, não inventa). A NCM é sugestão:
  // o usuário confirma na tela antes de distribuir para a base.
  await classificarNcmDosItens(parsed.items);

  return parsed;
}

/**
 * Preenche ncmCode/ncmConfidence dos itens sem NCM usando o classificador
 * certificado em lote. Usa o nome ORIGINAL (em inglês/espanhol) como descrição
 * extra para melhorar a precisão da classificação.
 */
async function classificarNcmDosItens(items: ProformaItemInput[]): Promise<void> {
  const semNcm = items.filter((it) => !it.ncmCode || it.ncmCode.trim() === "");
  if (semNcm.length === 0) return;

  try {
    const sugestoes = await suggestNCMBatch(
      semNcm.map((it) => ({ name: it.productName, description: it.productNameOriginal })),
    );

    for (const item of semNcm) {
      const result = sugestoes.get(item.productName);
      if (result?.suggestedNCM) {
        item.ncmCode = result.suggestedNCM.ncmCode;
        item.ncmConfidence = result.suggestedNCM.confidence;
      }
    }
  } catch (error) {
    // Classificação é best-effort: se falhar, o item segue sem NCM (usuário
    // preenche manualmente). Não derruba a extração inteira por causa disso.
    console.error("[Proforma] Falha ao classificar NCM dos itens:", error);
  }
}

// ============================================================
// 2) CRIAÇÃO (manual ou a partir da extração)
// ============================================================

async function generateProformaNumber(userId: number): Promise<string> {
  const count = await db.countProformasByUser(userId);
  const year = new Date().getFullYear();
  return `PF-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function createProforma(
  userId: number,
  data: {
    tipo?: "proforma" | "invoice";
    supplierName?: string;
    supplierCountry?: string;
    supplierEmail?: string;
    supplierPhone?: string;
    currency: string;
    incoterm?: string;
    paymentTerms?: string;
    leadTimeDays?: number;
    moq?: number;
    totalFobCents?: number;
    quotationDate?: string;
    items: ProformaItemInput[];
    fileUrl?: string;
    fileName?: string;
    documentoId?: number;
    operacaoId?: number;
    rfqId?: number;
    extractionConfidence?: number;
    rawExtraction?: unknown;
    status?: InsertProforma["status"];
  }
): Promise<{ id: number; numero: string }> {
  const numero = await generateProformaNumber(userId);

  const proformaId = await db.createProforma({
    userId,
    numero,
    tipo: data.tipo ?? "proforma",
    supplierName: data.supplierName,
    supplierCountry: data.supplierCountry,
    supplierEmail: data.supplierEmail,
    supplierPhone: data.supplierPhone,
    currency: data.currency,
    incoterm: data.incoterm ?? "FOB",
    paymentTerms: data.paymentTerms,
    leadTimeDays: data.leadTimeDays,
    moq: data.moq,
    totalFobCents: data.totalFobCents,
    quotationDate: data.quotationDate ? new Date(data.quotationDate) : undefined,
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    documentoId: data.documentoId,
    operacaoId: data.operacaoId,
    rfqId: data.rfqId,
    extractionConfidence: data.extractionConfidence,
    rawExtraction: (data.rawExtraction as any) ?? null,
    status: data.status ?? (data.extractionConfidence != null ? "extraida" : "rascunho"),
  });

  for (const item of data.items) {
    const total = item.unitPriceCents * item.quantity;
    await db.createProformaItem({
      proformaId,
      productName: item.productName,
      description: item.description,
      ncmCode: item.ncmCode,
      quantity: item.quantity,
      unit: item.unit || "UN",
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: total,
    } satisfies InsertProformaItem);
  }

  return { id: proformaId, numero };
}

/**
 * Atualiza uma proforma existente (edição manual do rascunho) e reescreve
 * seus itens. Só afeta proformas do próprio usuário. Não redistribui para a
 * base — a distribuição segue sendo uma ação explícita separada.
 */
export async function updateProforma(
  userId: number,
  proformaId: number,
  data: {
    supplierName?: string;
    supplierCountry?: string;
    supplierEmail?: string;
    supplierPhone?: string;
    currency?: string;
    incoterm?: string;
    paymentTerms?: string;
    leadTimeDays?: number;
    moq?: number;
    quotationDate?: string;
    items: ProformaItemInput[];
  }
): Promise<{ id: number }> {
  const existing = await db.getProformaById(proformaId, userId);
  if (!existing) throw new Error("Proforma não encontrada");

  await db.updateProforma(proformaId, userId, {
    supplierName: data.supplierName,
    supplierCountry: data.supplierCountry,
    supplierEmail: data.supplierEmail,
    supplierPhone: data.supplierPhone,
    currency: data.currency,
    incoterm: data.incoterm,
    paymentTerms: data.paymentTerms,
    leadTimeDays: data.leadTimeDays,
    moq: data.moq,
    quotationDate: data.quotationDate ? new Date(data.quotationDate) : undefined,
  });

  // Reescreve os itens: remove os antigos e insere os atuais.
  await db.deleteProformaItems(proformaId);
  for (const item of data.items) {
    const total = item.unitPriceCents * item.quantity;
    await db.createProformaItem({
      proformaId,
      productName: item.productName,
      description: item.description,
      ncmCode: item.ncmCode,
      quantity: item.quantity,
      unit: item.unit || "UN",
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: total,
    } satisfies InsertProformaItem);
  }

  return { id: proformaId };
}

// ============================================================
// 3) DISTRIBUIÇÃO PARA A BASE (COESÃO)
//    fornecedor → industries · itens → products
// ============================================================

/** Upsert do fornecedor na base unificada (industries, tipoEntidade=fornecedor). */
async function upsertFornecedor(
  userId: number,
  data: { name: string; country: string; email?: string; phone?: string; incoterm?: string; currency?: string; paymentTerms?: string; leadTimeDays?: number }
): Promise<number> {
  const existing = await db.getIndustriesByUser(userId);
  const match = existing.find(
    (i) => i.name.trim().toLowerCase() === data.name.trim().toLowerCase()
  );
  if (match) return match.id;

  const created = await db.createIndustry({
    userId,
    name: data.name,
    country: data.country || "Desconhecido",
    tipoEntidade: "fornecedor",
    contactEmail: data.email,
    contactPhone: data.phone,
    preferredIncoterm: (data.incoterm as any) || "FOB",
    preferredCurrency: (data.currency as any) || "USD",
    paymentTerms: data.paymentTerms,
    leadTimeDays: data.leadTimeDays,
    status: "prospect",
  } as any);
  return Number((created as any).id);
}

/**
 * Distribui uma proforma já cadastrada para a base:
 *  - cria/vincula o fornecedor em industries
 *  - cria os produtos em products (Ativos & Insumos), sugerindo NCM se faltar
 *  - registra histórico de preços em supplierPrices para rastreamento cronológico
 */
export async function distributeProformaToBase(
  userId: number,
  proformaId: number
): Promise<{ industriaId: number | null; productIds: number[] }> {
  const proforma = await db.getProformaById(proformaId, userId);
  if (!proforma) throw new Error("Proforma não encontrada");

  const items = await db.getProformaItems(proformaId);

  // 1) Fornecedor → industries
  let industriaId: number | null = proforma.industriaId ?? null;
  if (!industriaId && proforma.supplierName) {
    industriaId = await upsertFornecedor(userId, {
      name: proforma.supplierName,
      country: proforma.supplierCountry || "Desconhecido",
      email: proforma.supplierEmail || undefined,
      phone: proforma.supplierPhone || undefined,
      incoterm: proforma.incoterm || undefined,
      currency: proforma.currency,
      paymentTerms: proforma.paymentTerms || undefined,
      leadTimeDays: proforma.leadTimeDays || undefined,
    });
  }

  // 2) Itens → products (Ativos & Insumos)
  const productIds: number[] = [];
  for (const item of items) {
    let ncm = item.ncmCode || undefined;
    if (!ncm) {
      try {
        // Sugestão inteligente: reutiliza NCM de produtos similares já validados,
        // senão faz busca normal. Melhora a consistência e economiza API calls.
        const suggestion = await suggestNCMSmart(item.productName, userId);
        ncm = suggestion?.ncmCode;
      } catch {
        /* segue sem NCM */
      }
    }

    const product = await db.createProduct({
      userId,
      name: item.productName,
      description: item.description ?? undefined,
      ncmCode: ncm || "00000000",
      unit: item.unit || "UN",
      supplierId: industriaId ?? undefined,
      origem: "cotado_nao_importado",
      ncmStatus: ncm ? "validado" : "sugerido",
      custoImportadoRefCents: item.unitPriceCents,
      // Classificação (novos campos do Sprint 3)
      classe: undefined,
      criticidade: undefined,
      subcategoria: undefined,
      tags: undefined,
      aplicacao: undefined,
      material: undefined,
      dimensoes: undefined,
    });

    if (product) {
      productIds.push(product.id);
      await db.updateProformaItem(item.id, { productId: product.id });
    }
  }

  await db.updateProforma(proformaId, userId, {
    industriaId: industriaId ?? undefined,
    status: "distribuida",
    distributedAt: new Date(),
  });

  return { industriaId, productIds };
}

// ============================================================
// 4) LEITURA
// ============================================================

export async function listProformas(userId: number, filters?: { status?: string; industriaId?: number }) {
  return db.getProformasByUser(userId, filters);
}

export async function getProformaDetail(userId: number, proformaId: number) {
  const proforma = await db.getProformaById(proformaId, userId);
  if (!proforma) return null;
  const items = await db.getProformaItems(proformaId);
  return { proforma, items };
}
