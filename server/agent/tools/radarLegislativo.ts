/**
 * TOOL: radar_legislativo (LEITURA — mudanças normativas de comércio exterior)
 *
 * Varredura SOB DEMANDA das mudanças recentes na legislação de comex: DOU
 * (in.gov.br), Resoluções GECEX/CAMEX, INs e Portarias da RFB, Portarias
 * SECEX, decretos da reforma tributária. Retorna as normas com data, número,
 * o que mudou e impacto prático — com fonte.
 *
 * Sob demanda (sem alertas proativos, por decisão de produto): use quando o
 * usuário perguntar "o que mudou", "alguma novidade na legislação", ou antes
 * de fechar operação sensível a mudança regulatória recente.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { invokeLLM, MODELS } from "../../_core/llm";

const schema = defineSchema(
  "radar_legislativo",
  "RADAR de mudanças na legislação de comércio exterior: varre DOU, Resoluções " +
  "GECEX/CAMEX, INs/Portarias RFB e SECEX dos últimos dias e devolve o que mudou " +
  "(norma, data, resumo e impacto prático), com fontes. Use quando perguntarem 'o que " +
  "mudou na legislação', 'alguma resolução nova', novidades de antidumping/ex-tarifário/" +
  "reforma, ou antes de fechar operação sensível a mudança regulatória. Aceita foco por " +
  "tema ou NCM.",
  {
    type: "object",
    properties: {
      tema: {
        type: "string",
        description: "Foco opcional: 'antidumping', 'ex-tarifário', 'reforma tributária', 'ICMS', 'DUIMP', ou um produto/setor.",
      },
      ncm: { type: "string", description: "NCM (opcional) para focar a varredura." },
      dias: { type: "number", description: "Janela em dias (default 30, máx 90)." },
    },
  },
);

export const radarLegislativoTool: AgentTool = {
  name: "radar_legislativo",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const dias = Math.min(90, Math.max(7, Number(args.dias) || 30));
    const tema = typeof args.tema === "string" && args.tema.trim() ? args.tema.trim() : null;
    const ncm = String(args.ncm ?? "").replace(/\D/g, "");

    const foco = [
      tema ? `com foco em "${tema}"` : null,
      ncm.length >= 4 ? `afetando a NCM ${ncm} (e sua posição)` : null,
    ].filter(Boolean).join(", ");

    try {
      const r = await invokeLLM({
        model: MODELS.balanced,
        maxTokens: 4000,
        webSearch: true,
        webSearchMaxUses: 6,
        messages: [
          {
            role: "system",
            content:
              "Você é o radar legislativo de comércio exterior brasileiro. Pesquise APENAS fontes " +
              "oficiais (in.gov.br/DOU, gov.br/camex — Resoluções GECEX, gov.br/receitafederal — " +
              "INs e Portarias, gov.br/siscomex — Notícias Siscomex, gov.br/mdic — SECEX). " +
              "Liste as mudanças NORMATIVAS do período: para cada uma, dê NORMA (tipo, número/ano), " +
              "DATA de publicação, O QUE MUDOU (1-2 frases objetivas) e IMPACTO PRÁTICO para " +
              "importadores (1 frase). Ordene da mais recente para a mais antiga. Se nada relevante " +
              "mudou no período, diga isso claramente. Sempre cite a fonte.",
          },
          {
            role: "user",
            content:
              `Quais mudanças na legislação de comércio exterior (importação) foram publicadas nos ` +
              `últimos ${dias} dias${foco ? `, ${foco}` : ""}? ` +
              `Inclua: Resoluções GECEX/CAMEX (alíquotas, ex-tarifário, antidumping), INs/Portarias ` +
              `RFB (despacho, DUIMP, valoração), Portarias SECEX (licenciamento, drawback) e ` +
              `regulamentação da reforma tributária (IBS/CBS) que afete importação.`,
          },
        ],
      });

      const texto = typeof r.choices?.[0]?.message?.content === "string" ? r.choices[0].message.content : "";
      if (!texto.trim()) {
        return { ok: false, summary: "A varredura não retornou conteúdo — tente novamente.", error: "vazio" };
      }

      return {
        ok: true,
        summary:
          `RADAR LEGISLATIVO (últimos ${dias} dias${foco ? `, ${foco}` : ""}):\n\n${texto}\n\n` +
          "APRESENTE como boletim organizado (norma → o que mudou → impacto), citando fonte e data. " +
          "Se alguma mudança afetar NCM/operação em andamento do usuário, destaque isso em primeiro lugar " +
          "e ofereça sincronizar_barreiras/simular_reforma_tributaria conforme o caso.",
        data: { dias, tema, ncm: ncm || null },
      };
    } catch (e) {
      return { ok: false, summary: "Falha na varredura legislativa.", error: String(e) };
    }
  },
};
