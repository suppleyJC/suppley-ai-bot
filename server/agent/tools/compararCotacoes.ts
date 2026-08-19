/**
 * TOOL: comparar_cotacoes
 *
 * Compara os preços dos fornecedores já cadastrados para um produto, devolvendo
 * o ranking (melhor preço, diferença para o melhor) e estatísticas. Liga-se ao
 * serviço que JÁ EXISTE:
 *   - priceComparisonService.compareProductPrices(userId, produto)
 *
 * Usa o histórico do próprio usuário (últimos 90 dias). Não inventa preços:
 * se não houver cotações cadastradas, avisa para registrar/enviar RFQ antes.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as priceComparisonService from "../../services/priceComparisonService";

const schema = defineSchema(
  "comparar_cotacoes",
  "Compara os preços dos fornecedores cadastrados para um produto (últimos 90 " +
  "dias), retornando ranking e estatísticas. Use quando a pessoa quiser saber " +
  "qual fornecedor está mais barato ou avaliar dispersão de preços.",
  {
    type: "object",
    properties: {
      produto: { type: "string", description: "Nome do produto a comparar entre fornecedores" },
    },
    required: ["produto"],
  },
);

const brl = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const compararCotacoesTool: AgentTool = {
  name: "comparar_cotacoes",
  estagios: ["source", "analyze"],
  schema,
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const produto = typeof args.produto === "string" ? args.produto.trim() : "";
    if (!produto) {
      return { ok: false, summary: "Informe o produto para comparar.", error: "produto vazio" };
    }

    const resultado = await priceComparisonService.compareProductPrices(ctx.userId, produto);

    if (!resultado.suppliers || resultado.suppliers.length === 0) {
      return {
        ok: true,
        summary:
          `Ainda não há cotações cadastradas para "${produto}" nos últimos 90 dias. ` +
          `Registre preços de fornecedores ou envie uma RFQ antes de comparar.`,
        data: resultado,
      };
    }

    const best = resultado.suppliers.find((s) => s.isBestPrice) ?? resultado.suppliers[0];
    const stats = resultado.statistics;

    return {
      ok: true,
      summary:
        `${stats.totalSuppliers} fornecedor(es) para "${produto}". ` +
        `Melhor preço: ${best.supplierName} (${best.country}) a ${brl(best.latestPriceBrlCents)}. ` +
        `Faixa ${brl(stats.minPrice)}–${brl(stats.maxPrice)}, média ${brl(stats.avgPrice)}.`,
      data: resultado,
    };
  },
};
