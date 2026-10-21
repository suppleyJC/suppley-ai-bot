import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

export const icmsRouter = router({
get: publicProcedure
  .input(z.object({ stateCode: z.string().length(2) }))
  .query(async ({ input }) => {
    return db.getIcmsRate(input.stateCode);
  }),

list: publicProcedure.query(async () => {
  return db.getAllIcmsRates();
}),
});
