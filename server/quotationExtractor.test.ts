import { describe, it, expect, vi } from "vitest";
import { extractQuotationFromPdf, normalizeExtractedProducts } from "./services/quotationExtractorService";

describe("QuotationExtractor", () => {
  describe("normalizeExtractedProducts", () => {
    it("should normalize product data correctly", () => {
      const products = [
        {
          productName: "  Clavo con cabeza 10 x 10  ",
          sku: "1 x 18",
          ncmCode: "7317.00.90",
          quantity: 1,
          unit: "kilogram",
          unitPrice: 1.20,
          totalPrice: 1200,
          currency: "USD",
        },
      ];

      const normalized = normalizeExtractedProducts(products);

      expect(normalized[0].productName).toBe("Clavo con cabeza 10 x 10");
      expect(normalized[0].unit).toBe("KG");
      expect(normalized[0].ncmCode).toBe("73170090");
    });

    it("should handle missing NCM codes", () => {
      const products = [
        {
          productName: "Test Product",
          quantity: 10,
          unit: "UN",
          unitPrice: 5,
          totalPrice: 50,
          currency: "USD",
        },
      ];

      const normalized = normalizeExtractedProducts(products);

      expect(normalized[0].ncmCode).toBeUndefined();
    });

    it("should normalize various unit formats", () => {
      const testCases = [
        { input: "kg", expected: "KG" },
        { input: "KILOGRAM", expected: "KG" },
        { input: "tonelada", expected: "TON" },
        { input: "UNIDADE", expected: "UN" },
        { input: "peça", expected: "PC" },
        { input: "caixa", expected: "CX" },
      ];

      testCases.forEach(({ input, expected }) => {
        const products = [
          {
            productName: "Test",
            quantity: 1,
            unit: input,
            unitPrice: 1,
            totalPrice: 1,
            currency: "USD",
          },
        ];
        const normalized = normalizeExtractedProducts(products);
        expect(normalized[0].unit).toBe(expected);
      });
    });
  });

  describe("extractQuotationFromPdf", () => {
    it("should throw error for invalid URL", async () => {
      await expect(extractQuotationFromPdf("")).rejects.toThrow("URL do PDF inválida");
      await expect(extractQuotationFromPdf("not-a-url")).rejects.toThrow("URL do PDF inválida");
    });
  });
});
