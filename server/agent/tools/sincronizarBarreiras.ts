/**
 * TOOL: sincronizar_barreiras (ESCRITA — base viva de defesa comercial)
 *
 * Atualiza a base estruturada trade_barriers com as medidas VIGENTES para uma
 * NCM: pesquisa as Resoluções GECEX/CAMEX nas fontes oficiais, extrai valor/
 * mecanismo/vigência e grava. A partir daí o cálculo detecta a medida com o
 * VALOR atual (em vez de "valor a confirmar").
 *
 * Use quando: o cálculo evidenciar barreira com valor a confirmar; o usuário
 * pedir para atualizar/confirmar antidumping; ou uma origem nova entrar em
 * análise para NCM sensível.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { sincronizarBarreirasNcm } from "../../services/barreiraSyncService";

const schema = defineSchema(
  "sincronizar_barreiras",
  "Atualiza a BASE VIVA de defesa comercial para uma NCM: pesquisa as Resoluções " +
  "GECEX/CAMEX vigentes (fontes oficiais), extrai tipo/mecanismo/valor/vigência e grava " +
  "na base estruturada — o cálculo passa a evidenciar a medida com o valor ATUAL. Use " +
  "quando o cálculo apontar 'valor a confirmar', quando pedirem para confirmar " +
  "antidumping/salvaguarda de um item, ou ao analisar origem nova em NCM sensível.",
  {
    type: "object",
    properties: {
      ncm: { type: "string", description: "NCM (8 dígitos) a sincronizar." },
      paisOrigem: { type: "string", description: "País de origem em análise (opcional, foca a pesquisa)." },
    },
    required: ["ncm"],
  },
);

export const sincronizarBarreirasTool: AgentTool = {
  name: "sincronizar_barreiras",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const ncm = String(args.ncm ?? "").replace(/\D/g, "");
    if (ncm.length < 4) {
      return { ok: false, summary: "Informe a NCM (ao menos 4 dígitos).", error: "ncm_invalida" };
    }
    const pais = typeof args.paisOrigem === "string" && args.paisOrigem.trim() ? args.paisOrigem.trim() : undefined;

    const r = await sincronizarBarreirasNcm(ncm, pais);

    if (!r.pesquisou) {
      return { ok: false, summary: "Não foi possível pesquisar as fontes oficiais agora.", error: "pesquisa_falhou" };
    }
    if (r.encontradas === 0) {
      return {
        ok: true,
        summary:
          `Nenhuma medida de defesa comercial vigente encontrada para a NCM ${ncm}` +
          (pais ? ` origem ${pais}` : "") +
          " nas fontes oficiais consultadas. Informe isso de forma afirmativa (compliance verificado).",
        data: r,
      };
    }

    const linhas = r.medidas.map((m) => {
      const valor =
        m.valorOriginal != null
          ? m.mecanismo === "ad_valorem"
            ? `${m.valorOriginal}%`
            : `US$ ${m.valorOriginal}${m.mecanismo === "usd_por_ton" ? "/t" : m.mecanismo === "usd_por_kg" ? "/kg" : "/un"}`
          : "valor não localizado";
      return `- ${m.tipo.replace(/_/g, " ").toUpperCase()}${m.paisOrigem ? ` (origem ${m.paisOrigem})` : ""}: ${valor}` +
        (m.baseLegal ? ` · ${m.baseLegal}` : "") +
        (m.vigenciaAte ? ` · vigente até ${m.vigenciaAte}` : "");
    });

    return {
      ok: true,
      summary:
        `Base de barreiras ATUALIZADA para NCM ${ncm}: ${r.encontradas} medida(s) vigente(s) ` +
        `(${r.inseridas} nova(s), ${r.atualizadas} atualizada(s)).\n` +
        linhas.join("\n") +
        "\nEvidencie cada medida na resposta e SOME o impacto ao custo final quando o valor existir " +
        "(o motor não embute antidumping).",
      data: r,
    };
  },
};
