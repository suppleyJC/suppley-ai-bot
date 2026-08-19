import { describe, it, expect } from "vitest";
import { precificarNacional, depreciacaoAtivo } from "./nacionalPricingService";

describe("precificarNacional", () => {
  it("método do divisor: preço cobre CMV + impostos de saída + margem", () => {
    // Lucro Real: ICMS 18% + PIS 1,65% + COFINS 7,6% = 27,25%; margem 15% → divisor 0,5775
    const r = precificarNacional({ cmvCents: 100000, regime: "lucro_real", margemDesejada: 0.15 });
    expect(r.precoVendaCents).toBe(Math.round(100000 / (1 - 0.2725 - 0.15)));
    // lucro ≈ 15% do preço
    expect(r.margemLiquidaCents).toBe(Math.round(r.precoVendaCents * 0.15));
  });

  it("Simples usa alíquota única e zera ICMS/PIS/COFINS", () => {
    const r = precificarNacional({ cmvCents: 100000, regime: "simples_nacional", margemDesejada: 0.15, simplesRate: 0.10 });
    expect(r.detalhe.icms).toBe(0);
    expect(r.cargaSaidaFrac).toBeCloseTo(0.10, 10);
  });

  it("lança erro se carga + margem ≥ 100%", () => {
    expect(() => precificarNacional({ cmvCents: 100000, regime: "lucro_real", margemDesejada: 0.9 })).toThrow();
  });
});

describe("depreciacaoAtivo", () => {
  it("Lucro Real: economia = depreciação × (IRPJ+CSLL)", () => {
    const r = depreciacaoAtivo({ valorAtivoCents: 1000000, regime: "lucro_real", taxaDepreciacaoAnual: 0.10 });
    expect(r.aplicavel).toBe(true);
    expect(r.depreciacaoAnualCents).toBe(100000);
    expect(r.aliquotaAbatimento).toBeCloseTo(0.24, 10); // 15% + 9% (sem adicional)
    expect(r.economiaAnualCents).toBe(24000);
  });

  it("com adicional de 10% de IRPJ", () => {
    const r = depreciacaoAtivo({ valorAtivoCents: 1000000, regime: "lucro_real", taxaDepreciacaoAnual: 0.10, aplicaAdicionalIrpj: true });
    expect(r.aliquotaAbatimento).toBeCloseTo(0.34, 10);
  });

  it("Presumido/Simples: sem abatimento direto", () => {
    const r = depreciacaoAtivo({ valorAtivoCents: 1000000, regime: "lucro_presumido" });
    expect(r.aplicavel).toBe(false);
    expect(r.economiaAnualCents).toBe(0);
  });
});
