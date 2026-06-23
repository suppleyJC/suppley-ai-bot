/**
 * Operations Router — endpoints da entidade Operação.
 *
 * Registro em server/routers.ts:
 *   import { operationsRouter } from "./routers/operationsRouter";
 *   ... em appRouter: operations: operationsRouter,
 *
 * O Kanban (client/src/pages/Operations.tsx) consome `operations.list`.
 * A tela da operação consome `operations.get`.
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as svc from "../services/operacaoService";

export const operationsRouter = router({
  list: protectedProcedure.query(({ ctx }) => svc.listOperacoes(ctx.user.id)),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => svc.getOperacao(ctx.user.id, input.id)),

  create: protectedProcedure
    .input(z.object({
      titulo: z.string().min(1),
      demandaId: z.number().optional(),
      clienteNome: z.string().optional(),
      origemPais: z.string().optional(),
      regimeTributario: z.enum(["lucro_real", "lucro_presumido", "simples_nacional"]).optional(),
    }))
    .mutation(({ ctx, input }) => svc.createOperacao({ userId: ctx.user.id, ...input })),

  advanceStage: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      to: z.enum(["demand", "source", "analyze", "execute", "finance", "closed", "lost"]).optional(),
      gateChecklist: z.unknown().optional(),
    }))
    .mutation(({ input }) => svc.advanceStage(input)),

  linkQuotation: protectedProcedure
    .input(z.object({ operacaoId: z.number(), quotationId: z.number() }))
    .mutation(({ input }) => svc.linkQuotation(input.operacaoId, input.quotationId)),

  linkCalculation: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      calculationId: z.number(),
      valorBrlCents: z.number().optional(),
      margemBp: z.number().optional(),
    }))
    .mutation(({ input }) =>
      svc.linkCalculation(input.operacaoId, input.calculationId, {
        valorBrlCents: input.valorBrlCents, margemBp: input.margemBp,
      })),

  decideGoNoGo: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      decision: z.enum(["go", "no_go"]),
      motivo: z.string().optional(),
      valoresSnapshot: z.unknown().optional(),
    }))
    .mutation(({ ctx, input }) =>
      svc.decideGoNoGo({ ...input, decidedBy: ctx.user.id })),

  addEvento: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      tipo: z.string(),
      estagio: z.enum(["demand", "source", "analyze", "execute", "finance", "closed", "lost"]),
      titulo: z.string().optional(),
      payload: z.unknown().optional(),
    }))
    .mutation(({ input }) => svc.addEvento({ ...input } as any)),

  // Atualiza metadados de planejamento (prioridade, prazo, cliente, etc.)
  update: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      titulo: z.string().optional(),
      clienteNome: z.string().optional(),
      origemPais: z.string().optional(),
      origemDesejada: z.string().optional(),
      regimeTributario: z.enum(["lucro_real", "lucro_presumido", "simples_nacional"]).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      prazoDesejado: z.date().nullable().optional(),
      responsavelId: z.number().nullable().optional(),
    }))
    .mutation(({ ctx, input }) => svc.updateOperacao({ userId: ctx.user.id, ...input })),

  // Duplica a operação (copia só metadados de planejamento, começa em demand)
  duplicate: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(({ ctx, input }) => svc.duplicateOperacao(ctx.user.id, input.operacaoId)),

  // Exclui a operação e toda a sua esteira
  delete: protectedProcedure
    .input(z.object({ operacaoId: z.number() }))
    .mutation(({ ctx, input }) => svc.deleteOperacao(ctx.user.id, input.operacaoId)),

  // ----- Anexos -----
  addAnexo: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      tipo: z.enum(["desenho", "pdf", "imagem", "especificacao", "catalogo", "cotacao", "outro"]).optional(),
      nome: z.string().min(1),
      fileKey: z.string(),
      fileUrl: z.string(),
      contentType: z.string().optional(),
      tamanhoBytes: z.number().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => svc.anexarDocumento({ userId: ctx.user.id, ...input })),

  removeAnexo: protectedProcedure
    .input(z.object({ anexoId: z.number() }))
    .mutation(({ ctx, input }) => svc.removerAnexo(ctx.user.id, input.anexoId)),

  // ----- Financeiro -----
  lancarFinanceiro: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      tipo: z.enum(["cambio", "pagamento_fornecedor", "imposto", "frete", "seguro", "despesa_local", "comissao", "receita", "outro"]).optional(),
      direcao: z.enum(["entrada", "saida"]).optional(),
      status: z.enum(["previsto", "realizado", "cancelado"]).optional(),
      descricao: z.string().optional(),
      valorCents: z.number(),
      moeda: z.string().optional(),
      valorBrlCents: z.number().optional(),
      cambioRate: z.number().optional(),
      dataReferencia: z.date().optional(),
      vencimento: z.date().optional(),
    }))
    .mutation(({ ctx, input }) => svc.lancarFinanceiro({ userId: ctx.user.id, ...input })),

  removeFinanceiro: protectedProcedure
    .input(z.object({ lancamentoId: z.number() }))
    .mutation(({ ctx, input }) => svc.removerFinanceiro(ctx.user.id, input.lancamentoId)),

  // ----- Marcos -----
  registrarMarco: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      tipo: z.enum(["pedido_confirmado", "producao_iniciada", "produto_embarcado", "di_registrada", "nacionalizado", "entregue"]),
      status: z.enum(["planejado", "realizado", "cancelado"]).optional(),
      descricao: z.string().optional(),
      dataReferencia: z.date().optional(),
    }))
    .mutation(({ ctx, input }) => svc.registrarMarco({ userId: ctx.user.id, ...input })),
});
