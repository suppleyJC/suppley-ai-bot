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

const ESTAGIO_LABEL: Record<string, string> = {
  demand: "Demanda", source: "Fornecedores", analyze: "Viabilidade",
  execute: "Operação", finance: "Câmbio/Financeiro", closed: "Concluída", lost: "Perdida",
};
const MARCO_LABEL: Record<string, string> = {
  pedido_confirmado: "Pedido confirmado", producao_iniciada: "Produção iniciada",
  produto_embarcado: "Produto embarcado", di_registrada: "DI registrada",
  nacionalizado: "Nacionalizado", entregue: "Entregue",
};

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
    const { operacao, marcos, anexos, financeiro } = det as any;

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

    const resumo =
      `Operação ${operacao.codigo ?? `OP-${operacao.id}`} — ${operacao.titulo}\n` +
      `Estágio: ${ESTAGIO_LABEL[operacao.estagioAtual] ?? operacao.estagioAtual} · Status: ${operacao.status}\n` +
      (operacao.clienteNome ? `Cliente: ${operacao.clienteNome}\n` : "") +
      (operacao.origemPais ? `Origem: ${operacao.origemPais}\n` : "") +
      (operacao.valorEstimadoBrlCents != null ? `Valor estimado: ${brl(operacao.valorEstimadoBrlCents)}\n` : "") +
      `\nMarcos:\n${marcosTxt}\n\nDocumentos:\n${docsTxt}` +
      ((financeiro ?? []).length ? `\n\nFinanceiro: entradas ${brl(finIn)} · saídas ${brl(finOut)}` : "");

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
      },
    };
  },
};
