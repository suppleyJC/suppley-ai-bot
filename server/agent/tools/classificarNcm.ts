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
      paisOrigem: {
        type: "string",
        description: "País de origem da mercadoria (ex.: China). Usado na conferência oficial da alíquota (TTCE), que considera acordos.",
      },
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

const pct = (bp: number) => `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Alíquotas com a FONTE explícita — o modelo repete o que está aqui, nunca um valor próprio. */
function descreverAliquotas(s?: ncmService.NCMSuggestion): string {
  if (!s) return "n/d";
  if (s.aliquotaFonte === "nao_confirmada") {
    return "alíquotas NÃO CONFIRMADAS — o código não está na tabela oficial da base; diga isso e não apresente II";
  }
  const taxas = `II ${pct(s.iiRate)}, IPI ${pct(s.ipiRate)}`;
  if (s.aliquotaFonte === "ttce") {
    const divergiu = s.iiTabelaLocal != null
      ? `; a tabela local tinha II ${pct(s.iiTabelaLocal)} — DESATUALIZADA, avise a pessoa que vale o oficial`
      : "";
    return `${taxas} (fonte oficial: ${s.aliquotaOrigem}${divergiu})`;
  }
  if (s.aliquotaFonte === "estimada") {
    return `${taxas} — II ESTIMADO por capítulo, não consta na TEC carregada; confirmar na TEC antes de fechar`;
  }
  return `${taxas} (fonte: tabela oficial${s.aliquotaOrigem ? ` — ${s.aliquotaOrigem}` : ""})`;
}

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

    // Cópia: o resultado da IA fica em cache e a conferência oficial é por consulta.
    const resultado = structuredClone(await ncmService.suggestNCMWithAI(produto, descricao, contextoDocumento));
    const paisOrigem = typeof args.paisOrigem === "string" ? args.paisOrigem : undefined;
    await Promise.all(
      [resultado.suggestedNCM, ...(resultado.alternatives ?? []).slice(0, 2)]
        .filter(Boolean)
        .map((s) => ncmService.conferirNaFonteOficial(s, paisOrigem)),
    );

    const sug = resultado.suggestedNCM;
    const conf = typeof sug?.confidence === "number" ? `${Math.round(sug.confidence)}%` : "n/d";
    const alts = (resultado.alternatives ?? [])
      .slice(0, 2)
      .map((a) => `${a.ncmCode} (${descreverAliquotas(a)})`)
      .join(", ");

    return {
      ok: true,
      summary:
        `NCM sugerida: ${sug?.ncmCode ?? "n/d"} — ${sug?.description ?? ""} ` +
        `(confiança ${conf}, risco ${resultado.riskLevel}). ` +
        `Alíquotas: ${descreverAliquotas(sug)}. ` +
        (alts ? `Alternativas: ${alts}. ` : "") +
        `REGRA: apresente EXATAMENTE estas alíquotas e a fonte entre parênteses; não informe ` +
        `nenhuma outra alíquota para estes códigos. A base legal é raciocínio do classificador — ` +
        `não cite número de Solução de Consulta, parecer ou ato como fato (nenhum foi consultado). ` +
        `O cálculo final usa montar_calculo.`,
      data: resultado,
    };
  },
};
