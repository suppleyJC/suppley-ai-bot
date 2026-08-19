/**
 * TOOL: classificar_ncm
 *
 * Sugere a classificação fiscal (NCM) de um produto, com alternativas de menor
 * carga tributária e nível de risco. Liga-se ao serviço que JÁ EXISTE:
 *   - ncmService.suggestNCMWithAI (busca no banco + IA, com cache)
 *
 * IMPORTANTE (guardrail): a NCM sugerida é uma RECOMENDAÇÃO para confirmação
 * humana. O cálculo de impostos continua sendo responsabilidade da tool
 * montar_calculo (motor certificado). Esta tool não fecha o cálculo nem
 * substitui a conferência na TEC/TIPI.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as ncmService from "../../services/ncmService";

const schema = defineSchema(
  "classificar_ncm",
  "Sugere a NCM (classificação fiscal) de um produto a partir do nome/descrição, " +
  "com até 2 alternativas e nível de risco. Use quando a pessoa não souber a NCM " +
  "ou pedir para revisar a classificação. A NCM sugerida precisa de confirmação " +
  "humana; o cálculo de impostos é feito depois por montar_calculo.",
  {
    type: "object",
    properties: {
      produto: { type: "string", description: "Nome do produto a classificar" },
      descricao: { type: "string", description: "Descrição/detalhes do produto (opcional, melhora a precisão)" },
      contextoDocumento: {
        type: "string",
        description:
          "A linha COMPLETA do item como consta na proforma/cotação (especificações, " +
          "material, dimensões, uso). SEMPRE passe quando o item vier de um documento — " +
          "o cruzamento nome × descrição do documento decide a NCM correta.",
      },
    },
    required: ["produto"],
  },
);

export const classificarNcmTool: AgentTool = {
  name: "classificar_ncm",
  estagios: ["demand", "analyze"],
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const produto = typeof args.produto === "string" ? args.produto.trim() : "";
    if (!produto) {
      return { ok: false, summary: "Informe o nome do produto para classificar.", error: "produto vazio" };
    }
    const descricao = typeof args.descricao === "string" ? args.descricao : undefined;
    const contextoDocumento =
      typeof args.contextoDocumento === "string" ? args.contextoDocumento : undefined;

    const resultado = await ncmService.suggestNCMWithAI(produto, descricao, contextoDocumento);

    const sug = resultado.suggestedNCM;
    const conf = typeof sug?.confidence === "number" ? `${Math.round(sug.confidence)}%` : "n/d";
    const ii = typeof sug?.iiRate === "number" ? `${(sug.iiRate / 100).toFixed(1)}%` : "n/d";
    const alts = (resultado.alternatives ?? [])
      .map((a) => `${a.ncmCode} (II ${(a.iiRate / 100).toFixed(1)}%)`)
      .slice(0, 2)
      .join(", ");

    return {
      ok: true,
      summary:
        `NCM sugerida: ${sug?.ncmCode ?? "n/d"} — ${sug?.description ?? ""} ` +
        `(confiança ${conf}, II ${ii}, risco ${resultado.riskLevel}). ` +
        (alts ? `Alternativas: ${alts}. ` : "") +
        `Confirme na TEC/TIPI antes de fechar; o cálculo final usa montar_calculo.`,
      data: resultado,
    };
  },
};
