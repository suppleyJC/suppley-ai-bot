/**
 * Registry BASE de ferramentas da Excambia (camada de capacidades "folha").
 *
 * Contém apenas as tools de capacidade direta (cálculo, NCM, RFQ, financeiro…).
 * NÃO importa os especialistas — assim os especialistas podem importar este
 * módulo para executar tools sem criar import circular
 * (specialists → registry, e index → specialists + registry).
 *
 * Helpers genéricos (schemasFor/schemasByName/runFrom) operam sobre QUALQUER
 * lista de tools, para serem reaproveitados tanto pela Excambia (todas as tools)
 * quanto por cada especialista (seu subconjunto).
 */
import type { AgentTool, ToolContext, ToolResult } from "./types";
import type { Tool } from "../../_core/llm";

import { montarCalculoTool } from "./montarCalculo";
import { gerarRelatorioTool } from "./gerarRelatorio";
import { classificarNcmTool } from "./classificarNcm";
import { compararCotacoesTool } from "./compararCotacoes";
import { enviarRfqTool } from "./enviarRfq";
import { registrarCotacaoTool } from "./registrarCotacao";
import { registrarMarcoProducaoTool } from "./registrarMarcoProducao";
import { registrarNacionalizacaoTool } from "./registrarNacionalizacao";
import { lancarFinanceiroTool } from "./lancarFinanceiroTool";
import { buscarAtivoTool, compararOrigemTool, benchmarkMercadoTool } from "./fase5Tools";
import { coletarDadosFaltantesTool } from "./coletar_dados_faltantes";
import { consultarOperacaoTool } from "./consultarOperacao";
import { analiseMercadoTool } from "./analiseMercado";
import { estatisticasComexTool } from "./estatisticasComex";
import { precificarReferenciaTool } from "./precificarReferencia";
import { registrarMemoriaTool } from "./registrarMemoria";
import { registrarResultadoOperacaoTool } from "./registrarResultadoOperacao";
import { qualidadeDadosTool } from "./qualidadeDados";
import { catalogarDocumentoTool } from "./catalogarDocumento";
import { compararRotasImportacaoTool } from "./compararRotasImportacao";
import { calcularCubagemTool } from "./calcularCubagem";
import { precificacaoNacionalTool, depreciacaoAtivoTool } from "./precificacaoNacional";

/** Tools de capacidade direta — o "chão de fábrica" que os especialistas acionam. */
export const BASE_TOOLS: AgentTool[] = [
  montarCalculoTool,
  gerarRelatorioTool,
  classificarNcmTool,
  compararCotacoesTool,
  enviarRfqTool,
  registrarCotacaoTool,
  registrarMarcoProducaoTool,
  registrarNacionalizacaoTool,
  lancarFinanceiroTool,
  // Completude — detecta gaps e coleta dados
  coletarDadosFaltantesTool,
  // Consulta de andamento da operação (leitura) — base da jornada no chat
  consultarOperacaoTool,
  // Inteligência de mercado (BCB câmbio + FRED commodities) → insights de decisão
  analiseMercadoTool,
  // Estatísticas oficiais de comércio exterior por NCM (Comex Stat / MDIC-SECEX)
  estatisticasComexTool,
  // Preço de referência: base própria a valor presente × média oficial → competitivo
  precificarReferenciaTool,
  // Memória persistente — a Excambia grava aprendizados duráveis do usuário/empresa
  registrarMemoriaTool,
  // Fechamento do ciclo — resultado real da operação (previsto × realizado + rating)
  registrarResultadoOperacaoTool,
  // Qualidade de dados — auditoria da base (duplicatas, campos ausentes, inconsistências)
  qualidadeDadosTool,
  // Catalogação via chat — cotação/catálogo anexado vira dado na base
  catalogarDocumentoTool,
  // Estratégia interestadual — compara importar direto vs. via estado-hub com benefício
  compararRotasImportacaoTool,
  // Cubagem — quantas unidades cabem em 20'/40'/40HC (volume + peso)
  calcularCubagemTool,
  // Apoio a cenários nacionais (fora do foco): precificação/CMV e depreciação de ativo
  precificacaoNacionalTool,
  depreciacaoAtivoTool,
  // Fase 5 — buscas (lado leitura do ciclo de inteligência)
  buscarAtivoTool,
  compararOrigemTool,
  benchmarkMercadoTool,
];

/** Schemas das tools aplicáveis a um estágio (ou todas, se estagio undefined). */
export function schemasFor(tools: AgentTool[], estagio?: string): Tool[] {
  return tools
    .filter((t) => !estagio || !t.estagios || t.estagios.includes(estagio))
    .map((t) => t.schema);
}

/** Schemas de um subconjunto de tools escolhido por nome (usado pelos especialistas). */
export function schemasByName(tools: AgentTool[], names: string[]): Tool[] {
  const wanted = new Set(names);
  return tools.filter((t) => wanted.has(t.name)).map((t) => t.schema);
}

/** Executa uma tool pelo nome dentro de uma lista, com tratamento de erro padronizado. */
export async function runFrom(
  tools: AgentTool[],
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { ok: false, summary: `Ferramenta "${name}" não encontrada.`, error: "tool_inexistente" };
  }
  if (tool.estagios && ctx.estagio && !tool.estagios.includes(ctx.estagio)) {
    return {
      ok: false,
      summary: `A ferramenta "${name}" não se aplica ao estágio atual.`,
      error: "estagio_invalido",
    };
  }
  try {
    return await tool.run(args, ctx);
  } catch (e: any) {
    return { ok: false, summary: "Erro ao executar a ferramenta.", error: String(e?.message ?? e) };
  }
}
