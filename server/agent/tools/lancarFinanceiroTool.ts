/**
 * TOOL: lancar_financeiro
 *
 * Registra movimento financeiro: câmbio, pagamentos, impostos, fretes,
 * seguros, despesas locais, comissões, receitas.
 * Cada lançamento gera evento na timeline (coesão Painel ↔ Excambia).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as operacaoService from "../../services/operacaoService";

const schema = defineSchema(
  "lancar_financeiro",
  "Registra um lançamento financeiro (câmbio, pagamento, imposto, frete, seguro, despesa, comissão, receita). " +
  "Atualiza o resumo financeiro e gera evento na timeline.",
  {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["cambio", "pagamento_fornecedor", "imposto", "frete", "seguro", "despesa_local", "comissao", "receita", "outro"],
        description: "Tipo de lançamento",
      },
      direcao: {
        type: "string",
        enum: ["entrada", "saida"],
        description: "Entrada (receita/crédito) ou saída (custo/débito)",
      },
      valor: {
        type: "number",
        description: "Valor do lançamento em cents (ex: 100000 = R$ 1.000,00)",
      },
      moeda: {
        type: "string",
        description: "Moeda (BRL, USD, EUR, etc.). Default: BRL",
      },
      cambioRate: {
        type: "number",
        description: "Taxa de câmbio (se moeda ≠ BRL). Ex: 5.25 para USD.",
      },
      descricao: {
        type: "string",
        description: "Descrição do lançamento",
      },
      status: {
        type: "string",
        enum: ["previsto", "realizado", "cancelado"],
        description: "Status do lançamento (default: realizado)",
      },
      dataReferencia: {
        type: "string",
        description: "Data do lançamento (ISO format). Default: agora.",
      },
      vencimento: {
        type: "string",
        description: "Data de vencimento (se aplicável, ISO format).",
      },
    },
    required: ["tipo", "direcao", "valor"],
  },
);

export const lancarFinanceiroTool: AgentTool = {
  name: "lancar_financeiro",
  schema,
  estagios: ["source", "analyze", "execute", "finance"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.operacaoId) {
      return { ok: false, summary: "Esta ferramenta requer uma operação ativa.", error: "sem_operacao" };
    }

    const tipo = (args.tipo ?? "outro") as operacaoService.TipoFinanceiro;
    const direcao = args.direcao as operacaoService.DirecaoFinanceiro;
    const valor = Number(args.valor);

    if (!direcao) {
      return { ok: false, summary: "Direção (entrada/saída) é obrigatória.", error: "direcao_requerida" };
    }
    if (!Number.isFinite(valor) || valor < 0) {
      return { ok: false, summary: "Valor inválido.", error: "valor_invalido" };
    }

    const moeda = (typeof args.moeda === "string" ? args.moeda.toUpperCase() : "BRL");
    const cambioRate = typeof args.cambioRate === "number" ? args.cambioRate : undefined;
    const status = (args.status ?? "realizado") as operacaoService.StatusFinanceiro;
    const descricao = typeof args.descricao === "string" ? args.descricao : undefined;

    // Parse datas se fornecidas
    let dataReferencia: Date | undefined;
    let vencimento: Date | undefined;
    if (typeof args.dataReferencia === "string") {
      const d = new Date(args.dataReferencia);
      if (!isNaN(d.getTime())) dataReferencia = d;
    }
    if (typeof args.vencimento === "string") {
      const d = new Date(args.vencimento);
      if (!isNaN(d.getTime())) vencimento = d;
    }

    // Se moeda != BRL, precisa de cambio rate para converter
    let valorBrlCents: number | undefined;
    if (moeda === "BRL") {
      valorBrlCents = valor;
    } else if (cambioRate && cambioRate > 0) {
      valorBrlCents = Math.round(valor * cambioRate);
    }

    try {
      const lancamento = await operacaoService.lancarFinanceiro({
        userId: ctx.userId,
        operacaoId: ctx.operacaoId,
        tipo,
        direcao,
        status,
        descricao,
        valorCents: valor,
        moeda,
        valorBrlCents,
        cambioRate,
        dataReferencia,
        vencimento,
        autor: "excambia",
      });

      if (!lancamento) {
        return { ok: false, summary: "Falha ao registrar lançamento financeiro.", error: "registro_falhado" };
      }

      const dirLabel = direcao === "entrada" ? "entrada" : "saída";
      const valor_fmt = (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return {
        ok: true,
        summary: `Lançamento financeiro (${tipo}) registrado: ${dirLabel} de ${valor_fmt}. Resumo atualizado na timeline.`,
        data: lancamento,
      };
    } catch (e: any) {
      return {
        ok: false,
        summary: "Erro ao registrar lançamento financeiro.",
        error: String(e?.message ?? e),
      };
    }
  },
};
