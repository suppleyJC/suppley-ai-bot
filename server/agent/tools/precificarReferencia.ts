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
import { montarReferencia, valorPresente, type BaseRef, type ExternoRef } from "../../services/referencePricingService";
import { getLatestExchangeRate, getExchangeRateAtDate } from "../../db/exchangeDb";
import { precosDoAtivo } from "../../db/fase5Db";

const MAX_FORNECEDORES = 4;
const fmtBRL = (n: number | null) =>
  n == null ? "n/d" : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

    // 1) Base própria — TODAS as cotações que casam, a valor presente, para
    //    comparar fornecedores e apontar o mais competitivo. Proformas primeiro
    //    (têm fornecedor/moeda/data); se não houver, cai para os ativos.
    const { ativos, proformas } = await buscarCatalogo({ termo, userId: ctx.userId });
    const ptaxUsd = await getPtaxAtual();

    type Candidato = BaseRef & { brlPresente: number | null };
    const candidatos: Candidato[] = [];

    for (const p of proformas.slice(0, MAX_FORNECEDORES)) {
      const data = p.quotationDate ? new Date(p.quotationDate) : null;
      const moeda = (p.currency || "USD").toUpperCase();
      const cambioNaData = data ? await getExchangeRateAtDate(moeda, "BRL", data) : null;
      const cambioHoje = await cambioMoedaHoje(moeda, ptaxUsd);
      const precoUnit = p.unitPriceCents / 100;
      const { brlPresente } = valorPresente(precoUnit, cambioNaData, cambioHoje);
      candidatos.push({
        fonte: "proforma", produto: p.productName, ncm: p.ncm, fornecedor: p.supplierName,
        moeda, precoUnit, unidade: p.unit || "UN",
        dataCotacao: data ? data.toISOString().slice(0, 10) : null, cambioNaData, brlPresente,
      });
    }
    if (candidatos.length === 0) {
      for (const a of ativos.slice(0, MAX_FORNECEDORES)) {
        const precos = await precosDoAtivo(a.id);
        const ult = precos[0]; // precosDoAtivo ordena por data desc
        const data = ult?.registradoEm ? new Date(ult.registradoEm) : null;
        const moeda = (ult?.moeda || "BRL").toUpperCase();
        const cambioNaData = data ? await getExchangeRateAtDate(moeda, "BRL", data) : null;
        const cambioHoje = await cambioMoedaHoje(moeda, ptaxUsd);
        const precoUnit = (ult?.precoCents ?? a.precoMedioCents ?? 0) / 100;
        const { brlPresente } = valorPresente(precoUnit, cambioNaData, cambioHoje);
        candidatos.push({
          fonte: "ativo", produto: a.nome, ncm: a.ncm, fornecedor: null,
          moeda, precoUnit, unidade: "UN",
          dataCotacao: data ? data.toISOString().slice(0, 10) : null, cambioNaData, brlPresente,
        });
      }
    }

    // Ordena pela mais competitiva (menor valor presente; sem valor vai pro fim).
    candidatos.sort((x, y) => (x.brlPresente ?? Infinity) - (y.brlPresente ?? Infinity));
    const base: BaseRef | null = candidatos[0] ?? null;

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

    // Resumo: bloco da base (mono ou multi-fornecedor) + externo + comparação.
    const partes: string[] = [];
    const comParesValidos = candidatos.filter((c) => c.brlPresente != null);

    if (comParesValidos.length > 1) {
      const linhas = comParesValidos.map((c) =>
        `- ${c.fornecedor || "base interna"}: ${fmtBRL(c.brlPresente)}/${c.unidade} a valor presente ` +
        `(${c.moeda} ${c.precoUnit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/${c.unidade}` +
        `${c.dataCotacao ? `, ${c.dataCotacao}` : ""})`,
      );
      partes.push(
        `Temos ${comParesValidos.length} cotações na base para "${termo}":\n${linhas.join("\n")}\n` +
        `Mais competitiva: ${comParesValidos[0].fornecedor || "base interna"} (${fmtBRL(comParesValidos[0].brlPresente)}/${comParesValidos[0].unidade}).`,
      );
    } else if (ref.base) {
      partes.push(
        `Última cotação na base (${ref.base.fornecedor || "base interna"}): ` +
        `${fmtBRL(ref.base.brlPresente)}/${ref.base.unidade} a valor presente` +
        `${ref.base.dataCotacao ? ` (cotação de ${ref.base.dataCotacao})` : ""}.`,
      );
    }

    // Externo (rótulo sutil só quando global) + comparação competitiva
    if (ref.externo?.disponivel && ref.externo.precoMedioUsdKg != null) {
      const rot = ref.externo.escopo === "global"
        ? "Referência global de mercado"
        : "Média de importação para o Brasil";
      const tendMap: Record<string, string> = { alta: " — preço em ALTA", baixa: " — preço em QUEDA", estavel: " — preço estável" };
      const tend = tendMap[ref.externo.tendenciaPreco ?? ""] ?? "";
      partes.push(
        `${rot}: US$ ${ref.externo.precoMedioUsdKg.toFixed(2)}/kg` +
        `${ref.externo.brlPorKgPresente != null ? ` (~${fmtBRL(ref.externo.brlPorKgPresente)}/kg)` : ""}${tend}.`,
      );
      if (ref.comparavel && ref.maisCompetitivo && ref.diffPct != null) {
        partes.push(
          ref.maisCompetitivo === "base"
            ? `Nossa base está ${Math.abs(ref.diffPct).toFixed(0)}% abaixo da referência — bom preço.`
            : ref.maisCompetitivo === "externo"
            ? `Nossa base está ${Math.abs(ref.diffPct).toFixed(0)}% acima da referência — há espaço para negociar.`
            : "Nossa base está em linha com a referência.",
        );
      }
    }

    return {
      ok: true,
      summary: partes.length ? partes.join("\n") : ref.leitura,
      data: { ...ref, candidatos },
    };
  },
};
