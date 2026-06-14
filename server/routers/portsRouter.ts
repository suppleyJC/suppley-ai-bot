import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { BRAZILIAN_PORTS, BRAZILIAN_STATES, getPortsByState, getPortCosts, IMPORT_FIXED_COSTS } from "../../shared/ports";

export const portsRouter = router({
getStates: publicProcedure.query(() => {
  return BRAZILIAN_STATES;
}),

getPortsByState: publicProcedure
  .input(z.object({ stateCode: z.string().length(2) }))
  .query(({ input }) => {
    return getPortsByState(input.stateCode);
  }),

getAllPorts: publicProcedure.query(() => {
  return BRAZILIAN_PORTS;
}),

getPortCosts: publicProcedure
  .input(z.object({ portCode: z.string(), cifValue: z.number() }))
  .query(({ input }) => {
    return getPortCosts(input.portCode, input.cifValue);
  }),

getFixedCosts: publicProcedure.query(() => {
  return IMPORT_FIXED_COSTS;
}),
});
