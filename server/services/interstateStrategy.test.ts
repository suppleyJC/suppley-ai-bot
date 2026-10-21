import { describe, it, expect, vi } from "vitest";

// Mock do db: SC com TTD (antecipado 1%), SP cheio 18%.
vi.mock("../db", () => ({
  getIcmsRate: vi.fn(async (uf: string) => {
    const u = uf.toUpperCase();
    if (u === "SC") return { stateCode: "SC", internalRate: 1700, icmsAntecipadoRate: 100, hasIncentive: true };
    if (u === "SP") return { stateCode: "SP", internalRate: 1800, hasIncentive: false };
    return null;
  }),
}));

import { compareImportRoutes } from "./interstateStrategyService";

describe("compareImportRoutes", () => {
  it("calcula o ICMS de importação direta (por dentro) e via hub (antecipado override)", async () => {
    const r = await compareImportRoutes({
      hubState: "SC",
      destinationState: "SP",
      baseIcmsCents: 100000, // R$ 1.000,00
      modelo: "trading_revenda",
      destinatarioCreditaIcms: true,
      etapaFinal: "revenda_contribuinte",
      hubAntecipadoBpOverride: 100, // 1%
    });

    // Direta: gross-up a 18% → 100000*10000/8200 - 100000 = 21951
    expect(r.direta.icmsImportacaoCents).toBe(21951);
    // Via hub: antecipado 1% sobre a base = 1000
    expect(r.viaHub.icmsImportacaoCents).toBe(1000);
    expect(r.economiaImportacaoCents).toBe(20951);
  });

  it("usa o benefício cadastrado do hub quando não há override", async () => {
    const r = await compareImportRoutes({
      hubState: "SC",
      destinationState: "SP",
      baseIcmsCents: 100000,
      modelo: "trading_revenda",
      destinatarioCreditaIcms: true,
      etapaFinal: "revenda_contribuinte",
    });
    // SC.icmsAntecipadoRate = 100 (1%) → 1000
    expect(r.viaHub.icmsImportacaoCents).toBe(1000);
  });

  it("inclui DIFAL na rota via hub quando consumidor final", async () => {
    const r = await compareImportRoutes({
      hubState: "SC",
      destinationState: "SP",
      baseIcmsCents: 100000,
      valorSaidaCents: 100000,
      modelo: "trading_revenda",
      destinatarioCreditaIcms: false,
      etapaFinal: "consumidor_final",
      hubAntecipadoBpOverride: 100,
    });
    const difal = r.viaHub.legs.find((l) => l.label.includes("DIFAL"));
    expect(difal).toBeTruthy();
    // (18% - 4%) * 100000 = 14000
    expect(difal!.valueCents).toBe(14000);
  });

  it("avisa quando o hub não tem benefício cadastrado (usa ICMS cheio)", async () => {
    const r = await compareImportRoutes({
      hubState: "SP", // sem incentivo
      destinationState: "SC",
      baseIcmsCents: 100000,
      modelo: "trading_revenda",
      destinatarioCreditaIcms: true,
      etapaFinal: "revenda_contribuinte",
    });
    // SP sem benefício → ICMS cheio por dentro a 18% = 21951
    expect(r.viaHub.icmsImportacaoCents).toBe(21951);
    expect(r.alertas.some((a) => a.toLowerCase().includes("benefício"))).toBe(true);
  });
});
