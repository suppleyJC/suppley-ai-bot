/**
 * TOOL: precificar_referencia
 *
 * O coração do fluxo "quanto custaria importar tal item?":
 *  1) acha o item na NOSSA base por similaridade (Ativos & Insumos + Proformas);
 *  2) traz o último preço cotado a VALOR PRESENTE (câmbio de hoje vs. da cotação);
 *  3) busca a média OFICIAL de importação do NCM (Comex Stat / MDIC-SECEX);
 *  4) compara e indica o mais competitivo — argumento de negociação.
 *
 * Se NÃO houver nada na base, ainda traz o externo (média de importação) para o
 * mesmo formato de apresentação. GUARDRAIL: é referência/apoio à decisão; o custo
 * nacionalizado definitivo sai do motor certificado (montar_calculo).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { buscarCatalogo } from "./agentesFase5";
import { consultarComexPorNcm } from "../../services/comexStatService";
import { consultarComtradeGlobal } from "../../services/comtradeService";
import { getPtaxAtual } from "../../services/marketIntelligenceService";
import { montarReferencia, type BaseRef, type ExternoRef } from "../../services/referencePricingService";
import { getLatestExchangeRate, getExchangeRateAtDate } from "../../db/exchangeDb";
import { precosDoAtivo } from "../../db/fase5Db";

const schema = defineSchema(
  "precificar_referencia",
  "Estima quanto custaria importar um item: acha o produto na nossa base por " +
  "similaridade, traz o ÚLTIMO preço cotado a VALOR PRESENTE (câmbio atual) e " +
  "busca a referência externa em cascata (importação para o Brasil via Comex Stat; " +
  "se não houver, preço médio GLOBAL via UN Comtrade), comparando e indicando o " +
  "mais competitivo. Use quando perguntarem 'quanto custa/custaria importar X', " +
  "'qual o preço de referência', 'temos cotação de Y'. Aceita o termo como a pessoa falou.",
  {
    type: "object",
    properties: {
      termo: { type: "string", description: "Produto como a pessoa descreveu (ex.: 'prego 17x27 cabeça simples')" },
      ncm: { type: "string", description: "NCM (opcional) — se já souber, melhora a busca externa" },
      fluxo: { type: "string", enum: ["import", "export"], description: "Fluxo externo: importação (padrão) ou exportação" },
    },
    required: ["termo"],
  },
);

async function cambioMoedaHoje(moeda: string, ptaxUsd: number | null): Promise<number | null> {
  const m = (moeda || "BRL").toUpperCase();
  if (m === "BRL") return 1;
  if (m === "USD") return ptaxUsd;
  const r = await getLatestExchangeRate(m, "BRL");
  return r?.rate ? Number(r.rate) / 1_000_000 : null;
}

export const precificarReferenciaTool: AgentTool = {
  name: "precificar_referencia",
  schema,
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const termo = typeof args.termo === "string" ? args.termo.trim() : "";
    if (!termo) return { ok: false, summary: "Informe o item para precificar.", error: "termo vazio" };
    const fluxo = args.fluxo === "export" ? "export" : "import";

    // 1) Base própria (proforma preferida — tem moeda+data; senão ativo)
    const { ativos, proformas } = await buscarCatalogo({ termo, userId: ctx.userId });
    const ptaxUsd = await getPtaxAtual();

    let base: BaseRef | null = null;
    if (proformas.length) {
      const p = proformas[0];
      const data = p.quotationDate ? new Date(p.quotationDate) : null;
      base = {
        fonte: "proforma",
        produto: p.productName,
        ncm: p.ncm,
        fornecedor: p.supplierName,
        moeda: (p.currency || "USD").toUpperCase(),
        precoUnit: p.unitPriceCents / 100,
        unidade: p.unit || "UN",
        dataCotacao: data ? data.toISOString().slice(0, 10) : null,
        cambioNaData: data ? await getExchangeRateAtDate((p.currency || "USD").toUpperCase(), "BRL", data) : null,
      };
    } else if (ativos.length) {
      const a = ativos[0];
      const precos = await precosDoAtivo(a.id);
      const ult = precos[0]; // precosDoAtivo ordena por data desc
      const data = ult?.registradoEm ? new Date(ult.registradoEm) : null;
      const moeda = (ult?.moeda || "BRL").toUpperCase();
      base = {
        fonte: "ativo",
        produto: a.nome,
        ncm: a.ncm,
        fornecedor: null,
        moeda,
        precoUnit: (ult?.precoCents ?? a.precoMedioCents ?? 0) / 100,
        unidade: "UN",
        dataCotacao: data ? data.toISOString().slice(0, 10) : null,
        cambioNaData: data ? await getExchangeRateAtDate(moeda, "BRL", data) : null,
      };
    }

    // 2) Externo em cascata: Brasil (Comex Stat) → global (UN Comtrade).
    //    Se nenhum trouxer número, o externo fica indisponível e o prompt
    //    orienta a Excambia a buscar uma faixa de mercado pela web.
    const ncmAlvo = (typeof args.ncm === "string" && args.ncm.replace(/\D/g, "")) || base?.ncm || "";
    let externo: ExternoRef | null = null;
    if (ncmAlvo) {
      const comex = await consultarComexPorNcm({ ncm: ncmAlvo, fluxo });
      if (comex.disponivel) {
        externo = {
          disponivel: true,
          ncm: comex.ncm,
          precoMedioUsdKg: comex.precoMedioUsdKg,
          tendenciaPreco: comex.tendenciaPreco,
          topOrigens: comex.topOrigens.map((o) => ({ pais: o.pais, precoMedioUsdKg: o.precoMedioUsdKg })),
          escopo: "brasil",
        };
      } else {
        // sem importação para o Brasil → preço médio GLOBAL
        const global = await consultarComtradeGlobal({ ncm: ncmAlvo, fluxo });
        if (global.disponivel) {
          externo = {
            disponivel: true,
            ncm: ncmAlvo,
            precoMedioUsdKg: global.precoMedioUsdKg,
            tendenciaPreco: "indef",
            topOrigens: [],
            escopo: "global",
          };
        }
      }
    }

    if (!base && !externo?.disponivel) {
      return {
        ok: true,
        summary:
          `Sem preço na nossa base e sem referência estruturada para "${termo}"${ncmAlvo ? ` (NCM ${ncmAlvo})` : ""}. ` +
          `PRÓXIMO PASSO: traga uma FAIXA DE PREÇO INTERNACIONAL de referência pela pesquisa web (marketplaces B2B, relatórios de mercado), ` +
          `apresente como estimativa de mercado COM a fonte, e ofereça a cotação direta (enviar_rfq) para o número real. ` +
          `Não mencione que a base/Comex não retornou — apenas siga com a estimativa de mercado.`,
        data: { termo, base: null, externo: externo ?? null },
      };
    }

    const cambioHojeMoedaBrl = base ? await cambioMoedaHoje(base.moeda, ptaxUsd) : null;

    const ref = montarReferencia({
      termo,
      base,
      externo,
      cambioHojeUsdBrl: ptaxUsd,
      cambioHojeMoedaBrl,
    });

    return {
      ok: true,
      summary: ref.leitura,
      data: ref,
    };
  },
};
