/**
 * TOOL: registrar_resultado_operacao — FECHAMENTO DO CICLO (Fase 3.2).
 *
 * Registra o RESULTADO REAL de uma operação e compara com o previsto:
 *   - custo real × valor estimado (desvio %)
 *   - prazo real (marco "entregue") × prazo desejado
 *   - avaliação do fornecedor (1–5 em preço/qualidade/prazo/comunicação)
 *     → alimenta supplier_ratings e recalcula o rating do fornecedor
 *   - aprendizado durável → excambia_learning_context (memória da Excambia)
 *
 * É o loop de feedback que faz a plataforma "aprender": o previsto × realizado
 * fica auditável na timeline e o rating passa a influenciar recomendações
 * futuras de sourcing.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as operacaoService from "../../services/operacaoService";
import { createSupplierRating, getIndustryById } from "../../db/industriesDb";
import { saveLearningContext } from "../../db";

const brl = (cents?: number | null) =>
  cents == null ? "—" : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const clampScore = (v: unknown): number | undefined => {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(5, Math.round(n)));
};

const schema = defineSchema(
  "registrar_resultado_operacao",
  "FECHA O CICLO de uma operação registrando o resultado REAL: custo realizado × previsto, " +
  "prazo real × desejado e a avaliação do fornecedor (notas 1–5). A avaliação alimenta o " +
  "RATING do fornecedor (usado em recomendações futuras) e o aprendizado fica na memória. " +
  "Use quando a operação for entregue/concluída, ou quando a pessoa relatar como a operação " +
  "terminou ('chegou tudo certo', 'atrasou 20 dias', 'o fornecedor foi ótimo'). " +
  "Colete o que faltar em UMA pergunta antes de registrar.",
  {
    type: "object",
    properties: {
      operationId: { type: "number", description: "ID da operação (opcional; usa a do contexto)" },
      resultado: {
        type: "string",
        enum: ["sucesso", "parcial", "problema"],
        description: "Como a operação terminou no geral",
      },
      custoRealBrlCents: {
        type: "number",
        description: "Custo total REAL em centavos de BRL. Se omitido, usa a soma dos lançamentos financeiros realizados (saídas).",
      },
      notaPreco: { type: "number", description: "1–5: competitividade do preço praticado" },
      notaQualidade: { type: "number", description: "1–5: qualidade do produto recebido" },
      notaPrazo: { type: "number", description: "1–5: cumprimento do prazo" },
      notaComunicacao: { type: "number", description: "1–5: comunicação/resposta do fornecedor" },
      comentario: { type: "string", description: "Observações sobre o resultado/fornecedor" },
      aprendizado: {
        type: "string",
        description: "Aprendizado durável para memória (ex.: 'fornecedor X atrasa em média 15 dias na alta temporada')",
      },
      concluirOperacao: {
        type: "boolean",
        description: "true para marcar a operação como concluída (status concluida, estágio closed)",
      },
    },
    required: ["resultado"],
  },
);

export const registrarResultadoOperacaoTool: AgentTool = {
  name: "registrar_resultado_operacao",
  schema,
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const opId = typeof args.operationId === "number" ? args.operationId : ctx.operacaoId;
    if (!opId) {
      return {
        ok: false,
        summary: "Nenhuma operação no contexto. Pergunte qual operação a pessoa quer encerrar (use consultar_operacao para listar as ativas).",
        error: "sem_operacao",
      };
    }

    const det = await operacaoService.getOperacao(ctx.userId, opId);
    if (!det) return { ok: false, summary: `Operação ${opId} não encontrada.`, error: "nao_encontrada" };
    const { operacao, financeiro, marcos } = det;

    // ---------- previsto × realizado (custo) ----------
    const realizadoFinanceiro = (financeiro ?? [])
      .filter((f) => f.status === "realizado" && f.direcao === "saida")
      .reduce((s, f) => s + (f.valorBrlCents ?? f.valorCents ?? 0), 0);
    const custoReal = typeof args.custoRealBrlCents === "number" && args.custoRealBrlCents > 0
      ? Math.round(args.custoRealBrlCents)
      : (realizadoFinanceiro > 0 ? realizadoFinanceiro : null);
    const previsto = operacao.valorEstimadoBrlCents ?? null;

    let desvioPct: number | null = null;
    if (custoReal != null && previsto != null && previsto > 0) {
      desvioPct = Math.round(((custoReal - previsto) / previsto) * 1000) / 10;
    }

    // ---------- previsto × realizado (prazo) ----------
    const entregue = (marcos ?? []).find((m) => m.tipo === "entregue" && m.status === "realizado");
    let atrasoDias: number | null = null;
    if (entregue?.dataReferencia && operacao.prazoDesejado) {
      atrasoDias = Math.round(
        (new Date(entregue.dataReferencia).getTime() - new Date(operacao.prazoDesejado).getTime()) / 86_400_000,
      );
    }

    // ---------- avaliação do fornecedor → rating ----------
    const notaPreco = clampScore(args.notaPreco);
    const notaQualidade = clampScore(args.notaQualidade);
    const notaPrazo = clampScore(args.notaPrazo);
    const notaComunicacao = clampScore(args.notaComunicacao);
    const temAvaliacao = notaPreco && notaQualidade && notaPrazo && notaComunicacao;

    let ratingMsg = "";
    if (temAvaliacao) {
      if (!operacao.fornecedorId) {
        ratingMsg = "Avaliação NÃO gravada: a operação não tem fornecedor vinculado.";
      } else {
        await createSupplierRating({
          userId: ctx.userId,
          industryId: operacao.fornecedorId,
          priceScore: notaPreco!,
          qualityScore: notaQualidade!,
          deliveryScore: notaPrazo!,
          communicationScore: notaComunicacao!,
          comment: typeof args.comentario === "string" ? args.comentario : undefined,
          orderDate: entregue?.dataReferencia ? new Date(entregue.dataReferencia) : new Date(),
          orderValue: custoReal ?? previsto ?? undefined,
        });
        const ind = await getIndustryById(operacao.fornecedorId, ctx.userId);
        const media = ((notaPreco! + notaQualidade! + notaPrazo! + notaComunicacao!) / 4).toFixed(1);
        ratingMsg = `Avaliação ${media}/5 gravada para ${operacao.fornecedorNome ?? `fornecedor #${operacao.fornecedorId}`}` +
          (ind ? ` (rating geral atualizado: ${Number(ind.overallRating ?? 0).toFixed(2)}/5, ${ind.totalOrders ?? 0} avaliação(ões))` : "") + ".";
      }
    }

    // ---------- aprendizado → memória ----------
    const linhas: string[] = [
      `Operação ${operacao.codigo} (${operacao.fornecedorNome ?? "sem fornecedor"}): resultado ${args.resultado}.`,
    ];
    if (previsto != null || custoReal != null) {
      linhas.push(
        `Custo previsto ${brl(previsto)} × realizado ${brl(custoReal)}` +
        (desvioPct != null ? ` (desvio ${desvioPct > 0 ? "+" : ""}${desvioPct}%)` : "") + ".",
      );
    }
    if (atrasoDias != null) {
      linhas.push(atrasoDias > 0 ? `Entrega atrasou ${atrasoDias} dia(s).` : atrasoDias < 0 ? `Entrega adiantou ${-atrasoDias} dia(s).` : "Entrega no prazo.");
    }
    if (typeof args.aprendizado === "string" && args.aprendizado.trim()) {
      linhas.push(`Aprendizado: ${args.aprendizado.trim()}`);
    }
    const resumoResultado = linhas.join(" ");

    await saveLearningContext({
      userId: ctx.userId,
      contextType: "feedback",
      key: `resultado_${operacao.codigo}`,
      value: resumoResultado,
      importance: args.resultado === "problema" ? 85 : 70,
      source: "excambia",
    });

    // ---------- timeline (auditável) ----------
    await operacaoService.addEvento({
      operacaoId: opId,
      tipo: "nota_interna",
      estagio: operacao.estagioAtual,
      autor: "excambia",
      titulo: "Resultado da operação registrado (previsto × realizado)",
      payload: {
        resultado: args.resultado,
        previstoBrlCents: previsto,
        realizadoBrlCents: custoReal,
        desvioPct,
        atrasoDias,
        avaliacao: temAvaliacao
          ? { preco: notaPreco, qualidade: notaQualidade, prazo: notaPrazo, comunicacao: notaComunicacao }
          : null,
        comentario: args.comentario ?? null,
      },
    });

    // ---------- conclusão opcional ----------
    let conclusaoMsg = "";
    if (args.concluirOperacao === true) {
      await operacaoService.concluirOperacao({ userId: ctx.userId, operacaoId: opId, resumo: resumoResultado });
      conclusaoMsg = "Operação marcada como CONCLUÍDA.";
    }

    const partes = [resumoResultado, ratingMsg, conclusaoMsg].filter(Boolean);
    return {
      ok: true,
      summary: partes.join("\n"),
      data: {
        operacaoId: opId,
        codigo: operacao.codigo,
        resultado: args.resultado,
        previstoBrlCents: previsto,
        realizadoBrlCents: custoReal,
        desvioPct,
        atrasoDias,
        avaliacaoGravada: Boolean(temAvaliacao && operacao.fornecedorId),
        concluida: args.concluirOperacao === true,
      },
    };
  },
};
