/**
 * FASE 5 — Router tRPC de ingestão e bases.
 *
 * Liga o pipeline (Fatia 3) e os agentes de busca (Fatia 4) à interface.
 * Os dois pontos de entrada do documento (Excambia OU ambiente) chamam o MESMO fluxo.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as fase5Db from "../db/fase5Db";
import { ingerirDocumento, gravarAprovado } from "../agent/pipeline/ingestao";
import { buscarAtivo, compararNacionalImportado } from "../agent/tools/agentesFase5";

export const fase5Router = router({
  /** Registra um documento recebido (após upload no storage) e dispara a ingestão. */
  ingerir: protectedProcedure
    .input(z.object({
      tipo: z.enum(["proforma", "invoice", "cotacao", "planilha", "pdf_outro"]),
      nomeArquivo: z.string(),
      storageKey: z.string(),
      operacaoId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id: documentoId } = await fase5Db.criarDocumento({
        userId: ctx.user.id,
        tipo: input.tipo,
        nomeArquivo: input.nomeArquivo,
        storageKey: input.storageKey,
        operacaoId: input.operacaoId ?? null,
        status: "recebido",
      } as any);

      const resultado = await ingerirDocumento({
        userId: ctx.user.id,
        documentoId,
        storageKey: input.storageKey,
        tipo: input.tipo,
      });

      return { documentoId, ...resultado };
    }),

  /** Lista documentos do usuário (para acompanhar status de ingestão). */
  listarDocumentos: protectedProcedure.query(async ({ ctx }) => {
    return fase5Db.listarDocumentos(ctx.user.id);
  }),

  /** Abre a proposta extraída de um documento (para revisão humana). */
  getProposta: protectedProcedure
    .input(z.object({ documentoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const doc = await fase5Db.getDocumento(input.documentoId, ctx.user.id);
      if (!doc) throw new Error("Documento não encontrado");
      return { documento: doc, proposta: doc.extracao };
    }),

  /** Aprova a proposta (eventualmente editada) e grava nas bases. */
  aprovar: protectedProcedure
    .input(z.object({
      documentoId: z.number(),
      proposta: z.any(), // a proposta revisada pelo usuário
    }))
    .mutation(async ({ ctx, input }) => {
      return gravarAprovado({
        userId: ctx.user.id,
        documentoId: input.documentoId,
        proposta: input.proposta,
      });
    }),

  /** Busca em linguagem natural (lado leitura do ciclo). */
  buscarAtivo: protectedProcedure
    .input(z.object({ termo: z.string() }))
    .query(async ({ ctx, input }) => buscarAtivo({ termo: input.termo, userId: ctx.user.id })),

  /** Comparação nacional × importado de um ativo. */
  compararOrigem: protectedProcedure
    .input(z.object({ ativoId: z.number() }))
    .query(async ({ ctx, input }) => compararNacionalImportado({ ativoId: input.ativoId, userId: ctx.user.id })),
});
