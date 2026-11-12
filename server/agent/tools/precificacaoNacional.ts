/**
 * precificacao_nacional e depreciacao_ativo — cenários NACIONAIS (fora do foco
 * de importação). Dão à Excambia respostas determinísticas quando o usuário
 * lança uma NF de compra nacional e pergunta "por quanto vender p/ lucrar" ou
 * "quanto abato de IRPJ com o ativo imobilizado".
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { precificarNacional, depreciacaoAtivo, type Regime } from "../../services/nacionalPricingService";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const regimeOf = (v: unknown): Regime =>
  v === "lucro_presumido" || v === "simples_nacional" ? v : "lucro_real";

export const precificacaoNacionalTool: AgentTool = {
  name: "precificacao_nacional",
  schema: defineSchema(
    "precificacao_nacional",
    "Precificação de mercadoria/equipamento comprado NO BRASIL (não importado): a " +
      "partir do custo de aquisição líquido (CMV) e do regime, calcula por quanto " +
      "vender para atingir a margem desejada, com os impostos de saída. Use quando o " +
      "usuário lançar uma NF de compra nacional e perguntar preço de venda/lucro. " +
      "O foco do sistema é importação — este é um apoio.",
    {
      type: "object",
      properties: {
        cmvBrl: { type: "number", description: "Custo de aquisição líquido (CMV) em R$ — já sem créditos recuperáveis" },
        regime: { type: "string", enum: ["lucro_real", "lucro_presumido", "simples_nacional"] },
        margemDesejada: { type: "number", description: "Margem líquida desejada (fração, ex.: 0.15 = 15%). Padrão 0.15" },
        icmsVendaPercent: { type: "number", description: "ICMS de saída em % (ex.: 18). Padrão 18" },
        ipiVendaPercent: { type: "number", description: "IPI de saída em % (só industrial/equiparado). Padrão 0" },
        simplesPercent: { type: "number", description: "Alíquota única do Simples em % (só regime Simples). Padrão 10" },
        despesasVendaBrl: { type: "number", description: "Despesas de venda rateadas (frete/comissão) em R$. Padrão 0" },
      },
      required: ["cmvBrl", "regime"],
    },
  ),
  async run(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const cmv = Number(args.cmvBrl);
    if (!Number.isFinite(cmv) || cmv <= 0) {
      return { ok: false, summary: "Informe o CMV (custo de aquisição) em R$.", error: "cmv inválido" };
    }
    try {
      const r = precificarNacional({
        cmvCents: Math.round(cmv * 100),
        regime: regimeOf(args.regime),
        margemDesejada: typeof args.margemDesejada === "number" ? args.margemDesejada : undefined,
        icmsVendaRate: typeof args.icmsVendaPercent === "number" ? args.icmsVendaPercent / 100 : undefined,
        ipiVendaRate: typeof args.ipiVendaPercent === "number" ? args.ipiVendaPercent / 100 : undefined,
        simplesRate: typeof args.simplesPercent === "number" ? args.simplesPercent / 100 : undefined,
        despesasVendaCents: typeof args.despesasVendaBrl === "number" ? Math.round(args.despesasVendaBrl * 100) : undefined,
      });
      const summary =
        `Venda sugerida: ${brl(r.precoVendaCents)} (CMV ${brl(r.cmvCents)}). ` +
        `Impostos de saída: ${brl(r.impostosSaidaCents)} (${(r.cargaSaidaFrac * 100).toFixed(1)}%). ` +
        `Lucro líquido: ${brl(r.margemLiquidaCents)}. Apoio — o foco do sistema é importação.`;
      return { ok: true, summary, data: r };
    } catch (e: any) {
      return { ok: false, summary: e?.message ?? "Falha na precificação nacional.", error: String(e?.message ?? e) };
    }
  },
};

export const depreciacaoAtivoTool: AgentTool = {
  name: "depreciacao_ativo",
  schema: defineSchema(
    "depreciacao_ativo",
    "Estima o abatimento de IRPJ/CSLL via depreciação de ATIVO IMOBILIZADO (bem do " +
      "ativo permanente comprado no Brasil ou importado). A partir do valor do ativo " +
      "e da taxa de depreciação, calcula a depreciação anual e a economia tributária. " +
      "Observação: o abatimento direto só ocorre no Lucro Real. Apoio — foco é importação.",
    {
      type: "object",
      properties: {
        valorAtivoBrl: { type: "number", description: "Valor do ativo imobilizado em R$" },
        regime: { type: "string", enum: ["lucro_real", "lucro_presumido", "simples_nacional"] },
        taxaDepreciacaoAnualPercent: { type: "number", description: "Taxa de depreciação ANUAL em % (ex.: 10 para máquinas). Padrão 10" },
        vidaUtilAnos: { type: "number", description: "Vida útil em anos (alternativa à taxa)" },
        aplicaAdicionalIrpj: { type: "boolean", description: "Se o lucro mensal excede R$ 20 mil (incide adicional de 10% de IRPJ)" },
      },
      required: ["valorAtivoBrl", "regime"],
    },
  ),
  async run(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const valor = Number(args.valorAtivoBrl);
    if (!Number.isFinite(valor) || valor <= 0) {
      return { ok: false, summary: "Informe o valor do ativo em R$.", error: "valor inválido" };
    }
    const r = depreciacaoAtivo({
      valorAtivoCents: Math.round(valor * 100),
      regime: regimeOf(args.regime),
      taxaDepreciacaoAnual: typeof args.taxaDepreciacaoAnualPercent === "number" ? args.taxaDepreciacaoAnualPercent / 100 : undefined,
      vidaUtilAnos: typeof args.vidaUtilAnos === "number" ? args.vidaUtilAnos : undefined,
      aplicaAdicionalIrpj: args.aplicaAdicionalIrpj === true,
    });
    const summary = r.aplicavel
      ? `Depreciação anual ${brl(r.depreciacaoAnualCents)} → economia de IRPJ/CSLL ~${brl(r.economiaAnualCents)}/ano ` +
        `(alíquota ${(r.aliquotaAbatimento * 100).toFixed(0)}%; total ~${brl(r.economiaTotalCents)} na vida útil). ${r.observacao}`
      : r.observacao;
    return { ok: true, summary, data: r };
  },
};
