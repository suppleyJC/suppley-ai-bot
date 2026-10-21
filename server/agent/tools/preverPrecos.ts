/**
 * TOOL: prever_precos (LEITURA — motor preditivo)
 *
 * ANÁLISE PREDITIVA quantitativa: projeta CÂMBIO (PTAX/BCB, série real) e o
 * PREÇO MÉDIO de importação do NCM (Comex Stat mensal, US$/kg) para 1–6 meses,
 * com banda de confiança (~80%), tendência, sazonalidade e volatilidade — e
 * combina os dois vetores no CUSTO BRL/kg projetado (pressão de custo).
 *
 * Matemática: previsaoService (regressão + sazonalidade multiplicativa +
 * banda por erro-padrão). GUARDRAIL: projeção é apoio à decisão (tendência e
 * faixa), não promessa — o modelo deve apresentar como cenário.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { getPtaxSerie } from "../../services/marketIntelligenceService";
import { serieMensalPrecoNcm } from "../../services/comexStatService";
import { analisarEProjetar, agregarMensal, type AnalisePreditiva } from "../../services/previsaoService";

const schema = defineSchema(
  "prever_precos",
  "MOTOR PREDITIVO: projeta o CÂMBIO USD/BRL (PTAX histórica) e o PREÇO MÉDIO de " +
  "importação de um NCM (US$/kg, Comex Stat mensal) para 1–6 meses à frente, com " +
  "tendência, sazonalidade, volatilidade e banda de confiança — e combina os dois no " +
  "CUSTO BRL/kg projetado. Use para: 'o preço vai subir?', 'compro agora ou espero?', " +
  "'como fica o custo em 3 meses?', planejamento de estoque e timing de fechamento de " +
  "câmbio. NCM é opcional (sem NCM, projeta só o câmbio).",
  {
    type: "object",
    properties: {
      ncm: { type: "string", description: "NCM (8 dígitos) do produto — opcional." },
      horizonteMeses: {
        type: "number",
        description: "Meses à frente para projetar (1 a 6; default 3).",
      },
    },
  },
);

const fmt = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function blocoAnalise(titulo: string, unidade: string, a: AnalisePreditiva): string[] {
  const l: string[] = [];
  const seta = a.tendencia === "alta" ? "↑" : a.tendencia === "baixa" ? "↓" : "→";
  l.push(
    `${titulo}: ${fmt(a.ultimo)} ${unidade} · tendência ${a.tendencia.toUpperCase()} ${seta} ` +
    `(${a.inclinacaoPctPorPeriodo >= 0 ? "+" : ""}${fmt(a.inclinacaoPctPorPeriodo, 1)}%/mês, ` +
    `confiança R²=${fmt(a.r2, 2)}) · volatilidade ${fmt(a.volatilidadePct, 1)}%/mês` +
    (a.sazonalidadeAplicada ? " · sazonalidade aplicada" : "") +
    ` · último vs média: ${a.desvioDaMediaPct >= 0 ? "+" : ""}${fmt(a.desvioDaMediaPct, 1)}%`,
  );
  for (const p of a.projecoes) {
    l.push(`  ${p.t}: ${fmt(p.valor)} ${unidade} (faixa ${fmt(p.min)}–${fmt(p.max)})`);
  }
  return l;
}

export const preverPrecosTool: AgentTool = {
  name: "prever_precos",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const horizonte = Math.min(6, Math.max(1, Number(args.horizonteMeses) || 3));
    const ncm = String(args.ncm ?? "").replace(/\D/g, "");

    // Séries em paralelo (cada uma falha graciosa).
    const [ptaxDiaria, serieNcm] = await Promise.all([
      getPtaxSerie(400).catch(() => []),
      ncm.length === 8 ? serieMensalPrecoNcm({ ncm, meses: 30 }).catch(() => []) : Promise.resolve([]),
    ]);

    const linhas: string[] = [];
    let cambio: AnalisePreditiva | null = null;
    let preco: AnalisePreditiva | null = null;

    // 1) Câmbio: diário → médias mensais → projeção.
    const cambioMensal = agregarMensal(
      ptaxDiaria.map((p: { data: string; valor: number }) => ({ data: p.data, valor: p.valor })),
    );
    if (cambioMensal.length >= 4) {
      cambio = analisarEProjetar(cambioMensal, horizonte);
      if (cambio.disponivel) linhas.push(...blocoAnalise("CÂMBIO USD/BRL (PTAX, média mensal)", "R$", cambio));
    }

    // 2) Preço do NCM (US$/kg mensal, oficial).
    if (serieNcm.length >= 4) {
      const seriePreco = serieNcm
        .filter((p) => p.precoMedioUsdKg != null)
        .map((p) => ({ t: p.ym, valor: p.precoMedioUsdKg! }));
      if (seriePreco.length >= 4) {
        preco = analisarEProjetar(seriePreco, horizonte);
        if (preco.disponivel) {
          if (linhas.length) linhas.push("");
          linhas.push(...blocoAnalise(`PREÇO MÉDIO DE IMPORTAÇÃO NCM ${ncm} (oficial)`, "US$/kg", preco));
        }
      }
    }

    if (!cambio?.disponivel && !preco?.disponivel) {
      return {
        ok: false,
        summary: "Séries insuficientes para projeção quantitativa — use analise_mercado (sinais) e a pesquisa web, sem expor esta limitação.",
        error: "sem_series",
      };
    }

    // 3) VETOR COMBINADO: custo BRL/kg projetado (preço × câmbio) vs hoje.
    if (cambio?.disponivel && preco?.disponivel) {
      const hoje = preco.ultimo * cambio.ultimo;
      const alvoP = preco.projecoes[preco.projecoes.length - 1];
      const alvoC = cambio.projecoes[cambio.projecoes.length - 1];
      const proj = alvoP.valor * alvoC.valor;
      const min = alvoP.min * alvoC.min;
      const max = alvoP.max * alvoC.max;
      const deltaPct = hoje > 0 ? ((proj - hoje) / hoje) * 100 : 0;
      linhas.push("");
      linhas.push(
        `CUSTO COMBINADO (preço × câmbio) em BRL/kg: hoje ${fmt(hoje)} → ${alvoP.t}: ${fmt(proj)} ` +
        `(faixa ${fmt(min)}–${fmt(max)}) · pressão de custo ${deltaPct >= 0 ? "+" : ""}${fmt(deltaPct, 1)}%`,
      );
      linhas.push(
        deltaPct > 3
          ? "LEITURA: pressão de ALTA relevante no horizonte — antecipar compra/fechamento de câmbio tende a proteger o custo."
          : deltaPct < -3
            ? "LEITURA: alívio de custo projetado — se o estoque permite, aguardar tende a melhorar o preço."
            : "LEITURA: custo estável no horizonte — decida pelo momento operacional (estoque/lead time), não pelo preço.",
      );
    }

    linhas.push(
      "\nAPRESENTE como CENÁRIO QUANTITATIVO (tendência + faixa), citando as fontes (PTAX/BCB e Comex Stat) " +
      "e o horizonte. Não prometa preço futuro; a faixa é a informação honesta.",
    );

    return {
      ok: true,
      summary: linhas.join("\n"),
      data: { cambio, precoNcm: preco, horizonte },
    };
  },
};
