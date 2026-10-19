/**
 * TOOL: dimensionar_mercado (LEITURA)
 *
 * A consulta PARAMETRIZADA do Comex Stat — o que dimensiona um mercado de
 * importação com número oficial e auditável:
 *   1. importação brasileira total por ANO (toneladas e US$);
 *   2. decomposição por PAÍS de origem (ranking, com países fixados);
 *   3. decomposição por UF de desembaraço (onde o fluxo entra de fato);
 *   4. PREÇO MÉDIO por tonelada, por origem.
 *
 * Diferente de estatisticas_comex (janela fixa de 12 meses, 1 NCM, top-5 países,
 * US$/kg), aqui o recorte é livre: várias NCMs somadas, vários anos, corte por
 * país E por UF, ranking completo com a posição de qualquer país pedido.
 *
 * ACEITA CÓDIGO PARCIAL: "7317" (posição SH4) ou "7317.00" (subposição SH6) são
 * expandidos para todas as NCMs de 8 dígitos sob eles. Um mercado real — pregos,
 * arames — não vive numa NCM só, e o Comex Stat só filtra por 8 dígitos.
 *
 * GUARDRAIL: é INTELIGÊNCIA de mercado, não cálculo fiscal. Se a fonte oficial
 * não responder, a tool diz isso — número de mercado NUNCA é estimado.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { dimensionarMercadoComex, type MercadoLinha, type Fluxo } from "../../services/comexStatService";
import { expandNcmPrefixes } from "../../services/ncmService";
import { consultarComtradeBrasil, type MercadoComtradeBrasil } from "../../services/comtradeService";

const schema = defineSchema(
  "dimensionar_mercado",
  "DIMENSIONA UM MERCADO de importação/exportação com dados OFICIAIS do Comex " +
  "Stat (MDIC/SECEX), em consulta parametrizada: total por ANO (toneladas e US$), " +
  "decomposição por PAÍS de origem, decomposição por UF de desembaraço e PREÇO " +
  "MÉDIO por tonelada por origem. Aceita VÁRIAS NCMs somadas e códigos PARCIAIS " +
  "(SH4 '7317' ou SH6 '7317.00' são expandidos automaticamente). Use para " +
  "'qual o tamanho do mercado de X', 'quanto o Brasil importa de X', 'quanto vem " +
  "da China e quanto do Paraguai', 'por onde entra', 'preço médio por origem', " +
  "série de vários anos. Para benchmark rápido de um NCM único em 12 meses, use " +
  "estatisticas_comex.",
  {
    type: "object",
    properties: {
      ncms: {
        type: "array",
        items: { type: "string" },
        description:
          "Códigos NCM que compõem o mercado. Aceita 8 dígitos, SH6 ('7317.00') ou " +
          "SH4 ('7217'). Some aqui TODAS as posições do mercado analisado — ex.: " +
          "pregos e arames = ['7317', '7217', '7313'].",
      },
      anos: {
        type: "array",
        items: { type: "number" },
        description: "Anos a consultar, ex.: [2024, 2025]. O ano corrente volta parcial e rotulado.",
      },
      fluxo: {
        type: "string",
        enum: ["import", "export"],
        description: "Importação (padrão) ou exportação.",
      },
      paisesDestaque: {
        type: "array",
        items: { type: "string" },
        description:
          "Países que DEVEM aparecer no ranking mesmo fora do top N, com a posição real " +
          "que ocupam. Ex.: ['China', 'Paraguai'].",
      },
      ufsDestaque: {
        type: "array",
        items: { type: "string" },
        description: "UFs que devem aparecer no ranking mesmo fora do top N. Ex.: ['Santa Catarina'].",
      },
      topN: { type: "number", description: "Tamanho do ranking (padrão 10, máx. 30)." },
    },
    required: ["ncms", "anos"],
  },
);

const usd = (n: number) => "US$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const ton = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: n < 100 ? 1 : 0 }) + " t";
const usdT = (n: number | null) =>
  n == null ? "n/d" : "US$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "/t";
const pct = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const sinal = (n: number) => (n >= 0 ? "+" : "") + pct(n);

/** Tabela markdown de um ranking (país ou UF) — o formato que vai para o chat. */
function tabela(titulo: string, rotulo: string, linhas: MercadoLinha[], total: number): string {
  if (!linhas.length) return `${titulo}: sem detalhamento na fonte.`;
  const corpo = linhas
    .map(
      (l) =>
        `| ${l.posicao} | ${l.chave} | ${ton(l.toneladas)} | ${usd(l.fobUsd)} | ` +
        `${pct(l.sharePct)} | ${usdT(l.precoMedioUsdT)} |`,
    )
    .join("\n");
  return (
    `${titulo} (${total} ${rotulo.toLowerCase()}s no total):\n` +
    `| # | ${rotulo} | Volume | Valor FOB | Share | Preço médio |\n` +
    `|---|---|---|---|---|---|\n${corpo}`
  );
}

