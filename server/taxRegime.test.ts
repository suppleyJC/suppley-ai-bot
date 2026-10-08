import { describe, it, expect } from "vitest";
import {
  calculateSaleTaxes,
  calculateTargetPriceAnalysis,
  SIMPLES_NACIONAL_BRACKETS,
  type TaxRegime,
} from "./services/taxCalculationService";

describe("Tax Calculation by Regime", () => {
  describe("Simples Nacional", () => {
    it("should calculate taxes with single rate", () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 10000000, // R$ 100.000
        costCents: 6000000, // R$ 60.000
        stateCode: "SC",
        taxRegime: "simples_nacional",
        simplesAliquota: 1000, // 10%
      });

      expect(result.simplesTotal).toBe(1000000); // R$ 10.000 (10% de R$ 100.000)
      expect(result.totalTaxesOnSale).toBe(1000000);
      expect(result.effectiveRate).toBe(1000); // 10%
      expect(result.pisOnSale).toBe(0); // Incluso no Simples
      expect(result.cofinsOnSale).toBe(0); // Incluso no Simples
      expect(result.irpj).toBe(0); // Incluso no Simples
      expect(result.csll).toBe(0); // Incluso no Simples
    });

    it("should have correct brackets defined", () => {
      expect(SIMPLES_NACIONAL_BRACKETS).toHaveLength(6);
      expect(SIMPLES_NACIONAL_BRACKETS[0].aliquota).toBe(400); // 4%
      expect(SIMPLES_NACIONAL_BRACKETS[5].aliquota).toBe(1900); // 19%
    });
  });

  describe("Lucro Presumido", () => {
    it("should calculate taxes with cumulative PIS/COFINS", () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 10000000, // R$ 100.000
        costCents: 6000000, // R$ 60.000
        stateCode: "SC",
        taxRegime: "lucro_presumido",
      });

      // PIS: 0.65% = R$ 650
      expect(result.pisOnSale).toBe(65000);
      // COFINS: 3% = R$ 3.000
      expect(result.cofinsOnSale).toBe(300000);
      // IRPJ: 15% sobre base presumida (8%) = 15% * 8.000 = R$ 1.200
      expect(result.irpj).toBe(120000);
      // CSLL: 9% sobre base presumida (12%) = 9% * 12.000 = R$ 1.080
      expect(result.csll).toBe(108000);
      // ICMS: 17% = R$ 17.000
      expect(result.icmsOnSale).toBe(1700000);
      
      // Total should be sum of all
      const expectedTotal = 65000 + 300000 + 120000 + 108000 + 1700000;
      expect(result.totalTaxesOnSale).toBe(expectedTotal);
    });
  });

  describe("Lucro Real", () => {
    it("should calculate taxes with non-cumulative PIS/COFINS (with credits)", () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 10000000, // R$ 100.000
        costCents: 6000000, // R$ 60.000
        stateCode: "SC",
        taxRegime: "lucro_real",
      });

      // PIS: 1.65% saída - 1.65% crédito sobre custo
      // Saída: 1.65% * 100.000 = R$ 1.650
      // Crédito: 1.65% * 60.000 = R$ 990
      // Líquido: R$ 660
      expect(result.pisOnSale).toBe(66000);
      
      // COFINS: 7.6% saída - 7.6% crédito sobre custo
      // Saída: 7.6% * 100.000 = R$ 7.600
      // Crédito: 7.6% * 60.000 = R$ 4.560
      // Líquido: R$ 3.040
      expect(result.cofinsOnSale).toBe(304000);
      
      // ICMS with credit
      expect(result.icmsOnSale).toBeGreaterThan(0);
      
      // IRPJ and CSLL based on profit
      expect(result.irpj).toBeGreaterThanOrEqual(0);
      expect(result.csll).toBeGreaterThanOrEqual(0);
    });

    it("should not have negative taxes when cost exceeds revenue", () => {
      const result = calculateSaleTaxes({
        sellingPriceCents: 5000000, // R$ 50.000
        costCents: 8000000, // R$ 80.000 (prejuízo)
        stateCode: "SC",
        taxRegime: "lucro_real",
      });

      // PIS and COFINS credits should not exceed debits (min 0)
      expect(result.pisOnSale).toBe(0);
      expect(result.cofinsOnSale).toBe(0);
      // IRPJ and CSLL should be 0 when there's no profit
      expect(result.irpj).toBe(0);
      expect(result.csll).toBe(0);
    });
  });
});

