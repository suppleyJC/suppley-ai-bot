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
