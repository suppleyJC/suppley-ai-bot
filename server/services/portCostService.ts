/**
 * portCostService — resolve custos portuários DB-first (port_costs),
 * com fallback para a tabela estática shared/ports.ts.
 *
 * Tudo em centavos. Armazenagem = CIF × storageBp / 10000.
 */
import { getActivePortCost } from "../db";
import { getPortCosts as getPortCostsStatic } from "../../shared/ports";

export interface ResolvedPortCosts {
  thcCents: number;
  storageCents: number;
  liberationCents: number;
  otherCents: number;
  totalCents: number;
  source: "db" | "fallback";
}

export async function resolvePortCosts(
  portCode: string,
  cifValueCents: number,
): Promise<ResolvedPortCosts> {
  const row = await getActivePortCost(portCode);
  if (row) {
    const thcCents = row.thcCents;
    const storageCents = Math.round((cifValueCents * row.storageBp) / 10000);
    const liberationCents = row.liberationCents;
    const otherCents = row.otherCents;
    return {
      thcCents,
      storageCents,
      liberationCents,
      otherCents,
      totalCents: thcCents + storageCents + liberationCents + otherCents,
      source: "db",
    };
  }

  // Fallback: tabela estática (valores em R$).
  const fb = getPortCostsStatic(portCode, cifValueCents / 100);
  return {
    thcCents: Math.round(fb.thc * 100),
    storageCents: Math.round(fb.storage * 100),
    liberationCents: Math.round(fb.liberation * 100),
    otherCents: 0,
    totalCents: Math.round(fb.total * 100),
    source: "fallback",
  };
}
