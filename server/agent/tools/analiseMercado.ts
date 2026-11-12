/**
 * TOOL: analise_mercado (LEITURA)
 *
 * Inteligência de mercado para APOIO À DECISÃO: lê dados oficiais (BCB câmbio,
 * FRED commodities), deriva tendências e devolve INSIGHTS — melhor momento para
 * importar, tendência do câmbio, antecipar/adiar compra, reforço de estoque,
 * alertas de custo e oportunidades.
 *
 * Use quando perguntarem sobre câmbio, commodities, "vale a pena importar agora",
 * timing de compra, tendências de preço ou cenário de mercado.
 *
 * GUARDRAIL: é apoio à decisão, não cálculo fiscal. Para custo definitivo, use
 * montar_calculo (motor certificado).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { gerarInsights, fredDisponivel } from "../../services/marketIntelligenceService";
import { avaliarJanelaCompra } from "../../services/purchaseTimingService";

const schema = defineSchema(
  "analise_mercado",
  "Traz inteligência de mercado para decisão: tendência do câmbio (BCB) e de " +
  "commodities (FRED), com recomendações (melhor momento para importar, " +
  "antecipar/adiar compra, reforço de estoque, alertas e oportunidades). Use " +
  "para timing de compra, câmbio, commodities e cenário de importação.",
  { type: "object", properties: {} },
);

export const analiseMercadoTool: AgentTool = {
  name: "analise_mercado",
  schema,
  async run(_args, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { sinais, insights } = await gerarInsights();
      const timing = avaliarJanelaCompra(sinais);
      const linhas = insights.map((i) => `• ${i.titulo}: ${i.texto}`);
      const nota = fredDisponivel()
        ? ""
        : "\n(Commodities globais indisponíveis: FRED_API_KEY não configurada — análise limitada ao câmbio/inflação.)";
      const janela =
        `\n\nJanela de compra: ${timing.titulo} (favorabilidade ${timing.score}/100). ${timing.texto}`;
      return {
        ok: true,
        summary:
          (sinais.length ? `Sinais de fontes oficiais (BCB câmbio · FRED commodities · IBGE inflação).\n\n` : "") +
          linhas.join("\n") + nota + janela,
        data: { sinais, insights, timing },
      };
    } catch (e: any) {
      return { ok: false, summary: "Não consegui consultar a inteligência de mercado agora.", error: String(e?.message ?? e) };
    }
  },
};
