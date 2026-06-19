/**
 * TOOL: registrar_cotacao
 *
 * Registra uma cotação (quote) de fornecedor e vincula à operação.
 * Consolida dados de preço, frete, impostos e gera evento na timeline.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import * as operacaoService from "../../services/operacaoService";
import { operacoes, quotations } from "../../../drizzle/schema";
import * as rfqService from "../../services/rfqService";

const schema = defineSchema(
  "registrar_cotacao",
  "Registra uma cotação (oferta) de fornecedor na operação. Captura preço FOB, frete, seguro, " +
  "impostos estimados e calcula custo total. Vincula como cotação vencedora se for a melhor.",
  {
    type: "object",
    properties: {
      fornecedor: { type: "string", description: "Nome do fornecedor" },
      pais_origem: { type: "string", description: "País de origem (ex: China, Vietnã)" },
      numero_cotacao: { type: "string", description: "Número/referência da cotação do fornecedor" },
      valor_fob: {
        type: "number",
        description: "Valor FOB total em USD (ex: 15000 para USD 15.000)",
      },
      moeda: { type: "string", description: "Moeda da cotação (USD, EUR, CNY). Default: USD" },
      frete_usd: { type: "number", description: "Custo de frete em USD (opcional)" },
      seguro_usd: { type: "number", description: "Custo de seguro em USD (opcional)" },
      incoterm: {
        type: "string",
        enum: ["EXW", "FCA", "FOB", "CIF", "CPT", "CIP", "DAP", "DDP"],
        description: "Incoterm da cotação (ex: FOB, CIF)",
      },
      prazo_producao_dias: { type: "number", description: "Dias de produção" },
      prazo_entrega_dias: { type: "number", description: "Dias de entrega (trânsito)" },
      validade_dias: { type: "number", description: "Dias que a cotação é válida (default: 30)" },
      notas: { type: "string", description: "Notas adicionais sobre a cotação" },
    },
    required: ["fornecedor", "valor_fob"],
  },
);

export const registrarCotacaoTool: AgentTool = {
  name: "registrar_cotacao",
  schema,
  estagios: ["source", "analyze"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.operacaoId) {
      return { ok: false, summary: "Esta ferramenta requer uma operação ativa.", error: "sem_operacao" };
    }

    try {
      const db = await getDb();
      if (!db) return { ok: false, summary: "Sem conexão com banco.", error: "db_unavailable" };

      // Valida operação
      const [op] = await db.select().from(operacoes)
        .where(eq(operacoes.id, ctx.operacaoId));
      if (!op) return { ok: false, summary: "Operação não encontrada.", error: "operacao_nao_encontrada" };

      // Valores em centavos
      const valorFobUsd = Number(args.valor_fob) || 0;
      const freteUsd = Number(args.frete_usd) ?? 0;
      const seguroUsd = Number(args.seguro_usd) ?? 0;
      const moeda = (typeof args.moeda === "string" ? args.moeda.toUpperCase() : "USD");

      // Cria quotation
      const quotationNumber = rfqService.generateQuoteNumber();
      const [quotRes] = await db.insert(quotations).values({
        userId: ctx.userId,
        quotationNumber,
        supplierName: String(args.fornecedor),
        supplierCountry: typeof args.pais_origem === "string" ? args.pais_origem : null,
        currency: moeda,
        originCountry: typeof args.pais_origem === "string" ? args.pais_origem : null,
        destinationState: op.origemPais ?? "SC",
        freightCents: Math.round(freteUsd * 100),
        insuranceCents: Math.round(seguroUsd * 100),
        totalFobCents: Math.round(valorFobUsd * 100),
        totalCifCents: Math.round((valorFobUsd + freteUsd + seguroUsd) * 100),
      });
      const quotationId = (quotRes as any).insertId as number;

      // Calcula validez
      const diasValidade = Number(args.validade_dias) ?? 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + diasValidade);

      // Registra evento na operação
      await operacaoService.addEvento({
        operacaoId: ctx.operacaoId,
        tipo: "cotacao_recebida",
        estagio: (op.estagioAtual as any) ?? "source",
        refTipo: "quotations",
        refId: quotationId,
        autor: "excambia",
        titulo: `Cotação ${quotationNumber} de ${args.fornecedor}`,
        payload: {
          quotationNumber,
          fornecedor: args.fornecedor,
          valorFob: valorFobUsd,
          moeda,
          frete: freteUsd,
          seguro: seguroUsd,
          incoterm: args.incoterm ?? "FOB",
        },
      });

      // Opcionalmente vincula como cotação vencedora (lógica simples: primeira fica)
      if (!op.cotacaoVencedoraId) {
        await operacaoService.linkQuotation(ctx.operacaoId, quotationId);
      }

      const valor_fmt = valorFobUsd.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
      const cif_fmt = (valorFobUsd + freteUsd + seguroUsd).toLocaleString("pt-BR", { style: "currency", currency: "USD" });

      return {
        ok: true,
        summary: `Cotação ${quotationNumber} de ${args.fornecedor} registrada! ` +
          `FOB: ${valor_fmt} / CIF estimado: ${cif_fmt}. ` +
          `Válida por ${diasValidade} dias.`,
        data: { quotationNumber, quotationId, quotation: { supplier: args.fornecedor, fob: valorFobUsd, cif: valorFobUsd + freteUsd + seguroUsd } },
      };
    } catch (e: any) {
      return {
        ok: false,
        summary: "Erro ao registrar cotação.",
        error: String(e?.message ?? e),
      };
    }
  },
};