describe("Target Price Analysis", () => {
  it("should identify viable target price", () => {
    const result = calculateTargetPriceAnalysis({
      targetPriceCents: 15000, // R$ 150/un
      totalCostCents: 10000, // R$ 100/un
      fobValueCents: 5000, // R$ 50/un FOB
      taxRegime: "lucro_presumido",
      stateCode: "SC",
    });

    expect(result.isViable).toBe(true);
    expect(result.grossMarginPercent).toBeGreaterThan(0);
    expect(result.cmvPercent).toBeGreaterThan(0);
    expect(result.cmvPercent).toBeLessThan(10000); // Less than 100%
  });

  it("should identify unviable target price", () => {
    const result = calculateTargetPriceAnalysis({
      targetPriceCents: 8000, // R$ 80/un (below cost)
      totalCostCents: 10000, // R$ 100/un
      fobValueCents: 5000, // R$ 50/un FOB
      taxRegime: "lucro_presumido",
      stateCode: "SC",
    });

    expect(result.isViable).toBe(false);
    expect(result.grossMarginPercent).toBeLessThan(0);
    expect(result.requiredReductionCents).toBeGreaterThan(0);
    expect(result.requiredReductionPercent).toBeGreaterThan(0);
  });

  it("should calculate CMV correctly", () => {
    const result = calculateTargetPriceAnalysis({
      targetPriceCents: 20000, // R$ 200/un
      totalCostCents: 10000, // R$ 100/un
      fobValueCents: 5000,
      taxRegime: "lucro_presumido",
      stateCode: "SC",
    });

    // CMV = Cost / Price = 100 / 200 = 50%
    expect(result.cmvPercent).toBe(5000); // 50% in basis points
  });

  it("should calculate gross margin correctly", () => {
    const result = calculateTargetPriceAnalysis({
      targetPriceCents: 20000, // R$ 200/un
      totalCostCents: 10000, // R$ 100/un
      fobValueCents: 5000,
      taxRegime: "lucro_presumido",
      stateCode: "SC",
    });

    // Gross Margin = (Price - Cost) / Price = (200 - 100) / 200 = 50%
    expect(result.grossMarginPercent).toBe(5000); // 50% in basis points
  });

  it("should calculate required reduction for unviable target", () => {
    const result = calculateTargetPriceAnalysis({
      targetPriceCents: 10000, // R$ 100/un (equal to cost)
      totalCostCents: 10000, // R$ 100/un
      fobValueCents: 5000, // R$ 50/un FOB
      taxRegime: "lucro_presumido",
      stateCode: "SC",
      desiredMarginPercent: 2000, // 20% desired margin
    });

    // With 0% gross margin and taxes, it's unviable
    expect(result.isViable).toBe(false);
    expect(result.maxPurchasePriceCents).toBeLessThan(5000); // Need to reduce FOB
    expect(result.requiredReductionCents).toBeGreaterThan(0);
  });
});

describe("Tax Regime Comparison", () => {
  const testParams = {
    sellingPriceCents: 10000000, // R$ 100.000
    costCents: 6000000, // R$ 60.000
    stateCode: "SC",
  };

  it("should show different effective rates for each regime", () => {
    const simples = calculateSaleTaxes({
      ...testParams,
      taxRegime: "simples_nacional",
      simplesAliquota: 1000, // 10%
    });

    const presumido = calculateSaleTaxes({
      ...testParams,
      taxRegime: "lucro_presumido",
    });

    const real = calculateSaleTaxes({
      ...testParams,
      taxRegime: "lucro_real",
    });

    // All should have different effective rates
    expect(simples.effectiveRate).toBe(1000); // 10% fixed
    expect(presumido.effectiveRate).toBeGreaterThan(0);
    expect(real.effectiveRate).toBeGreaterThan(0);
    
    // Both regimes should have positive effective rates
    // Note: Lucro Real may have higher or lower rate depending on profit margin and credits
    expect(presumido.effectiveRate).toBeGreaterThan(0);
    expect(real.effectiveRate).toBeGreaterThan(0);
    
    // The rates should be different (different calculation methods)
    expect(real.effectiveRate).not.toBe(presumido.effectiveRate);
  });
});
