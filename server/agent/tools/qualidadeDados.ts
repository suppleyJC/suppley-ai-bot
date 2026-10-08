/**
 * TOOL: qualidade_dados — Agente de Qualidade de Dados (Fase 5).
 *
 * Roda a varredura de saúde da base (dataQualityService) e devolve um
 * relatório acionável: duplicidades, campos ausentes e inconsistências.
 * Leitura pura — nada é alterado; a correção é decidida pelo usuário
 * (a Excambia pode executar item a item com as tools de escrita).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { analisarQualidadeDados } from "../../services/dataQualityService";

const MAX_LINHAS_POR_SECAO = 8;

const schema = defineSchema(
  "qualidade_dados",
  "Faz uma AUDITORIA de qualidade da base: fornecedores/ativos duplicados, campos ausentes " +
  "(país, setor, NCM, classe, criticidade, contato, preço do portfólio), NCMs divergentes para " +
  "o mesmo produto, preços de catálogo desatualizados e proformas paradas sem distribuir. " +
  "Use quando pedirem para 'revisar a base', 'achar duplicados', 'o que falta preencher', " +
  "ou antes de análises que dependem da base estar íntegra. Leitura pura — não altera nada.",
  { type: "object", properties: {} },
);

export const qualidadeDadosTool: AgentTool = {
  name: "qualidade_dados",
  schema,
  async run(_args, ctx: ToolContext): Promise<ToolResult> {
    const r = await analisarQualidadeDados(ctx.userId);

    if (r.totais.problemas === 0) {
      return {
        ok: true,
        summary:
          `Base saudável: nenhum problema encontrado. ` +
          `(${r.totais.fornecedores} fornecedores, ${r.totais.ativos} ativos, ` +
          `${r.totais.itensPortfolio} itens de portfólio, ${r.totais.proformas} proformas verificados.)`,
        data: r,
      };
    }

    const partes: string[] = [
      `Auditoria da base — ${r.totais.problemas} ponto(s) de atenção ` +
      `(${r.totais.fornecedores} fornecedores, ${r.totais.ativos} ativos, ` +
      `${r.totais.itensPortfolio} itens de portfólio, ${r.totais.proformas} proformas).`,
    ];

    if (r.duplicatas.length) {
      const linhas = r.duplicatas.slice(0, MAX_LINHAS_POR_SECAO).map((d) =>
        `- ${d.tipo === "fornecedor" ? "Fornecedor" : "Ativo"}: "${d.nomeA}" (#${d.idA}) ≈ "${d.nomeB}" (#${d.idB}) — similaridade ${Math.round(d.similaridade * 100)}%`,
      );
      const resto = r.duplicatas.length - MAX_LINHAS_POR_SECAO;
      partes.push(`PROVÁVEIS DUPLICATAS (${r.duplicatas.length}):\n${linhas.join("\n")}${resto > 0 ? `\n(+${resto} outras)` : ""}`);
    }

    if (r.incompletos.length) {
      const linhas = r.incompletos.slice(0, MAX_LINHAS_POR_SECAO).map((c) =>
        `- ${c.entidade === "fornecedor" ? "Fornecedor" : c.entidade === "ativo" ? "Ativo" : "Portfólio"} "${c.nome}" (#${c.id}): ${c.problemas.join("; ")}`,
      );
      const resto = r.incompletos.length - MAX_LINHAS_POR_SECAO;
      partes.push(`CADASTROS INCOMPLETOS (${r.incompletos.length}):\n${linhas.join("\n")}${resto > 0 ? `\n(+${resto} outros)` : ""}`);
    }

    if (r.inconsistencias.length) {
      const linhas = r.inconsistencias.slice(0, MAX_LINHAS_POR_SECAO).map((i) => `- ${i.descricao}`);
      const resto = r.inconsistencias.length - MAX_LINHAS_POR_SECAO;
      partes.push(`INCONSISTÊNCIAS (${r.inconsistencias.length}):\n${linhas.join("\n")}${resto > 0 ? `\n(+${resto} outras)` : ""}`);
    }

    partes.push(
      "Sugira as correções mais impactantes primeiro (duplicatas de fornecedor e NCMs divergentes), " +
      "e ofereça corrigir item a item com o usuário.",
    );

    return { ok: true, summary: partes.join("\n\n"), data: r };
  },
};
