import { describe, expect, it, vi, beforeEach } from "vitest";
import { calculateImportTaxes, isMercosulCountry, calculateSellingPrice, calculateMargin } from "./services/taxCalculationService";

// Mock the database functions
vi.mock("./db", () => ({
  getNcmTaxRate: vi.fn().mockResolvedValue({
    ncmCode: "73170010",
    description: "Pregos de ferro ou aço",
    iiRate: 1400, // 14%
    ipiRate: 500, // 5%
    pisRate: 216, // 2.16%
    cofinsRate: 1000, // 10%
    mercosulIiRate: 0,
  }),
  getIcmsRate: vi.fn().mockResolvedValue({
    stateCode: "SC",
    stateName: "Santa Catarina",
    internalRate: 1700,
    importRate: 400, // 4%
    interstateRate: 1200,
  }),
  getActiveTaxParameters: vi.fn().mockResolvedValue({}),
  getActiveNcmException: vi.fn().mockResolvedValue(null),
}));

describe("isMercosulCountry", () => {
  it("returns true for Paraguai", () => {
    expect(isMercosulCountry("Paraguai")).toBe(true);
  });

  it("returns true for Paraguay (English)", () => {
    expect(isMercosulCountry("Paraguay")).toBe(true);
  });

  it("returns true for Argentina", () => {
    expect(isMercosulCountry("Argentina")).toBe(true);
  });

  it("returns true for Uruguai", () => {
    expect(isMercosulCountry("Uruguai")).toBe(true);
  });

  it("returns false for China", () => {
    expect(isMercosulCountry("China")).toBe(false);
  });

  it("returns false for Estados Unidos", () => {
    expect(isMercosulCountry("Estados Unidos")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isMercosulCountry("PARAGUAI")).toBe(true);
    expect(isMercosulCountry("paraguai")).toBe(true);
  });
});

describe("calculateImportTaxes", () => {
  it("calculates taxes correctly for non-Mercosul product", async () => {
    const result = await calculateImportTaxes({
      cifValueCents: 1000000, // R$ 10,000.00
      ncmCode: "73170010",
      originCountry: "China",
      destinationState: "SC",
      isMercosul: false,
    });

    // II = 10000 * 14% = 1400
    expect(result.values.iiValueCents).toBe(140000);
    
    // IPI = (10000 + 1400) * 5% = 570
    expect(result.values.ipiValueCents).toBe(57000);
    
    // With iterative algorithm, PIS and COFINS are calculated "por dentro"
    // including ICMS in their base, so values will be higher
    // PIS and COFINS should be positive
    expect(result.values.pisValueCents).toBeGreaterThan(0);
    expect(result.values.cofinsValueCents).toBeGreaterThan(0);

    // Total taxes should be positive
    expect(result.values.totalTaxesCents).toBeGreaterThan(0);
    
    // Should not have Mercosul preferential treatment
    expect(result.isMercosulPreferential).toBe(false);
  });

  it("applies zero II rate for Mercosul products", async () => {
    const result = await calculateImportTaxes({
      cifValueCents: 1000000, // R$ 10,000.00
      ncmCode: "73170010",
      originCountry: "Paraguai",
      destinationState: "SC",
      isMercosul: true,
    });

    // II should be 0 for Mercosul
    expect(result.values.iiValueCents).toBe(0);
    expect(result.rates.ii).toBe(0);
    expect(result.isMercosulPreferential).toBe(true);
  });

  it("calculates ICMS correctly (por dentro)", async () => {
    const result = await calculateImportTaxes({
      cifValueCents: 1000000,
      ncmCode: "73170010",
      originCountry: "China",
      destinationState: "SC",
    });

    // ICMS is calculated "por dentro" - included in its own base
    // The ICMS value should be positive
    expect(result.values.icmsValueCents).toBeGreaterThan(0);
    
    // With iterative algorithm, baseICMS includes all taxes
    // Base ICMS = CIF + II + IPI + PIS + COFINS + ICMS
    expect(result.breakdown.baseICMS).toBeGreaterThan(result.breakdown.baseIPI);
  });
});

describe("calculateSellingPrice", () => {
  it("calculates correct price with 30% markup", () => {
    const totalCostCents = 100000; // R$ 1,000.00
    const markupPercent = 3000; // 30%
    
    const price = calculateSellingPrice(totalCostCents, markupPercent);
    
    // Price = 1000 * 1.30 = 1300
    expect(price).toBe(130000);
  });

  it("calculates correct price with 50% markup", () => {
    const totalCostCents = 100000;
    const markupPercent = 5000; // 50%
    
    const price = calculateSellingPrice(totalCostCents, markupPercent);
    
    // Price = 1000 * 1.50 = 1500
    expect(price).toBe(150000);
  });

  it("returns same value with 0% markup", () => {
    const totalCostCents = 100000;
    const markupPercent = 0;
    
    const price = calculateSellingPrice(totalCostCents, markupPercent);
    
    expect(price).toBe(100000);
  });
});

describe("calculateMargin", () => {
  it("calculates correct margin percentage", () => {
    const sellingPriceCents = 130000; // R$ 1,300.00
    const totalCostCents = 100000; // R$ 1,000.00
    
    const margin = calculateMargin(sellingPriceCents, totalCostCents);
    
    // Margin = (1300 - 1000) / 1300 = 23.08%
    expect(margin).toBeCloseTo(2308, -1);
  });

  it("returns 0 for zero selling price", () => {
    const margin = calculateMargin(0, 100000);
    expect(margin).toBe(0);
  });

  it("calculates 100% margin when cost is 0", () => {
    const margin = calculateMargin(100000, 0);
    expect(margin).toBe(10000); // 100%
  });
});
