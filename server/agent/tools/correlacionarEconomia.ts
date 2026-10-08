/**
 * TOOL: correlacionar_economia (LEITURA — motor de correlação macro/micro)
 *
 * Correlaciona o CUSTO DE IMPORTAR um produto com as variáveis macro e de
 * MERCADO INTERNO: câmbio (PTAX), commodities (FRED), Selic, IPCA, IGP-M e
 * INCC (custo da construção — termômetro doméstico). Identifica os DRIVERS
 * (o que antecede o quê, com que defasagem e sensibilidade) e lê a janela de
 * competitividade da importação vs o mercado interno.
 *
 * Correlação sobre RETORNOS mensais (co-movimento real, não tendência espúria).
 * GUARDRAIL: correlação ≠ causalidade — leitura de direção para timing.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { getPtaxSerie, getFredSerie, FRED_COMMODITIES, fredDisponivel } from "../../services/marketIntelligenceService";
import { serieMensalPrecoNcm } from "../../services/comexStatService";
import { agregarMensal } from "../../services/previsaoService";
import {
  getSgsSerie, SGS_SERIES, retornosMensais, diferencasMensais, alinhar,
  correlacionarComLag, forcaCorrelacao, type PontoYm,
} from "../../services/correlacaoService";

const schema = defineSchema(
  "correlacionar_economia",
  "MOTOR DE CORRELAÇÃO macro/microeconômica: mede como o custo de importar um NCM " +
  "co-move com câmbio (PTAX), commodities (alumínio, minério, cobre, petróleo), Selic, " +
  "IPCA, IGP-M e INCC (custo da construção — mercado interno), com DEFASAGEM (o que " +
  "antecede o quê) e SENSIBILIDADE (beta). Lê também a janela de competitividade: custo " +
  "importado vs inflação doméstica do setor. Use para 'o que move o preço deste item', " +
  "'importar ou comprar interno', análise de drivers e planejamento de compra. NCM " +
  "opcional (sem NCM, correlaciona o câmbio com o cenário macro).",
  {
    type: "object",
    properties: {
      ncm: { type: "string", description: "NCM (8 dígitos) do produto — opcional." },
      lagMaximoMeses: { type: "number", description: "Defasagem máxima testada em meses (default 3)." },
    },
  },
);

const fmt = (v: number, c = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

interface Driver {
  nome: string;
  r: number;
  lag: number;
  beta: number;
  n: number;
}

function linhaDriver(d: Driver): string {
  const forca = forcaCorrelacao(d.r);
  const dir = d.r > 0 ? "mesma direção" : "direção oposta";
  const lagTxt = d.lag === 0 ? "no mesmo mês" : `antecede em ${d.lag} ${d.lag === 1 ? "mês" : "meses"}`;
  return (
    `- ${d.nome}: correlação ${forca} (r=${fmt(d.r)}), ${dir}, ${lagTxt}` +
    (forca !== "irrelevante" ? ` · sensibilidade: 1% no driver ≈ ${fmt(d.beta)}% no alvo` : "") +
    ` · ${d.n} meses de amostra`
  );
}

export const correlacionarEconomiaTool: AgentTool = {
  name: "correlacionar_economia",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const ncm = String(args.ncm ?? "").replace(/\D/g, "");
    const maxLag = Math.min(6, Math.max(0, Number(args.lagMaximoMeses) || 3));

    // ---- Coleta paralela de todas as séries (cada uma falha graciosa) ----
    const [ptaxDiaria, serieNcm, selic, ipca, igpm, incc, ...fred] = await Promise.all([
      getPtaxSerie(800).catch(() => []),
      ncm.length === 8 ? serieMensalPrecoNcm({ ncm, meses: 30 }).catch(() => []) : Promise.resolve([]),
      getSgsSerie(SGS_SERIES.selicMeta.codigo, 30),
      getSgsSerie(SGS_SERIES.ipca.codigo, 30),
      getSgsSerie(SGS_SERIES.igpm.codigo, 30),
      getSgsSerie(SGS_SERIES.incc.codigo, 30),
      ...(fredDisponivel()
        ? FRED_COMMODITIES.map((c) =>
            getFredSerie(c.id, 30).then((s) => ({ c, s })).catch(() => ({ c, s: [] as { data: string; valor: number }[] })))
        : []),
    ]);

    const cambioMensal: PontoYm[] = agregarMensal(ptaxDiaria as { data: string; valor: number }[]);
    const cambioRet = retornosMensais(cambioMensal);

    // ---- Alvo: retornos do preço do NCM (US$/kg) e do custo em BRL/kg ----
    let alvoNome = "Câmbio USD/BRL";
    let alvoRet: PontoYm[] = cambioRet;
    let custoBrlRet: PontoYm[] = [];
    if (serieNcm.length >= 6) {
      const precoUsd = serieNcm
        .filter((p) => p.precoMedioUsdKg != null)
        .map((p) => ({ t: p.ym, valor: p.precoMedioUsdKg! }));
      if (precoUsd.length >= 6) {
        alvoNome = `Preço de importação NCM ${ncm} (US$/kg)`;
        alvoRet = retornosMensais(precoUsd);
        // custo BRL/kg = US$/kg × câmbio (nos meses comuns)
        const pares = alinhar(precoUsd, cambioMensal);
        custoBrlRet = retornosMensais(pares.map((p) => ({ t: p.t, valor: p.x * p.y })));
      }
    }

    if (alvoRet.length < 6) {
      return {
        ok: false,
        summary: "Séries insuficientes para correlação — use analise_mercado e a pesquisa web, sem expor esta limitação.",
        error: "sem_series",
      };
    }

    // ---- Drivers testados contra o alvo ----
    const candidatos: { nome: string; serie: PontoYm[] }[] = [];
    if (alvoNome !== "Câmbio USD/BRL") candidatos.push({ nome: "Câmbio USD/BRL (retorno mensal)", serie: cambioRet });
    candidatos.push(
      { nome: SGS_SERIES.selicMeta.label + " (variação)", serie: diferencasMensais(selic) },
      { nome: SGS_SERIES.ipca.label, serie: ipca },
      { nome: SGS_SERIES.igpm.label, serie: igpm },
      { nome: SGS_SERIES.incc.label, serie: incc },
    );
    for (const f of fred as { c: { id: string; label: string }; s: { data: string; valor: number }[] }[]) {
      if (f.s.length >= 8) {
        candidatos.push({ nome: `${f.c.label} (retorno mensal, FRED)`, serie: retornosMensais(agregarMensal(f.s)) });
      }
    }

    const drivers: Driver[] = candidatos
      .filter((c) => c.serie.length >= 6)
      .map((c) => {
        const co = correlacionarComLag(c.serie, alvoRet, maxLag);
        return { nome: c.nome, r: co.r, lag: co.lagMeses, beta: co.beta, n: co.nPares };
      })
      .filter((d) => d.n >= 6)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    const linhas: string[] = [];
    linhas.push(`DRIVERS DE ${alvoNome.toUpperCase()} (correlação sobre variações mensais, lag 0–${maxLag}m):`);
    for (const d of drivers.slice(0, 7)) linhas.push(linhaDriver(d));
    const relevantes = drivers.filter((d) => forcaCorrelacao(d.r) !== "irrelevante");
    if (!relevantes.length) {
      linhas.push("(nenhum driver com correlação relevante na amostra — o item se move por fatores próprios/oferta)");
    }

    // ---- MERCADO INTERNO: competitividade da importação vs inflação doméstica ----
    if (custoBrlRet.length >= 6 && incc.length >= 6) {
      const custo12m = custoBrlRet.slice(-12).reduce((s, p) => s + p.valor, 0);
      const incc12m = incc.slice(-12).reduce((s, p) => s + p.valor, 0);
      const igpm12m = igpm.slice(-12).reduce((s, p) => s + p.valor, 0);
      const gap = incc12m - custo12m;
      linhas.push("");
      linhas.push("MERCADO INTERNO × IMPORTADO (12 meses acumulados):");
      linhas.push(`- Custo importado do item (BRL/kg): ${custo12m >= 0 ? "+" : ""}${fmt(custo12m, 1)}%`);
      linhas.push(`- INCC (custo da construção doméstico): +${fmt(incc12m, 1)}% · IGP-M: ${igpm12m >= 0 ? "+" : ""}${fmt(igpm12m, 1)}%`);
      linhas.push(
        gap > 3
          ? `- LEITURA: o custo doméstico subiu ${fmt(gap, 1)} p.p. ACIMA do importado — janela de COMPETITIVIDADE da importação aberta (bom momento para deslocar compra interna → importada).`
          : gap < -3
            ? `- LEITURA: o custo importado subiu ${fmt(Math.abs(gap), 1)} p.p. acima do doméstico — a vantagem da importação estreitou; reforce a negociação de FOB ou reavalie o mix.`
            : "- LEITURA: custos doméstico e importado andando juntos — a decisão fica com câmbio, prazo e capital de giro.",
      );
    }

    linhas.push(
      "\nAPRESENTE: os 2–3 drivers mais fortes com a defasagem em linguagem de decisão " +
      "(ex.: 'o petróleo antecede o custo deste item em ~2 meses — alta recente de X% deve chegar ao preço até MM/AAAA'). " +
      "Correlação não é causalidade: trate como direção provável, e combine com prever_precos para o número projetado.",
    );

    return {
      ok: true,
      summary: linhas.join("\n"),
      data: { alvo: alvoNome, drivers, amostraMeses: alvoRet.length },
    };
  },
};
