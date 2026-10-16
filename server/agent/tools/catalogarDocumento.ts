/**
 * TOOL: catalogar_documento — encaminha para a BASE os dados de um arquivo
 * recebido no CHAT (cotação/proforma ou catálogo de fornecedor).
 *
 * Fecha o ciclo "chat → base": a pessoa manda o arquivo para conversar/calcular
 * e a Excambia cataloga fornecedor + preços sem exigir que ela passe pelo
 * ambiente Proforma.
 *
 *   tipo="cotacao"  → cria a proforma e DISTRIBUI para a base
 *                     (fornecedor → industries · itens/preços → products +
 *                     histórico supplierPrices) — mesmo pipeline do ambiente
 *                     Proforma, com dedup de fornecedor e de produto.
 *   tipo="catalogo" → upsert do fornecedor + itens no PORTFÓLIO declarado do
 *                     card (industry_products), consultável pelo buscar_ativo.
 *
 * Também devolve a VALIDADE TEMPORAL da cotação (≤90 dias = atual → pode virar
 * operação de cotação; >90 dias = referência para cálculo/estudo).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import {
  createProforma,
  distributeProformaToBase,
  upsertFornecedor,
  SUPPLIER_SECTORS,
  type ProformaItemInput,
} from "../../services/proformaService";
import { getProformasByUser } from "../../db/proformaDb";
import {
  getProductsByIndustry,
  createIndustryProduct,
  updateIndustryProduct,
} from "../../db/industriesDb";
import { normalizeForSearch } from "../../services/productSimilarity";
import { COTACAO_VALIDADE_DIAS } from "./fase5Tools";

interface ItemArg {
  productName: string;
  description?: string;
  productNameOriginal?: string;
  sku?: string;
  ncmCode?: string;
  quantity?: number;
  unit?: string;
  unitPriceCents?: number;
  moq?: number;
}

const schema = defineSchema(
  "catalogar_documento",
  "ENCAMINHA PARA A BASE os dados de um arquivo recebido no chat. Use SEMPRE que a pessoa " +
  "enviar uma COTAÇÃO/PROFORMA/INVOICE (tipo='cotacao') ou um CATÁLOGO de fornecedor " +
  "(tipo='catalogo') em anexo: leia o documento, extraia os dados e chame esta tool para " +
  "gravar fornecedor + produtos + preços. Cotação vira proforma distribuída (histórico de " +
  "preços); catálogo vira portfólio declarado no card do fornecedor. A tool deduplica " +
  "fornecedor e produtos — pode chamar sem medo de duplicar. Preços SEMPRE em CENTAVOS. " +
  "IMPORTANTE: liste TODOS os itens do documento, SEM EXCEÇÃO — inclusive os sem preço " +
  "(entram sinalizados na base). Se o documento tem 27 linhas, envie 27 itens; NUNCA " +
  "selecione 'os principais' por conta própria.",
  {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["cotacao", "catalogo"], description: "cotacao = proforma/invoice com preços cotados; catalogo = portfólio de produtos do fornecedor" },
      supplierName: { type: "string", description: "Nome do fornecedor/fabricante" },
      supplierCountry: { type: "string", description: "País do fornecedor" },
      supplierEmail: { type: "string" },
      supplierPhone: { type: "string" },
      supplierSector: {
        type: "string",
        enum: [...SUPPLIER_SECTORS],
        description: "Setor deduzido do fornecedor/produtos (ex.: fitas adesivas → packaging; aço → metals)",
      },
      currency: { type: "string", description: "Moeda ISO (USD, EUR, CNY...). Padrão USD" },
      incoterm: { type: "string", description: "FOB, CIF, EXW... (cotação)" },
      paymentTerms: { type: "string" },
      leadTimeDays: { type: "number" },
      moq: { type: "number", description: "MOQ geral do documento, se houver" },
      quotationDate: { type: "string", description: "Data do documento em YYYY-MM-DD (importante para a validade temporal)" },
      items: {
        type: "array",
        description: "Itens do documento",
        items: {
          type: "object",
          properties: {
            productName: { type: "string", description: "Nome comercial curto em PT-BR identificando a variante (tamanho/material/acabamento)" },
            description: { type: "string", description: "Ficha técnica completa em PT-BR" },
            productNameOriginal: { type: "string", description: "Nome exatamente como no documento" },
            sku: { type: "string", description: "SKU/código do fornecedor, se houver" },
            ncmCode: { type: "string", description: "NCM apenas se explícita no documento" },
            quantity: { type: "number", description: "Quantidade cotada (cotação). Padrão 1" },
            unit: { type: "string", description: "UN, KG, PCS... Padrão UN" },
            unitPriceCents: { type: "number", description: "Preço unitário em CENTAVOS da moeda (12.50 → 1250). Omita se o catálogo não traz preço" },
            moq: { type: "number", description: "MOQ do item, se houver" },
          },
          required: ["productName"],
        },
      },
    },
    required: ["tipo", "supplierName", "items"],
  },
);

function parseDate(s: unknown): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Orientação temporal que volta para o modelo conduzir a conversa. */
function orientacaoTemporal(quotationDate: Date | null): string {
  if (!quotationDate) {
    return "VALIDADE: o documento não tem data confirmada — pergunte de quando é a cotação antes de propor converter em operação.";
  }
  const dias = Math.floor((Date.now() - quotationDate.getTime()) / 86_400_000);
  if (dias <= COTACAO_VALIDADE_DIAS) {
    return `VALIDADE: cotação ATUAL (${dias} dia(s)). Após o cálculo, ofereça converter em OPERAÇÃO de cotação (o preço ainda vale como proposta formal).`;
  }
  const meses = Math.floor(dias / 30);
  return `VALIDADE: cotação ANTIGA (${meses} ${meses === 1 ? "mês" : "meses"} — acima de 3 meses). Use APENAS como referência de cálculo/estudo: avise que os preços podem estar defasados e ofereça disparar uma RFQ (enviar_rfq) para atualizar o preço antes de virar operação.`;
}