export const dimensionarMercadoTool: AgentTool = {
  name: "dimensionar_mercado",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const brutos = Array.isArray(args.ncms)
      ? (args.ncms as unknown[]).map((n) => String(n ?? "")).filter(Boolean)
      : [];
    if (!brutos.length) {
      return { ok: false, summary: "Informe ao menos uma NCM para dimensionar o mercado.", error: "ncms vazio" };
    }

    const anos = Array.isArray(args.anos)
      ? (args.anos as unknown[]).map((a) => Number(a)).filter((a) => Number.isFinite(a) && a > 2000)
      : [];
    if (!anos.length) {
      return { ok: false, summary: "Informe os anos a dimensionar (ex.: 2024 e 2025).", error: "anos vazio" };
    }

    // Expande SH4/SH6 → NCMs de 8 dígitos (o Comex Stat só filtra por 8).
    const { ncms, naoEncontrados } = await expandNcmPrefixes(brutos);
    if (!ncms.length) {
      return {
        ok: false,
        summary:
          `Não consegui resolver ${brutos.join(", ")} em NCMs de 8 dígitos na base de classificação. ` +
          `Informe as NCMs completas para eu consultar a fonte oficial.`,
        error: "ncm_nao_expandida",
      };
    }

    const fluxo: Fluxo = args.fluxo === "export" ? "export" : "import";
    const paisesDestaque = Array.isArray(args.paisesDestaque)
      ? (args.paisesDestaque as unknown[]).map((p) => String(p ?? "")).filter(Boolean)
      : [];
    const ufsDestaque = Array.isArray(args.ufsDestaque)
      ? (args.ufsDestaque as unknown[]).map((u) => String(u ?? "")).filter(Boolean)
      : [];
    const topN = Number.isFinite(Number(args.topN)) ? Number(args.topN) : 10;

    let dados;
    try {
      dados = await dimensionarMercadoComex({
        ncms, anos, fluxo, paisesDestaque, ufsDestaque, topN,
      });
    } catch (e: any) {
      return {
        ok: false,
        summary: "Não consegui consultar o Comex Stat agora.",
        error: String(e?.message ?? e),
      };
    }

    // Comex Stat não conseguiu CONSULTAR (429/rede) — não é ausência de fluxo.
    // A resposta não pode parar aqui: cai para o Comtrade, Brasil como
    // declarante, e depois para pesquisa web com fonte citada.
    if (!dados.disponivel && dados.erro) {
      return await alternativaAoComex(ncms, anos, fluxo, topN, dados.erro);
    }

    if (!dados.disponivel) {
      // A fonte RESPONDEU e não há fluxo: isso é um resultado, não uma falha.
      return {
        ok: false,
        summary:
          `O Comex Stat não registra ${fluxo === "import" ? "importação" : "exportação"} brasileira ` +
          `para ${ncms.length} NCM(s) nos anos ${anos.join(", ")}. Apresente isso como resultado ` +
          `(mercado inexistente ou incipiente no Brasil — oportunidade ou sinal de barreira) e confira ` +
          `se a classificação está correta antes de concluir.`,
        error: dados.erro ?? "fonte_indisponivel",
        data: dados,
      };
    }

    const rotuloFluxo = fluxo === "import" ? "Importação brasileira" : "Exportação brasileira";
    const partes: string[] = [
      `Comex Stat (MDIC/SECEX) — ${rotuloFluxo}, NCMs ${ncms.join(", ")}.`,
    ];
    if (naoEncontrados.length) {
      partes.push(`(Sem correspondência na base de classificação: ${naoEncontrados.join(", ")}.)`);
    }

    // 1. Total por ano
    const linhasAno = dados.anos
      .map((a) => {
        const marca = a.parcial ? ` (parcial — ${a.mesesCobertos} meses)` : "";
        return `| ${a.ano}${marca} | ${ton(a.toneladas)} | ${usd(a.fobUsd)} | ${usdT(a.precoMedioUsdT)} |`;
      })
      .join("\n");
    partes.push(
      `1) TOTAL POR ANO\n` +
      `| Ano | Volume | Valor FOB | Preço médio |\n|---|---|---|---|\n${linhasAno}`,
    );

    if (dados.variacaoFobPct != null && dados.baseComparacao) {
      partes.push(
        `Variação ${dados.baseComparacao.de} → ${dados.baseComparacao.para}: ` +
        `${sinal(dados.variacaoFobPct)} em valor` +
        (dados.variacaoVolumePct != null ? ` e ${sinal(dados.variacaoVolumePct)} em volume.` : "."),
      );
    } else if (dados.anos.some((a) => a.parcial)) {
      partes.push(
        `Sem variação ano a ano: um dos anos está parcial — comparar cobertura diferente ` +
        `induziria a erro. Compare o mesmo número de meses ao apresentar.`,
      );
    }

    // 2, 3 e 4 — por ano, o corte por país (que já traz o preço por tonelada) e por UF
    for (const a of dados.anos) {
      const marca = a.parcial ? ` — PARCIAL, ${a.mesesCobertos} meses` : "";
      partes.push(
        `2/4) POR PAÍS DE ORIGEM — ${a.ano}${marca}\n` +
        tabela("Ranking por valor FOB, com preço médio por tonelada", "País", a.porPais, a.totalPaises),
      );
      partes.push(
        `3) POR UF DE DESEMBARAÇO — ${a.ano}${marca}\n` +
        tabela("Ranking por valor FOB", "UF", a.porUf, a.totalUfs),
      );
    }

    partes.push(
      `Apresente as quatro tabelas com estes números exatos. A UF é de DESEMBARAÇO ` +
      `(onde a carga foi nacionalizada), não de consumo — um estado com share muito ` +
      `acima da sua demanda interna é hub de nacionalização, e isso é a leitura, não o dado.`,
    );

    return { ok: true, summary: partes.join("\n\n"), data: dados };
  },
};


