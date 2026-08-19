/**
 * TOOL: consultar_operacao (LEITURA)
 *
 * Devolve o ANDAMENTO de uma operação para a Excambia narrar a jornada no chat:
 * estágio atual, status, marcos, documentos (anexos) e resumo financeiro.
 * Quando não há operação no contexto, lista as operações ativas do usuário.
 *
 * Fecha o gap "a Excambia responde sobre o status das minhas operações" — é a
 * base da jornada-no-chat (cards de marco).
 *
 * Read-only: não grava nada. Liga em operacaoService.getOperacao/listOperacoes.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as operacaoService from "../../services/operacaoService";
import { STAGE_LABEL_PT, MARCO_LABEL_PT } from "../../services/operacaoService";

// Vocabulário ÚNICO Painel ↔ Excambia — mesmos rótulos de estágio e marco
// exibidos no Painel de Operações (stageLabels.ts / OperacaoMarcos.tsx).
const ESTAGIO_LABEL: Record<string, string> = STAGE_LABEL_PT;
const MARCO_LABEL: Record<string, string> = MARCO_LABEL_PT;

const schema = defineSchema(
  "consultar_operacao",
  "Consulta o ANDAMENTO/STATUS de uma operação (estágio, marcos, documentos, " +
  "financeiro) para você narrar a jornada. Use quando perguntarem 'status da " +
  "operação', 'como está o andamento', 'em que pé está', ou sobre documentos/marcos. " +
  "Sem operationId, usa a operação do contexto; se não houver, lista as ativas.",
  {
    type: "object",
    properties: {
      operationId: { type: "number", description: "ID da operação (opcional; usa o contexto se ausente)" },
    },
  },
);

function brl(cents?: number | null) {
  if (cents == null) return "—";
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const consultarOperacaoTool: AgentTool = {
  name: "consultar_operacao",
  schema,
  // sem restrição de estágio — consulta vale sempre
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const opId = typeof args.operationId === "number" ? args.operationId : ctx.operacaoId;

    // Sem operação no contexto → lista as ativas do usuário.
    if (!opId) {
      const lista = await operacaoService.listOperacoes(ctx.userId);
      const ativas = lista.filter((o: any) => o.status === "ativa" || o.status === "go");
      if (ativas.length === 0) {
        return { ok: true, summary: "Você não tem operações ativas no momento.", data: { operacoes: [] } };
      }
      const linhas = ativas.slice(0, 10).map((o: any) =>
        `• ${o.codigo ?? `OP-${o.id}`} — ${o.titulo} (${ESTAGIO_LABEL[o.estagioAtual] ?? o.estagioAtual})`,
      );
      return {
        ok: true,
        summary: `Operações ativas (${ativas.length}):\n${linhas.join("\n")}`,
        data: { operacoes: ativas },
      };
    }

    const det = await operacaoService.getOperacao(ctx.userId, opId);
    if (!det) {
      return { ok: false, summary: `Operação ${opId} não encontrada.`, error: "nao_encontrada" };
    }
    const { operacao, marcos, anexos, financeiro, eventos } = det as any;

    const marcosTxt = (marcos ?? []).length
      ? marcos.map((m: any) =>
          `• ${MARCO_LABEL[m.tipo] ?? m.tipo}${m.status ? ` (${m.status})` : ""}${m.descricao ? ` — ${m.descricao}` : ""}`,
        ).join("\n")
      : "• Nenhum marco registrado ainda.";

    const docsTxt = (anexos ?? []).length
      ? anexos.slice(0, 12).map((a: any) => `• ${a.nome}${a.tipo ? ` (${a.tipo})` : ""}`).join("\n")
      : "• Nenhum documento anexado ainda.";

    const finIn = (financeiro ?? []).filter((f: any) => f.direcao === "entrada")
      .reduce((s: number, f: any) => s + (f.valorBrlCents ?? f.valorCents ?? 0), 0);
    const finOut = (financeiro ?? []).filter((f: any) => f.direcao === "saida")
      .reduce((s: number, f: any) => s + (f.valorBrlCents ?? f.valorCents ?? 0), 0);

    // Previsto × realizado (fechamento do ciclo): saídas por status + estimativa.
    const saidaPrevista = (financeiro ?? [])
      .filter((f: any) => f.direcao === "saida" && f.status === "previsto")
      .reduce((s: number, f: any) => s + (f.valorBrlCents ?? f.valorCents ?? 0), 0);
    const saidaRealizada = (financeiro ?? [])
      .filter((f: any) => f.direcao === "saida" && f.status === "realizado")
      .reduce((s: number, f: any) => s + (f.valorBrlCents ?? f.valorCents ?? 0), 0);
    let prevRealTxt = "";
    if (saidaPrevista > 0 || saidaRealizada > 0) {
      prevRealTxt = `\nPrevisto × realizado (saídas): previsto ${brl(saidaPrevista)} · realizado ${brl(saidaRealizada)}`;
      const base = operacao.valorEstimadoBrlCents ?? saidaPrevista;
      if (base > 0 && saidaRealizada > 0) {
        const desvio = Math.round(((saidaRealizada - base) / base) * 1000) / 10;
        prevRealTxt += ` (desvio ${desvio > 0 ? "+" : ""}${desvio}% sobre o estimado)`;
      }
    }

    // Últimos acontecimentos da timeline — incluem ações feitas no PAINEL
    // (autor "usuario") e as suas ("excambia"): a mesma história dos dois lados.
    const AUTOR_TXT: Record<string, string> = { usuario: "painel", excambia: "Excambia", sistema: "sistema" };
    const recentes = (eventos ?? []).slice(0, 8);
    const eventosTxt = recentes.length
      ? recentes.map((e: any) =>
          `• ${new Date(e.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ` +
          `[${AUTOR_TXT[e.autor] ?? e.autor}] ${e.titulo ?? e.tipo}`,
        ).join("\n")
      : "";

    const resumo =
      `Operação ${operacao.codigo ?? `OP-${operacao.id}`} — ${operacao.titulo}\n` +
      `Estágio: ${ESTAGIO_LABEL[operacao.estagioAtual] ?? operacao.estagioAtual} · Status: ${operacao.status}\n` +
      (operacao.clienteNome ? `Cliente: ${operacao.clienteNome}\n` : "") +
      (operacao.origemPais ? `Origem: ${operacao.origemPais}\n` : "") +
      (operacao.valorEstimadoBrlCents != null ? `Valor estimado: ${brl(operacao.valorEstimadoBrlCents)}\n` : "") +
      `\nMarcos:\n${marcosTxt}\n\nDocumentos:\n${docsTxt}` +
      ((financeiro ?? []).length ? `\n\nFinanceiro: entradas ${brl(finIn)} · saídas ${brl(finOut)}${prevRealTxt}` : "") +
      (eventosTxt ? `\n\nÚltimos acontecimentos:\n${eventosTxt}` : "");

    return {
      ok: true,
      summary: resumo,
      data: {
        operacao: {
          id: operacao.id, codigo: operacao.codigo, titulo: operacao.titulo,
          estagioAtual: operacao.estagioAtual, status: operacao.status,
          clienteNome: operacao.clienteNome, origemPais: operacao.origemPais,
          valorEstimadoBrlCents: operacao.valorEstimadoBrlCents,
        },
        marcos, anexos, financeiro,
        eventos: recentes.map((e: any) => ({
          tipo: e.tipo, autor: e.autor, titulo: e.titulo, criadoEm: e.criadoEm,
        })),
      },
    };
  },
};
