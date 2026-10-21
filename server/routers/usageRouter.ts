/**
 * usageRouter — medição de uso/custo de IA (tokens por modelo, custo estimado).
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getLlmUsageSummary } from "../db";

export const usageRouter = router({
  summary: protectedProcedure
    .input(z.object({ days: z.number().int().positive().max(365).default(30) }).optional())
    .query(({ input }) => getLlmUsageSummary(input?.days ?? 30)),
});
