import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          suggestions: [
            { code: "8471.30.19", description: "Computadores portáteis", confidence: 0.95 },
            { code: "8471.30.11", description: "Notebooks", confidence: 0.80 }
          ]
        })
      }
    }]
  })
}));

// Mock the db module
vi.mock("../db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue([]),
  }),
}));

describe("NCM Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Exports", () => {
    it("should export clearNCMCaches function", async () => {
      const ncmService = await import("./ncmService");
      expect(ncmService.clearNCMCaches).toBeDefined();
      expect(typeof ncmService.clearNCMCaches).toBe("function");
    });

    it("should export searchNCMs function", async () => {
      const ncmService = await import("./ncmService");
      expect(ncmService.searchNCMs).toBeDefined();
      expect(typeof ncmService.searchNCMs).toBe("function");
    });

    it("should export suggestNCMWithAI function", async () => {
      const ncmService = await import("./ncmService");
      expect(ncmService.suggestNCMWithAI).toBeDefined();
      expect(typeof ncmService.suggestNCMWithAI).toBe("function");
    });

    it("should export suggestNCMBatch function", async () => {
      const ncmService = await import("./ncmService");
      expect(ncmService.suggestNCMBatch).toBeDefined();
      expect(typeof ncmService.suggestNCMBatch).toBe("function");
    });

    it("should export getNCMByCode function", async () => {
      const ncmService = await import("./ncmService");
      expect(ncmService.getNCMByCode).toBeDefined();
      expect(typeof ncmService.getNCMByCode).toBe("function");
    });
  });

  describe("searchNCMs", () => {
    it("should return empty array for empty query", async () => {
      const ncmService = await import("./ncmService");
      const results = await ncmService.searchNCMs("");
      expect(results).toEqual([]);
    });

    it("should return results for valid query", async () => {
      const ncmService = await import("./ncmService");
      // searchNCMs returns whatever the DB returns (mocked as empty)
      const results = await ncmService.searchNCMs("computador");
      expect(results).toBeDefined();
    });
  });

  describe("tokenizarBuscaNcm", () => {
    it("quebra o nome real do rodapé em termos que casam com a TEC", async () => {
      const ncmService = await import("./ncmService");
      const termos = ncmService.tokenizarBuscaNcm(
        "WPC Skirting / Rodapé WPC com acabamento PVC (2,4m)",
      );
      expect(termos).toContain("rodapé");
      expect(termos).toContain("skirting");
      expect(termos).toContain("pvc");
      // medidas e stopwords não viram termo de busca
      expect(termos).not.toContain("com");
      expect(termos).not.toContain("acabamento");
      expect(termos.join(" ")).not.toMatch(/\d/);
    });

    it("descarta termos curtos, deduplica e limita a 6 termos", async () => {
      const ncmService = await import("./ncmService");
      const termos = ncmService.tokenizarBuscaNcm("aa de pvc pvc tubo");
      expect(termos).toEqual(expect.arrayContaining(["pvc", "tubo"]));
      expect(termos.filter((t: string) => t === "pvc")).toHaveLength(1);
      expect(termos.length).toBeLessThanOrEqual(6);
      expect(termos).not.toContain("aa");
      expect(termos).not.toContain("de");
    });

    it("query vazia ou só medidas retorna lista vazia", async () => {
      const ncmService = await import("./ncmService");
      expect(ncmService.tokenizarBuscaNcm("")).toEqual([]);
      expect(ncmService.tokenizarBuscaNcm("2,4m 10mm 3x25kg")).toEqual([]);
    });
  });

  describe("clearNCMCaches", () => {
    it("should clear caches without errors", async () => {
      const ncmService = await import("./ncmService");
      expect(() => ncmService.clearNCMCaches()).not.toThrow();
    });
  });

  describe("suggestNCMBatch", () => {
    it("should handle empty batch", async () => {
      const ncmService = await import("./ncmService");
      const results = await ncmService.suggestNCMBatch([]);
      // Returns an empty Map for empty input
      expect(results).toBeDefined();
      expect(results.size).toBe(0);
    });
  });
});
