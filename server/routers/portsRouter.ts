import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { BRAZILIAN_PORTS, BRAZILIAN_STATES, getPortsByState, IMPORT_FIXED_COSTS } from "../../shared/ports";
import { resolvePortCosts } from "../services/portCostService";
import { getActiveTaxParameters } from "../db";

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

// Custos portuários DB-first (port_costs), fallback p/ tabela estática.
// cifValue em R$; retorno em R$ para compatibilidade com o consumidor atual.
getPortCosts: publicProcedure
  .input(z.object({ portCode: z.string(), cifValue: z.number() }))
  .query(async ({ input }) => {
    const r = await resolvePortCosts(input.portCode, Math.round(input.cifValue * 100));
    return {
      thc: r.thcCents / 100,
      storage: r.storageCents / 100,
      liberation: r.liberationCents / 100,
      other: r.otherCents / 100,
      total: r.totalCents / 100,
      source: r.source,
    };
  }),

// Custos fixos: parâmetros versionados quando disponíveis, senão constantes.
getFixedCosts: publicProcedure.query(async () => {
  const p = await getActiveTaxParameters();
  return {
    siscomexBase: (p["SISCOMEX_BASE"]?.valueCents ?? IMPORT_FIXED_COSTS.siscomexBase * 100) / 100,
    siscomexPerAddition: (p["SISCOMEX_ADICAO"]?.valueCents ?? IMPORT_FIXED_COSTS.siscomexPerAddition * 100) / 100,
    blLiberation: (p["BL_LIBERATION"]?.valueCents ?? IMPORT_FIXED_COSTS.blLiberation * 100) / 100,
    customsBroker: (p["CUSTOMS_BROKER"]?.valueCents ?? IMPORT_FIXED_COSTS.customsBroker * 100) / 100,
    afrmmRate: (p["AFRMM_RATE"]?.valueBp ?? IMPORT_FIXED_COSTS.afrmmRate * 10000) / 10000,
  };
}),
});
