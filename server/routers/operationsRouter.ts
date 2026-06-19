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
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      prazoDesejado: z.coerce.date().optional(),
      responsavelId: z.number().optional(),
      origemDesejada: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => svc.createOperacao({ userId: ctx.user.id, ...input })),

  update: protectedProcedure
    .input(z.object({
      operacaoId: z.number(),
      titulo: z.string().min(1).optional(),
      clienteNome: z.string().optional(),
      origemPais: z.string().optional(),
      regimeTributario: z.enum(["lucro_real", "lucro_presumido", "simples_nacional"]).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      prazoDesejado: z.coerce.date().nullable().optional(),
      responsavelId: z.number().nullable().optional(),
      origemDesejada: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => svc.updateOperacao({ userId: ctx.user.id, ...input })),

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
});