export const catalogarDocumentoTool: AgentTool = {
  name: "catalogar_documento",
  schema,
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const tipo = args.tipo === "catalogo" ? "catalogo" : "cotacao";
    const supplierName = typeof args.supplierName === "string" ? args.supplierName.trim() : "";
    const itensArg = Array.isArray(args.items) ? (args.items as ItemArg[]) : [];
    if (!supplierName) return { ok: false, summary: "Informe o nome do fornecedor.", error: "fornecedor vazio" };
    if (itensArg.length === 0) return { ok: false, summary: "Nenhum item para catalogar.", error: "itens vazios" };

    const currency = (typeof args.currency === "string" && args.currency.trim() ? args.currency.trim().toUpperCase() : "USD").slice(0, 3);
    const quotationDate = parseDate(args.quotationDate);
    const orientacao = orientacaoTemporal(quotationDate);

    // ============================ COTAÇÃO ============================
    if (tipo === "cotacao") {
      // Dedup: mesma cotação já catalogada (fornecedor + data + nº de itens).
      const existentes = await getProformasByUser(ctx.userId);
      const jaExiste = existentes.find((p) => {
        const mesmoFornecedor = (p.supplierName ?? "").trim().toLowerCase() === supplierName.toLowerCase();
        if (!mesmoFornecedor) return false;
        if (!quotationDate || !p.quotationDate) return false;
        return Math.abs(new Date(p.quotationDate).getTime() - quotationDate.getTime()) < 86_400_000;
      });
      if (jaExiste) {
        return {
          ok: true,
          summary:
            `Esta cotação já está catalogada na base (proforma ${jaExiste.numero ?? `#${jaExiste.id}`}, status ${jaExiste.status}) — nada foi duplicado.\n${orientacao}`,
          data: { proformaId: jaExiste.id, numero: jaExiste.numero, duplicada: true },
        };
      }

      // NUNCA descarta item: quem não tem preço entra com unitPriceCents NULL
      // (sinalizado na base; fora do histórico de preços). Antes, itens sem
      // preço eram filtrados em silêncio e a cotação "perdia" linhas.
      const items: ProformaItemInput[] = itensArg
        .filter((i) => i.productName)
        .map((i) => ({
          productName: String(i.productName).slice(0, 1000),
          description: i.description ? String(i.description) : undefined,
          productNameOriginal: i.productNameOriginal ? String(i.productNameOriginal) : undefined,
          ncmCode: i.ncmCode ? String(i.ncmCode) : undefined,
          quantity: typeof i.quantity === "number" && i.quantity > 0 ? i.quantity : 1,
          unit: i.unit ? String(i.unit) : "UN",
          unitPriceCents:
            typeof i.unitPriceCents === "number" && i.unitPriceCents > 0
              ? Math.round(i.unitPriceCents)
              : null,
        }));
      const comPreco = items.filter((i) => i.unitPriceCents != null).length;
      const semPreco = items.length - comPreco;
      if (comPreco === 0) {
        return {
          ok: false,
          summary: "Nenhum item tem preço — para catálogo sem preços, chame novamente com tipo='catalogo'.",
          error: "cotacao sem precos",
        };
      }

      const totalFobCents = items.reduce(
        (s, i) => s + (i.unitPriceCents ?? 0) * i.quantity,
        0,
      );
      const { id, numero } = await createProforma(ctx.userId, {
        supplierName,
        supplierCountry: typeof args.supplierCountry === "string" ? args.supplierCountry : undefined,
        supplierEmail: typeof args.supplierEmail === "string" ? args.supplierEmail : undefined,
        supplierPhone: typeof args.supplierPhone === "string" ? args.supplierPhone : undefined,
        supplierSector: typeof args.supplierSector === "string" ? args.supplierSector : undefined,
        currency,
        incoterm: typeof args.incoterm === "string" ? args.incoterm : undefined,
        paymentTerms: typeof args.paymentTerms === "string" ? args.paymentTerms : undefined,
        leadTimeDays: typeof args.leadTimeDays === "number" ? args.leadTimeDays : undefined,
        moq: typeof args.moq === "number" ? args.moq : undefined,
        totalFobCents,
        quotationDate: quotationDate ? quotationDate.toISOString().slice(0, 10) : undefined,
        items,
        operacaoId: ctx.operacaoId,
        // VÍNCULO DO ARQUIVO: o anexo do turno (chave permanente no storage)
        // fica gravado na proforma — o documento original é recuperável e a
        // URL é re-assinada a qualquer momento (nada de link que expira).
        fileKey: ctx.anexo?.fileKey,
        fileName: ctx.anexo?.name,
        extractionConfidence: 85, // extraída pela Excambia no chat
        status: "revisada",
      });
      const dist = await distributeProformaToBase(ctx.userId, id);

      return {
        ok: true,
        summary:
          `Cotação catalogada na base: proforma ${numero} de ${supplierName} com ${items.length} item(ns) — ` +
          `${comPreco} com preço${semPreco > 0 ? `, ${semPreco} SEM preço (entraram sinalizados; sem histórico de preço)` : ""} ` +
          `(fornecedor e histórico de preços atualizados).` +
          `${ctx.anexo ? ` Arquivo original "${ctx.anexo.name}" vinculado à proforma.` : ""}\n` +
          `${orientacao}\n` +
          `Informe à pessoa, em uma linha, que os dados foram catalogados (proforma ${numero}), citando quantos itens têm preço.`,
        data: {
          proformaId: id,
          numero,
          industriaId: dist.industriaId,
          productIds: dist.productIds,
          itensCatalogados: items.length,
          itensComPreco: comPreco,
          itensSemPreco: semPreco,
          arquivoVinculado: ctx.anexo?.name ?? null,
          quotationDate: quotationDate?.toISOString().slice(0, 10) ?? null,
        },
      };
    }

    // ============================ CATÁLOGO ============================
    const industriaId = await upsertFornecedor(ctx.userId, {
      name: supplierName,
      country: typeof args.supplierCountry === "string" ? args.supplierCountry : "Desconhecido",
      email: typeof args.supplierEmail === "string" ? args.supplierEmail : undefined,
      phone: typeof args.supplierPhone === "string" ? args.supplierPhone : undefined,
      currency,
      leadTimeDays: typeof args.leadTimeDays === "number" ? args.leadTimeDays : undefined,
      sector: typeof args.supplierSector === "string" ? args.supplierSector : undefined,
    });

    const existentes = await getProductsByIndustry(industriaId, ctx.userId);
    const porSku = new Map(existentes.filter((p) => p.sku).map((p) => [String(p.sku).toLowerCase(), p]));
    const porNome = new Map(existentes.map((p) => [normalizeForSearch(p.name), p]));

    let criados = 0;
    let atualizados = 0;
    for (const item of itensArg) {
      if (!item.productName) continue;
      const preco = typeof item.unitPriceCents === "number" && item.unitPriceCents > 0
        ? Math.round(item.unitPriceCents)
        : undefined;

      const match =
        (item.sku ? porSku.get(String(item.sku).toLowerCase()) : undefined) ??
        porNome.get(normalizeForSearch(item.productName));

      if (match) {
        // Já está no portfólio: atualiza preço/dados quando o documento traz algo novo.
        await updateIndustryProduct(match.id, ctx.userId, {
          ...(preco != null ? { priceFob: preco, currency, lastQuotedAt: quotationDate ?? new Date() } : {}),
          ...(item.description ? { specifications: String(item.description) } : {}),
          ...(item.ncmCode ? { ncmCode: String(item.ncmCode) } : {}),
          ...(typeof item.moq === "number" ? { moq: item.moq } : {}),
          isActive: true,
        });
        atualizados++;
      } else {
        await createIndustryProduct({
          industryId: industriaId,
          userId: ctx.userId,
          name: String(item.productName).slice(0, 255),
          description: item.description ? String(item.description) : undefined,
          sku: item.sku ? String(item.sku).slice(0, 100) : undefined,
          ncmCode: item.ncmCode ? String(item.ncmCode).slice(0, 10) : undefined,
          unit: item.unit ? String(item.unit).slice(0, 20) : "UN",
          priceFob: preco,
          currency,
          moq: typeof item.moq === "number" ? item.moq : undefined,
          leadTimeDays: typeof args.leadTimeDays === "number" ? args.leadTimeDays : undefined,
          lastQuotedAt: preco != null ? (quotationDate ?? new Date()) : undefined,
          isActive: true,
        });
        criados++;
      }
    }

    return {
      ok: true,
      summary:
        `Catálogo de ${supplierName} catalogado no card do fornecedor: ${criados} produto(s) novo(s), ` +
        `${atualizados} atualizado(s). Esses itens agora aparecem no buscar_ativo (portfólio declarado) ` +
        `e permitem direcionar demandas futuras a este fornecedor.\n` +
        `Informe à pessoa, em uma linha, que o catálogo foi gravado no card do fornecedor.`,
      data: { industriaId, criados, atualizados, totalItens: itensArg.length },
    };
  },
};