/**
 * Caminho alternativo quando o Comex Stat não responde. Sempre termina numa
 * resposta: Comtrade (Brasil como declarante, SH6) ou, se também falhar,
 * pesquisa web com fonte citada — nunca número sem fonte.
 */
async function alternativaAoComex(
  ncms: string[],
  anos: number[],
  fluxo: Fluxo,
  topN: number,
  motivo: string,
): Promise<ToolResult> {
  // NCMs que compartilham o SH6 viram uma consulta só; limite de 2 para não
  // repetir no Comtrade o leque que estrangulou o Comex Stat.
  const hs6s = Array.from(new Set(ncms.map((n) => n.replace(/\D/g, "").slice(0, 6)))).slice(0, 2);
  const mercados: MercadoComtradeBrasil[] = [];
  for (const hs6 of hs6s) {
    mercados.push(await consultarComtradeBrasil({ ncm: hs6, anos, fluxo, topN }));
  }
  const comDado = mercados.filter((m) => m.disponivel);

  if (!comDado.length) {
    return {
      ok: true,
      summary:
        `A base oficial do Comex Stat está momentaneamente indisponível e o UN Comtrade não retornou ` +
        `dados para o SH6 ${hs6s.join(", ")}. ENTREGUE UMA RESPOSTA mesmo assim: use a pesquisa web para ` +
        `trazer referências de mercado (relatórios setoriais, associações, notícias de comércio exterior), ` +
        `CITE cada fonte e rotule os números como estimativa de mercado externa. Nunca apresente número ` +
        `sem fonte. Ofereça refazer a consulta oficial mais tarde para confirmar.`,
      data: { motivo, mercados },
    };
  }

  const rotulo = fluxo === "import" ? "Importação brasileira" : "Exportação brasileira";
  const partes: string[] = [
    `${rotulo} — fonte: UN Comtrade (declaração oficial do Brasil à ONU). ` +
    `Usada porque o Comex Stat está momentaneamente indisponível.`,
  ];
  for (const m of comDado) {
    partes.push(`\nSH6 ${m.hs6}:`);
    for (const a of m.anos) {
      partes.push(`- ${a.ano}: ${usd(a.valorUsd)} · ${ton(a.kg / 1000)} · preço médio ${usdT(a.precoMedioUsdKg != null ? a.precoMedioUsdKg * 1000 : null)}`);
      if (a.topOrigens.length) {
        partes.push(
          "  Principais origens: " +
          a.topOrigens.slice(0, 5)
            .map((o) => `${o.pais} ${o.participacaoPct.toFixed(0)}%`)
            .join(", "),
        );
      }
    }
    if (m.anosSemDado.length) partes.push(`  (sem dado no Comtrade para ${m.anosSemDado.join(", ")})`);
  }
  partes.push(
    `\nAPRESENTAÇÃO: entregue a análise normalmente com estes números. Mencione de forma natural, uma vez, ` +
    `que o recorte é por SH6 (agrupa produtos da mesma subposição) e sem corte por UF. ` +
    `Não trate como falha nem peça desculpas.`,
  );

  return {
    ok: true,
    summary: partes.join("\n"),
    data: { motivo, fonteAlternativa: "comtrade", mercados: comDado },
  };
}
