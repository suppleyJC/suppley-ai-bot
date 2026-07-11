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
import { buildAttachmentBlock } from "./attachmentBlock";
import { suggestNCMWithAI, suggestNCMBatch } from "./ncmService";
import { suggestNCMSmart } from "./smartNcmService";
import { inferCategories, findProductByNameAndSupplier } from "./productCategorizationService";
import { registerSupplierPrice } from "./priceComparisonService";
import { getExchangeRateAtDate } from "../db/exchangeDb";
import { storageGet } from "../storage";
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
  /** null = item cotado SEM preço (entra na base sinalizado, fora do histórico). */
  unitPriceCents: number | null;
}

/** Setores válidos do cadastro de fornecedores (industries.sector). */
export const SUPPLIER_SECTORS = [
  "metals", "construction", "machinery", "electronics", "chemicals", "textiles",
  "food", "automotive", "plastics", "wood", "packaging", "energy", "other",
] as const;
export type SupplierSector = (typeof SUPPLIER_SECTORS)[number];

function normalizeSector(value?: string | null): SupplierSector | undefined {
  const v = (value || "").trim().toLowerCase();
  return (SUPPLIER_SECTORS as readonly string[]).includes(v) ? (v as SupplierSector) : undefined;
}

export interface ProformaExtraction {
  supplierName?: string;
  supplierCountry?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  /** Setor do fornecedor sugerido pela IA (enum industries.sector). */
  supplierSector?: string;
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
      supplierSector: {
        type: ["string", "null"],
        enum: [...SUPPLIER_SECTORS, null],
        description:
          "Setor do fornecedor deduzido do nome da empresa e dos produtos cotados: " +
          "metals (metais/aço/ferro), construction (construção civil), machinery (máquinas), " +
          "electronics, chemicals, textiles, food, automotive, plastics, wood (madeira), " +
          "packaging (embalagens/fitas/adesivos), energy. Use 'other' apenas se nada se aplicar.",
      },
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
 * Extrai os dados de uma proforma usando a Excambia (Claude).
 * Formatos: PDF (texto ou escaneado), planilha (XLSX/XLS/CSV), Word (.docx),
 * texto puro e imagem (JPEG/PNG/WebP) — via buildAttachmentBlock (mesmo
 * pipeline do chat).
 */
export async function extractProformaFromFile(
  fileUrl: string,
  mimeType: string,
  hints?: { supplierName?: string; expectedProducts?: string[]; fileName?: string }
): Promise<ProformaExtraction> {
  const prompt = `Você é um especialista em comércio exterior processando uma PROFORMA INVOICE.

Extraia os dados com máxima precisão:
1. Fornecedor/fabricante: nome, país, email, telefone e SETOR de atuação
   ("supplierSector": deduza pelo nome da empresa e pelos produtos cotados — ex.: fitas adesivas → packaging;
   pregos/escoras de aço → metals; use "other" só em último caso)
2. Data do documento: mês, dia, ano (quando disponível)
3. Cada item: nome do produto, NCM (se houver), quantidade, unidade, preço unitário
4. Moeda, incoterm (FOB/CIF/EXW/DDP), condições de pagamento, lead time, MOQ, total FOB

TRADUÇÃO E ESTRUTURAÇÃO DOS PRODUTOS (importante):
- "productName": nome comercial CURTO em PORTUGUÊS DO BRASIL que IDENTIFICA A VARIANTE. Inclua só os atributos que diferenciam o item e IMPACTAM O PREÇO (tamanho/bitola, diâmetro do tubo, classe do material, acabamento); deixe peso/embalagem/tolerâncias fora. Variantes da mesma classe DEVEM ter nomes distintos, pois entram no histórico de preço separadamente:
    • "Prego cabeça simples 17x27" ≠ "Prego cabeça simples 18x36"
    • "Escora de aço 4m, tubo 60, galvanizada a fogo" ≠ "Escora de aço 3,5m, tubo 48, pré-galvanizada"
- "description": ficha técnica COMPLETA em PT-BR (pode repetir o que está no nome + todo o resto: medidas exatas, material, tubos, placa, pino, acabamento, altura, peso, embalagem). Ex: "Tubo interno 48x2,2x2200mm; Tubo externo 60x2,2x2000mm; Placa de base 120x120x5mm; Galvanizado por imersão a quente; Altura ajustável 2200-4000mm; Peso bruto 13kg". Null se não houver specs.
- "productNameOriginal": mantenha o nome EXATAMENTE como está no documento, sem traduzir.

FORMATO DO DOCUMENTO (layouts variados — leia com atenção):
- O conteúdo pode chegar como tabela Markdown (planilha convertida), texto corrido de PDF
  (colunas podem vir coladas ou separadas por espaços), documento Word ou imagem.
- Um item pode ocupar VÁRIAS linhas (nome numa, specs noutra, preço noutra) — junte as
  partes pelo contexto antes de estruturar.
- COMPLETUDE É OBRIGATÓRIA: liste TODOS os itens do documento, na ordem em que aparecem,
  um registro por variante. NUNCA resuma ("e outros itens"), NUNCA selecione "os principais",
  NUNCA pare no meio. Se o documento tem 80 linhas de item, "items" deve ter 80 entradas.
- Linhas de subtotal/total/frete/observação NÃO são itens — ignore-as no array.

IMPORTANTE:
- Preços SEMPRE em centavos (multiplique por 100). Ex: USD 12.50 → 1250.
- "quotationDate": extraia a data da proforma em formato YYYY-MM-DD (ex: 2026-06-25). Se não encontrar data explícita, retorne null.
- NCM: só preencha "ncmCode" se a NCM estiver EXPLÍCITA no documento. Caso contrário deixe null — a classificação será feita por um motor certificado depois.
- Se um campo não existir, retorne null.
- "confidence" = sua certeza geral (0-100).
${hints?.supplierName ? `- Fornecedor esperado: ${hints.supplierName}` : ""}
${hints?.expectedProducts?.length ? `- Produtos esperados: ${hints.expectedProducts.join(", ")}` : ""}`;

  // MULTI-FORMATO: o mesmo pipeline do chat (buildAttachmentBlock) lê PDF
  // (texto ou escaneado), planilha (xlsx/xls/csv), Word (.docx), texto puro e
  // imagem — com o media_type CORRETO (antes, PNG/WebP iam rotulados de JPEG
  // e a API recusava). Cotação em qualquer formato entra pela mesma porta.
  const fileBlock = await buildAttachmentBlock({
    url: fileUrl,
    mimeType,
    name: hints?.fileName ?? "proforma",
  });
  if (!fileBlock) {
    throw new Error(
      "Não consegui ler o arquivo (download ou extração falhou). Verifique o formato — " +
      "aceito PDF, planilha (XLSX/XLS/CSV), Word (.docx), texto e imagem (JPEG/PNG/WebP).",
    );
  }

  const result = await invokeLLM({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          fileBlock,
        ],
      },
    ],
    outputSchema: EXTRACTION_SCHEMA as any,
    // Teto ALTO de saída: uma cotação grande (100+ itens, nomes + specs +
    // NCM) gera dezenas de milhares de tokens de JSON. Com 4096 o retorno
    // era CORTADO no meio — extração corrompida/itens perdidos.
    maxTokens: 32000,
  });

  // Truncamento explícito > corrupção silenciosa: se o modelo parou por
  // limite de tokens, o JSON está incompleto — avisa em vez de perder itens.
  const finishReason = result.choices[0]?.finish_reason;
  if (finishReason === "max_tokens") {
    throw new Error(
      "O documento tem itens demais para uma única extração (o retorno estourou o limite). " +
      "Divida o arquivo em partes (ex.: metade dos itens em cada) e envie novamente.",
    );
  }

  const content = result.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  let parsed: ProformaExtraction;
  try {
    parsed = JSON.parse(text) as ProformaExtraction;
  } catch {
    throw new Error(
      "A extração voltou num formato inválido (possível corte no meio do documento). " +
      "Tente novamente; se persistir, divida o arquivo em partes menores.",
    );
  }
  // Normaliza
  parsed.items = parsed.items || [];
  parsed.currency = parsed.currency || "USD";
  parsed.incoterm = parsed.incoterm || "FOB";
  parsed.supplierSector = normalizeSector(parsed.supplierSector);
  parsed.confidence = typeof parsed.confidence === "number" ? parsed.confidence : 50;
  // O banco guarda quantity/unitPriceCents como INTEIROS; cotações por peso
  // (ex.: 24,5 t de vergalhão) vêm fracionadas e derrubavam o save (invalid_type).
  for (const it of parsed.items) {
    if (typeof it.quantity === "number") it.quantity = Math.max(1, Math.round(it.quantity));
    if (typeof it.unitPriceCents === "number") it.unitPriceCents = Math.round(it.unitPriceCents);
  }

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
    supplierSector?: string;
    currency: string;
    incoterm?: string;
    paymentTerms?: string;
    leadTimeDays?: number;
    moq?: number;
    totalFobCents?: number;
    quotationDate?: string;
    items: ProformaItemInput[];
    fileUrl?: string;
    /** Chave permanente no storage — permite re-assinar a URL a qualquer momento. */
    fileKey?: string;
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

  // Coluna JSON rejeita string vazia ("Invalid JSON text") — normaliza para null.
  const rawExtraction =
    data.rawExtraction == null || data.rawExtraction === "" ? null : data.rawExtraction;

  // A URL pré-assinada é derivável do fileKey (re-assinada no detalhe) — se
  // vier maior que a coluna (1024), grava null em vez de derrubar o INSERT.
  const fileUrl = data.fileUrl && data.fileUrl.length > 1024 ? undefined : data.fileUrl;

  let proformaId: number;
  try {
    proformaId = await db.createProforma({
      userId,
      numero,
      tipo: data.tipo ?? "proforma",
      supplierName: data.supplierName,
      supplierCountry: data.supplierCountry,
      supplierEmail: data.supplierEmail,
      supplierPhone: data.supplierPhone,
      supplierSector: normalizeSector(data.supplierSector),
      currency: data.currency,
      incoterm: data.incoterm ?? "FOB",
      paymentTerms: data.paymentTerms,
      leadTimeDays: data.leadTimeDays,
      moq: data.moq,
      totalFobCents: data.totalFobCents,
      quotationDate: data.quotationDate ? new Date(data.quotationDate) : undefined,
      fileUrl,
      fileKey: data.fileKey,
      fileName: data.fileName,
      documentoId: data.documentoId,
      operacaoId: data.operacaoId,
      rfqId: data.rfqId,
      extractionConfidence: data.extractionConfidence,
      rawExtraction: rawExtraction as any,
      status: data.status ?? (data.extractionConfidence != null ? "extraida" : "rascunho"),
    });
  } catch (e) {
    // Traduz falhas de SCHEMA DRIFT (código novo × banco sem migração) numa
    // mensagem ACIONÁVEL — sem isto o erro do MySQL chega genérico na tela.
    const msg = String((e as Error)?.message ?? e);
    if (/unknown column '?fileKey'?/i.test(msg)) {
      throw new Error(
        "O banco de dados está sem a coluna proformas.fileKey — a migração 0040 não foi aplicada. " +
        "No servidor, rode ./redeploy.sh ou aplique manualmente: " +
        "docker exec -i suppley-mysql mysql -u <usuario> -p<senha> <banco> < drizzle/0040_proforma_file_key_optional_price.sql",
      );
    }
    if (/data too long for column '?fileUrl'?/i.test(msg)) {
      throw new Error(
        "A URL do arquivo excedeu o tamanho da coluna proformas.fileUrl — aplique a migração 0041 " +
        "(drizzle/0041_widen_proforma_file_url.sql) ou rode ./redeploy.sh.",
      );
    }
    throw e;
  }

  for (const item of data.items) {
    // Item sem preço entra com unitPriceCents NULL (sinalizado; não descartado).
    const total = item.unitPriceCents != null ? item.unitPriceCents * item.quantity : null;
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
    supplierSector?: string;
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
    supplierSector: normalizeSector(data.supplierSector),
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
    // Item sem preço entra com unitPriceCents NULL (sinalizado; não descartado).
    const total = item.unitPriceCents != null ? item.unitPriceCents * item.quantity : null;
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
export async function upsertFornecedor(
  userId: number,
  data: { name: string; country: string; email?: string; phone?: string; incoterm?: string; currency?: string; paymentTerms?: string; leadTimeDays?: number; sector?: string }
): Promise<number> {
  const sector = normalizeSector(data.sector);
  const existing = await db.getIndustriesByUser(userId);
  const match = existing.find(
    (i) => i.name.trim().toLowerCase() === data.name.trim().toLowerCase()
  );
  if (match) {
    // Encaminha o setor sugerido só quando o cadastro ainda não tem um definido
    // ("other" = não categorizado). Nunca sobrescreve escolha manual do usuário.
    if (sector && sector !== "other" && (!match.sector || match.sector === "other")) {
      await db.updateIndustry(match.id, userId, { sector } as any);
    }
    return match.id;
  }

  const created = await db.createIndustry({
    userId,
    name: data.name,
    country: data.country || "Desconhecido",
    tipoEntidade: "fornecedor",
    sector: sector ?? "other",
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
 *  - para cada item:
 *    • se produto já existe (mesmo nome + fornecedor): registra em supplierPrices (dedup P8)
 *    • se é novo: cria produto com categorização inferida (P7)
 *  - registra histórico de preços em supplierPrices para rastreamento cronológico
 *  - marca proforma como "distribuida" com timestamp
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
      sector: (proforma as any).supplierSector || undefined,
    });
  } else if (industriaId) {
    // Fornecedor já vinculado: encaminha o setor sugerido se o cadastro ainda
    // estiver sem categoria (mesma regra do upsert — não sobrescreve manual).
    const sugerido = normalizeSector((proforma as any).supplierSector);
    if (sugerido && sugerido !== "other") {
      const ind = await db.getIndustryById(industriaId, userId);
      if (ind && (!ind.sector || ind.sector === "other")) {
        await db.updateIndustry(industriaId, userId, { sector: sugerido } as any);
      }
    }
  }

  // Pré-calcula câmbio para BRL (para registrar em supplierPrices)
  let exchangeRate = 1; // fallback: se não conseguir, usa 1:1
  if (proforma.currency !== "BRL") {
    try {
      const rate = await getExchangeRateAtDate(
        proforma.currency,
        "BRL",
        proforma.quotationDate || new Date(),
      );
      if (rate) exchangeRate = rate;
    } catch {
      /* segue com fallback */
    }
  }

  // 2) Itens → products (Ativos & Insumos) — dedup (P8) + categorização (P7).
  // PERFORMANCE: a sugestão de NCM pode envolver IA e cada item percorria esse
  // caminho EM SÉRIE — o clique em "Distribuir" levava o tempo SOMADO de todos
  // os itens. Itens de nomes distintos agora rodam em paralelo (lotes de 4);
  // itens de MESMO nome ficam no mesmo grupo para não criar produto duplicado.
  type ItemProforma = (typeof items)[number];

  // Item sem preço na cotação: mantém o vínculo do produto, mas não gera
  // registro no histórico de preços (não há preço a registrar).
  const registrarPreco = async (item: ItemProforma, ncm?: string) => {
    if (item.unitPriceCents == null) return;
    try {
      const unitPriceBrlCents = Math.round(item.unitPriceCents * exchangeRate);
      await registerSupplierPrice({
        userId,
        supplierId: industriaId || 0,
        productName: item.productName,
        ncmCode: ncm,
        unitPriceCents: item.unitPriceCents,
        currency: proforma.currency,
        unit: item.unit || "UN",
        unitPriceBrlCents,
        exchangeRate: Math.round(exchangeRate * 1000000), // armazena como rate * 1000000
        quantity: item.quantity || 1,
        incoterm: proforma.incoterm || undefined,
        quotationDate: proforma.quotationDate || undefined,
      });
    } catch (err) {
      console.error(`[proformaService] Falha ao registrar preço de "${item.productName}":`, err);
    }
  };

  /** Processa um item; devolve o productId vinculado (ou null). */
  const processarItem = async (
    item: ItemProforma,
    produtoConhecido: number | null,
  ): Promise<number | null> => {
    let ncm = item.ncmCode || undefined;
    if (!ncm) {
      try {
        // Sugestão inteligente: reutiliza NCM de produtos similares já validados,
        // senão faz busca normal.
        const suggestion = await suggestNCMSmart(item.productName, userId);
        ncm = suggestion?.ncmCode;
      } catch {
        /* segue sem NCM */
      }
    }

    // P8: Verificar se produto já existe (mesmo nome + mesmo fornecedor)
    const existingProduct = produtoConhecido
      ? { id: produtoConhecido }
      : await findProductByNameAndSupplier(userId, item.productName, industriaId ?? undefined);

    if (existingProduct) {
      // Produto já existe: registra em supplierPrices para enriquecer histórico
      await db.updateProformaItem(item.id, { productId: existingProduct.id });

      // Backfill do país de origem se o card ainda não tiver (herda do fornecedor da proforma).
      if (proforma.supplierCountry) {
        try {
          const full = await db.getProductById(existingProduct.id, userId);
          if (full && !full.paisOrigem) {
            await db.updateProduct(existingProduct.id, userId, {
              paisOrigem: proforma.supplierCountry,
            });
          }
        } catch {
          /* backfill best-effort */
        }
      }

      await registrarPreco(item, ncm);
      return existingProduct.id;
    }

    // Produto novo: cria com categorização inferida (P7)
    const categories = await inferCategories(item.productName, userId, ncm);

    const product = await db.createProduct({
      userId,
      name: item.productName,
      description: item.description ?? undefined,
      ncmCode: ncm || "00000000",
      unit: item.unit || "UN",
      supplierId: industriaId ?? undefined,
      origem: "cotado_nao_importado",
      // País de origem do card = país do fornecedor da proforma que o originou.
      paisOrigem: proforma.supplierCountry ?? undefined,
      ncmStatus: ncm ? "validado" : "sugerido",
      custoImportadoRefCents: item.unitPriceCents ?? undefined,
      // P7: Categorização inferida
      classe: categories.classe,
      categoria: categories.categoria,
      subcategoria: categories.subcategoria,
      criticidade: undefined,
      tags: undefined,
      aplicacao: undefined,
      material: undefined,
      dimensoes: undefined,
    });

    if (!product) return null;
    await db.updateProformaItem(item.id, { productId: product.id });
    await registrarPreco(item, ncm);
    return product.id;
  };

  // Agrupa por nome normalizado: dentro do grupo é sequencial (o primeiro cria
  // ou encontra o produto; os demais reutilizam), entre grupos é paralelo.
  const grupos = new Map<string, ItemProforma[]>();
  for (const item of items) {
    const chave = item.productName.trim().toLowerCase().replace(/\s+/g, " ");
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(item);
    else grupos.set(chave, [item]);
  }

  const listaGrupos = Array.from(grupos.values());
  const productIds: number[] = [];
  const CONCORRENCIA = 4;
  for (let i = 0; i < listaGrupos.length; i += CONCORRENCIA) {
    const resultados = await Promise.all(
      listaGrupos.slice(i, i + CONCORRENCIA).map(async (grupo) => {
        const ids: number[] = [];
        let produtoDoGrupo: number | null = null;
        for (const item of grupo) {
          const pid = await processarItem(item, produtoDoGrupo);
          if (pid != null) {
            produtoDoGrupo = pid;
            ids.push(pid);
          }
        }
        return ids;
      }),
    );
    for (const ids of resultados) productIds.push(...ids);
  }

  // 3) Marca proforma como distribuida com timestamp
  await db.updateProforma(proformaId, userId, {
    industriaId: industriaId ?? undefined,
    status: "distribuida" as const,
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

  // Link do arquivo original SEMPRE utilizável: quando há fileKey (chave
  // permanente no storage), re-assina a URL na hora — a fileUrl gravada é
  // pré-assinada e expira em ~1h (link "apodrecia" no detalhe da proforma).
  if (proforma.fileKey) {
    try {
      const { url } = await storageGet(proforma.fileKey, 3600);
      proforma.fileUrl = url;
    } catch {
      /* best-effort: mantém a fileUrl gravada */
    }
  }

  return { proforma, items };
}

// ============================================================
// 5) EXCLUSÃO (com cascata para os produtos vinculados)
// ============================================================

/**
 * Exclui uma proforma e, em cascata, os produtos que ELA originou na base
 * (Ativos & Insumos). O vínculo é o `productId` gravado em cada item na
 * distribuição (P7/P8). Assim, apagar o card da proforma também remove os
 * respectivos produtos — mantendo a base limpa e coesa.
 *
 * Best-effort por produto: se um produto já tiver sido apagado/alterado, o
 * loop segue; a proforma é sempre removida ao final.
 */
export async function deleteProformaWithProducts(
  userId: number,
  proformaId: number,
): Promise<{ deletedProductIds: number[] }> {
  const proforma = await db.getProformaById(proformaId, userId);
  if (!proforma) throw new Error("Proforma não encontrada");

  const items = await db.getProformaItems(proformaId);

  // Coleta os produtos vinculados (dedup — um produto pode aparecer em vários itens)
  const productIds = Array.from(
    new Set(
      items
        .map((it) => it.productId)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  );

  const deletedProductIds: number[] = [];
  for (const productId of productIds) {
    try {
      const ok = await db.deleteProduct(productId, userId);
      if (ok) deletedProductIds.push(productId);
    } catch (err) {
      console.error(`[proformaService] Falha ao excluir produto ${productId}:`, err);
    }
  }

  // Remove a proforma e seus itens
  await db.deleteProforma(proformaId, userId);

  return { deletedProductIds };
}
