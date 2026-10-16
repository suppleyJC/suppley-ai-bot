/**
 * TOOL: estatisticas_comex (LEITURA)
 *
 * Consulta o Comex Stat (MDIC/SECEX) — estatísticas OFICIAIS de importação/
 * exportação do Brasil por NCM. Retorna volume, valor FOB, PREÇO MÉDIO em
 * US$/kg, principais países de origem e tendência do preço.
 *
 * Uso típico: benchmark do FOB cotado pelo fornecedor contra o preço médio
 * oficial de importação do país; "quanto o Brasil importa desse NCM"; de onde
 * vem; o preço está subindo ou caindo.
 *
 * GUARDRAIL: apoio à decisão, não cálculo fiscal. Custo definitivo = montar_calculo.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { consultarComexPorNcm, type Fluxo } from "../../services/comexStatService";

const schema = defineSchema(
  "estatisticas_comex",
  "Estatísticas OFICIAIS de comércio exterior (Comex Stat / MDIC-SECEX) de um NCM: " +
  "quanto o Brasil importou/exportou (valor US$ e kg), PREÇO MÉDIO em US$/kg, " +
  "principais países de origem e tendência. Use para fazer benchmark do preço " +
  "cotado pelo fornecedor contra a média oficial de importação, ver de onde o " +
  "Brasil importa e se o preço está subindo. Não é cálculo fiscal.",
  {
    type: "object",
    properties: {
      ncm: { type: "string", description: "Código NCM (8 dígitos; pontos/traços são ignorados)" },
      fluxo: { type: "string", enum: ["import", "export"], description: "Fluxo: importação (padrão) ou exportação" },
    },
    required: ["ncm"],
  },
);

const usd = (n: number) =>
  "US$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const usdKg = (n: number | null) =>
  n == null ? "n/d" : "US$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/kg";
const kg = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kg";

export const estatisticasComexTool: AgentTool = {
  name: "estatisticas_comex",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const ncm = typeof args.ncm === "string" ? args.ncm : String(args.ncm ?? "");
    const fluxo: Fluxo = args.fluxo === "export" ? "export" : "import";
    if (!ncm.replace(/\D/g, "")) {
      return { ok: false, summary: "Informe a NCM para consultar o Comex Stat.", error: "ncm vazio" };
    }

    let resumo;
    try {
      resumo = await consultarComexPorNcm({ ncm, fluxo });
    } catch (e: any) {
      return { ok: false, summary: "Não consegui consultar o Comex Stat agora.", error: String(e?.message ?? e) };
    }

    const rotulo = fluxo === "import" ? "importação" : "exportação";

    if (!resumo.disponivel) {
      return {
        ok: true,
        summary:
          `Comex Stat (MDIC/SECEX) não retornou dados de ${rotulo} para o NCM ${resumo.ncm || ncm} ` +
          `nos últimos 12 meses. Pode ser um NCM sem fluxo no período ou indisponibilidade momentânea da fonte.`,
        data: resumo,
      };
    }

    const tend =
      resumo.tendenciaPreco === "alta" ? `preço médio em ALTA (${resumo.variacaoPrecoPct! >= 0 ? "+" : ""}${resumo.variacaoPrecoPct!.toFixed(1)}% vs ano anterior)`
      : resumo.tendenciaPreco === "baixa" ? `preço médio em BAIXA (${resumo.variacaoPrecoPct!.toFixed(1)}% vs ano anterior)`
      : resumo.tendenciaPreco === "estavel" ? `preço médio estável (${resumo.variacaoPrecoPct! >= 0 ? "+" : ""}${resumo.variacaoPrecoPct!.toFixed(1)}% vs ano anterior)`
      : "tendência indeterminada (sem base do ano anterior)";

    const origens = resumo.topOrigens.length
      ? resumo.topOrigens
          .map((o) => `  - ${o.pais}: ${usd(o.fobUsd)} (${usdKg(o.precoMedioUsdKg)})`)
          .join("\n")
      : "  - (sem detalhamento por país)";

    const summary =
      `Comex Stat (MDIC/SECEX) — ${rotulo} do NCM ${resumo.ncm} (últimos 12 meses):\n` +
      `- Total: ${usd(resumo.totalFobUsd)} FOB · ${kg(resumo.totalKg)}\n` +
      `- Preço médio oficial: ${usdKg(resumo.precoMedioUsdKg)}\n` +
      `- Tendência: ${tend}\n` +
      `- Principais origens:\n${origens}\n` +
      `Use o preço médio US$/kg como benchmark do FOB cotado pelo fornecedor.`;

    return { ok: true, summary, data: resumo };
  },
};
