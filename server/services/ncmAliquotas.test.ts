/**
 * Alíquota apresentada pela classificação vem SEMPRE da tabela oficial.
 *
 * Caso real: abraçadeira de nylon, 3926.90.90. A tabela tem II 18% (TEC); o
 * classificador escreveu 16% e a Excambia repetiu o número do modelo em duas
 * respostas, porque só IPI/PIS/COFINS eram trocados pelos da base.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(async () => null) }));

import { aplicarAliquotasDaBase, type NCMSuggestion } from "./ncmService";

const doModelo = (): NCMSuggestion => ({
  ncmCode: "39269090", description: "Outras", iiRate: 16, ipiRate: 975, pisRate: 0, cofinsRate: 0,
  confidence: 55, reason: "",
});

describe("aplicarAliquotasDaBase", () => {
  it("troca o II do modelo pelo da TEC", () => {
    const s = doModelo();
    aplicarAliquotasDaBase(s, {
      iiRate: 1800, ipiRate: 0, pisRate: 210, cofinsRate: 965,
      notes: "II 18% TEC (Anexo I) | MDIC 2026-07-28",
    });
    expect(s).toMatchObject({ iiRate: 1800, ipiRate: 0, pisRate: 210, cofinsRate: 965, aliquotaFonte: "base" });
    expect(s.aliquotaOrigem).toContain("TEC");
  });

  it("marca como estimado o II que a tabela preencheu por capítulo", () => {
    const s = doModelo();
    aplicarAliquotasDaBase(s, { iiRate: 1400, ipiRate: 0, pisRate: 210, cofinsRate: 1025, notes: "II 14% estimada por capitulo | MDIC 2026-07-28" });
    expect(s.aliquotaFonte).toBe("estimada");
    const t = doModelo();
    aplicarAliquotasDaBase(t, { iiRate: 1400, ipiRate: 0, pisRate: 210, cofinsRate: 1025, notes: "Importado do Siscomex" });
    expect(t.aliquotaFonte).toBe("estimada");
  });

  it("sem o código na base, não repete o número do modelo", () => {
    const s = doModelo();
    aplicarAliquotasDaBase(s, null);
    expect(s.iiRate).toBe(0);
    expect(s.aliquotaFonte).toBe("nao_confirmada");
  });
});

describe("conferirNaFonteOficial (sem TTCE ligado)", () => {
  it("mostra a data da carga e avisa quando a tabela está velha", async () => {
    const { conferirNaFonteOficial } = await import("./ncmService");
    const s = doModelo();
    aplicarAliquotasDaBase(s, { iiRate: 1800, ipiRate: 0, pisRate: 210, cofinsRate: 965, notes: "II 18% TEC (Anexo I) | MDIC 2026-07-28" });
    await conferirNaFonteOficial(s, "China", new Date("2026-11-12T12:00:00Z"));
    expect(s.aliquotaFonte).toBe("base");
    expect(s.aliquotaOrigem).toBe("TEC carregada em 28/07/2026");

    const velha = doModelo();
    aplicarAliquotasDaBase(velha, { iiRate: 1800, ipiRate: 0, pisRate: 210, cofinsRate: 965, notes: "II 18% TEC (Anexo I) | MDIC 2026-03-01" });
    await conferirNaFonteOficial(velha, "China", new Date("2026-11-12T12:00:00Z"));
    expect(velha.aliquotaOrigem).toMatch(/há \d+ dias — pode haver alteração/);
  });
});

describe("conferirNaFonteOficial (TTCE ligado)", () => {
  it("o oficial vence a tabela e a divergência fica registrada", async () => {
    vi.resetModules();
    vi.doMock("./ttceService", () => ({
      ttceEnabled: () => true,
      consultarTtce: vi.fn(async () => ({ iiRate: 0.2, ipiRate: 0.0325, exTarifario: null, preferencia: null, fundamentos: [] })),
    }));
    const mod = await import("./ncmService");
    const s = doModelo();
    mod.aplicarAliquotasDaBase(s, { iiRate: 1800, ipiRate: 0, pisRate: 210, cofinsRate: 965, notes: "II 18% TEC (Anexo I) | MDIC 2026-07-28" });
    await mod.conferirNaFonteOficial(s, "China", new Date("2026-11-12T12:00:00Z"));
    expect(s).toMatchObject({ iiRate: 2000, ipiRate: 325, iiTabelaLocal: 1800, aliquotaFonte: "ttce" });
    expect(s.aliquotaOrigem).toContain("TTCE/Portal Único");
    vi.doUnmock("./ttceService");
  });
});
