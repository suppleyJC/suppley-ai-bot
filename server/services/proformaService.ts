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
import { suggestNCMWithAI } from "./ncmService";
import type { InsertProforma, InsertProformaItem } from "../../drizzle/schema";

// ============================================================
// Tipos
// ============================================================

export interface ProformaItemInput {
  productName: string;
  ncmCode?: string;
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
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            productName: { type: "string" },
            ncmCode: { type: ["string", "null"] },
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
2. Cada item: nome do produto, NCM (se houver), quantidade, unidade, preço unitário
3. Moeda, incoterm (FOB/CIF/EXW/DDP), condições de pagamento, lead time, MOQ, total FOB

IMPORTANTE:
- Preços SEMPRE em centavos (multiplique por 100). Ex: USD 12.50 → 1250.
- Se um campo não existir, retorne null.
- "confidence" = sua certeza geral (0-100).
${hints?.supplierName ? `- Fornecedor esperado: ${hints.supplierName}` : ""}
${hints?.expectedProducts?.length ? `- Produtos esperados: ${hints.expectedProducts.join(", ")}` : ""}`;

  const result = await invokeLLM({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "file_url", file_url: { url: fileUrl, mime_type: mimeType as any } },
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
  return parsed;
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
      ncmCode: item.ncmCode,
      quantity: item.quantity,
      unit: item.unit || "UN",
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: total,
    } satisfies InsertProformaItem);
  }

  return { id: proformaId, numero };
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
        const suggestion = await suggestNCMWithAI(item.productName);
        ncm = suggestion?.suggestedNCM?.ncmCode;
      } catch {
        /* segue sem NCM */
      }
    }

    const product = await db.createProduct({
      userId,
      name: item.productName,
      ncmCode: ncm || "00000000",
      unit: item.unit || "UN",
      supplierId: industriaId ?? undefined,
      origem: "cotado_nao_importado",
      ncmStatus: ncm ? "sugerido" : "sugerido",
      custoImportadoRefCents: item.unitPriceCents,
    } as any);

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
