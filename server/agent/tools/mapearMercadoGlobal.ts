/**
 * TOOL: mapear_mercado_global (LEITURA)
 *
 * MAPA DO MERCADO DE SUPRIMENTO GLOBAL de um produto: quem são os países
 * líderes em exportação, quais mercados estão CRESCENDO (emergentes), a que
 * preço médio exportam (US$/kg) — correlacionado com de onde o BRASIL importa
 * hoje (Comex Stat). É a base para diversificação de origem e detecção de
 * janelas: mercado emergente com preço abaixo do líder = oportunidade.
 *
 * Fontes: UN Comtrade (fluxo mundial, 2 anos fechados) + Comex Stat (origens
 * do Brasil). GUARDRAIL: apoio à decisão, não cálculo fiscal.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { mapearMercadoGlobal } from "../../services/comtradeService";
import { consultarComexPorNcm } from "../../services/comexStatService";

const schema = defineSchema(
  "mapear_mercado_global",
  "Mapeia o MERCADO GLOBAL DE SUPRIMENTO de um produto (por NCM): países líderes em " +
  "exportação, mercados EM CRESCIMENTO (emergentes), preço médio de exportação " +
  "(US$/kg) e share global — correlacionado com as origens atuais das importações " +
  "brasileiras. Use para: 'de onde mais posso importar', 'que mercado está crescendo " +
  "neste produto', diversificação de origem, análise de dependência de um país e " +
  "detecção de origem alternativa mais barata. Requer NCM (use classificar_ncm antes " +
  "se não tiver).",
  {
    type: "object",
    properties: {
      ncm: {
        type: "string",
        description: "NCM (8 dígitos) ou HS6 do produto. Ex: '73084000'.",
      },
      produto: {
        type: "string",
        description: "Nome do produto (para contextualizar a resposta).",
      },
    },
    required: ["ncm"],
  },
);

const usd = (v: number) =>
  v >= 1e9 ? `US$ ${(v / 1e9).toFixed(1)} bi` : v >= 1e6 ? `US$ ${(v / 1e6).toFixed(1)} mi` : `US$ ${Math.round(v / 1e3)} mil`;

export const mapearMercadoGlobalTool: AgentTool = {
  name: "mapear_mercado_global",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const ncm = String(args.ncm ?? "").replace(/\D/g, "");
    if (ncm.length < 6) {
      return { ok: false, summary: "NCM inválida — informe ao menos os 6 primeiros dígitos.", error: "ncm_invalida" };
    }

    // As duas fontes em paralelo; cada uma falha graciosamente.
    const [mapa, brasil] = await Promise.all([
      mapearMercadoGlobal({ ncm }),
      consultarComexPorNcm({ ncm, fluxo: "import" }).catch(() => null),
    ]);

    if (!mapa.disponivel) {
      return {
        ok: false,
        summary:
          "Sem dados estruturados de fluxo global para este HS — siga para a pesquisa web (relatórios de mercado) sem expor esta limitação.",
        error: "sem_dados",
      };
    }

    const linhas: string[] = [];
    linhas.push(
      `MERCADO GLOBAL ${mapa.hs6} (${mapa.anoBase}) — fluxo exportador mundial ${usd(mapa.totalGlobalUsd)}.`,
    );

    linhas.push("\nLÍDERES DE SUPRIMENTO (por valor exportado):");
    for (const p of mapa.lideres.slice(0, 8)) {
      linhas.push(
        `- ${p.pais}: ${usd(p.valorUsd)} (${p.shareGlobalPct.toFixed(1)}% do global)` +
        (p.precoMedioUsdKg != null ? ` · ${p.precoMedioUsdKg.toFixed(2)} US$/kg` : "") +
        (p.crescimentoPct != null ? ` · ${p.crescimentoPct >= 0 ? "+" : ""}${p.crescimentoPct.toFixed(0)}% vs ${mapa.anoComparacao}` : ""),
      );
    }

    if (mapa.emergentes.length) {
      linhas.push("\nMERCADOS EM CRESCIMENTO (emergentes no produto — crescimento com volume relevante):");
      for (const p of mapa.emergentes.slice(0, 6)) {
        linhas.push(
          `- ${p.pais}: +${p.crescimentoPct!.toFixed(0)}% (${usd(p.valorUsd)}, ${p.shareGlobalPct.toFixed(1)}% do global)` +
          (p.precoMedioUsdKg != null ? ` · ${p.precoMedioUsdKg.toFixed(2)} US$/kg` : ""),
        );
      }
    }

    if (brasil?.disponivel && brasil.topOrigens?.length) {
      linhas.push("\nDE ONDE O BRASIL IMPORTA HOJE (Comex Stat, oficial, últimos 12m):");
      for (const o of brasil.topOrigens.slice(0, 5)) {
        const share = brasil.totalFobUsd > 0 ? ` (${((o.fobUsd / brasil.totalFobUsd) * 100).toFixed(1)}%)` : "";
        linhas.push(
          `- ${o.pais}: ${usd(o.fobUsd)}${share}` +
          (o.precoMedioUsdKg != null ? ` · ${o.precoMedioUsdKg.toFixed(2)} US$/kg` : ""),
        );
      }
      if (brasil.tendenciaPreco !== "indef") {
        linhas.push(`Tendência do preço médio de importação BR: ${brasil.tendenciaPreco}${brasil.variacaoPrecoPct != null ? ` (${brasil.variacaoPrecoPct >= 0 ? "+" : ""}${brasil.variacaoPrecoPct.toFixed(1)}%)` : ""}.`);
      }
    }

    linhas.push(
      "\nLEITURA (use na resposta): cruze os três blocos — origem atual do Brasil vs líderes vs emergentes. " +
      "Emergente com US$/kg ABAIXO do líder e do preço de referência = candidato a RFQ de diversificação. " +
      "Concentração alta numa única origem = risco a apontar.",
    );

    return {
      ok: true,
      summary: linhas.join("\n"),
      data: { mapa, origensBrasil: brasil?.topOrigens ?? [] },
    };
  },
};
