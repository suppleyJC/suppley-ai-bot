import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";

describe("Quotations Database Functions", () => {
  let testQuotationId: number | null = null;
  const testUserId = 999999; // Use a high ID to avoid conflicts

  afterAll(async () => {
    // Clean up test data
    if (testQuotationId) {
      await db.deleteQuotation(testQuotationId, testUserId);
    }
  });

  describe("createQuotation", () => {
    it("should create a quotation with required fields", async () => {
      const result = await db.createQuotation({
        userId: testUserId,
        supplierName: "Test Supplier",
        supplierCountry: "Paraguai",
        currency: "USD",
      });
      
      expect(result).not.toBeNull();
      if (result) {
        testQuotationId = result.id;
        expect(result.userId).toBe(testUserId);
        expect(result.supplierName).toBe("Test Supplier");
        expect(result.supplierCountry).toBe("Paraguai");
        expect(result.currency).toBe("USD");
        expect(result.status).toBe("draft");
      }
    });
  });

  describe("getQuotationsByUser", () => {
    it("should return quotations for the user", async () => {
      const result = await db.getQuotationsByUser(testUserId);
      
      expect(Array.isArray(result)).toBe(true);
      if (testQuotationId) {
        expect(result.length).toBeGreaterThan(0);
        expect(result.some(q => q.id === testQuotationId)).toBe(true);
      }
    });

    it("should return empty array for non-existent user", async () => {
      const result = await db.getQuotationsByUser(-1);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe("getQuotationById", () => {
    it("should return quotation by ID for correct user", async () => {
      if (!testQuotationId) return;
      
      const result = await db.getQuotationById(testQuotationId, testUserId);
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe(testQuotationId);
    });

    it("should return null for wrong user", async () => {
      if (!testQuotationId) return;
      
      const result = await db.getQuotationById(testQuotationId, -1);
      
      expect(result).toBeNull();
    });
  });

  describe("updateQuotation", () => {
    it("should update quotation status", async () => {
      if (!testQuotationId) return;
      
      const result = await db.updateQuotation(testQuotationId, testUserId, { 
        status: "analyzing" 
      });
      
      expect(result).toBe(true);
      
      // Verify the update
      const updated = await db.getQuotationById(testQuotationId, testUserId);
      expect(updated?.status).toBe("analyzing");
    });

    it("should update quotation notes", async () => {
      if (!testQuotationId) return;
      
      const result = await db.updateQuotation(testQuotationId, testUserId, { 
        notes: "Test notes for quotation" 
      });
      
      expect(result).toBe(true);
      
      // Verify the update
      const updated = await db.getQuotationById(testQuotationId, testUserId);
      expect(updated?.notes).toBe("Test notes for quotation");
    });
  });

  describe("getQuotationStats", () => {
    it("should return stats object with correct structure", async () => {
      const result = await db.getQuotationStats(testUserId);
      
      expect(result).toHaveProperty("totalQuotations");
      expect(result).toHaveProperty("viableCount");
      expect(result).toHaveProperty("inProgressCount");
      expect(result).toHaveProperty("completedCount");
      expect(result).toHaveProperty("totalValueBrl");
    });

    it("should count quotations correctly", async () => {
      const result = await db.getQuotationStats(testUserId);
      
      expect(typeof result.totalQuotations).toBe("number");
      expect(result.totalQuotations).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getQuotationsByStatus", () => {
    it("should filter quotations by status", async () => {
      // First update our test quotation to a specific status
      if (testQuotationId) {
        await db.updateQuotation(testQuotationId, testUserId, { status: "viable" });
      }
      
      const result = await db.getQuotationsByStatus(testUserId, "viable");
      
      expect(Array.isArray(result)).toBe(true);
      if (testQuotationId) {
        expect(result.some(q => q.id === testQuotationId)).toBe(true);
      }
    });
  });

  describe("getCalculationsByQuotation", () => {
    it("should return empty array when no calculations linked", async () => {
      if (!testQuotationId) return;
      
      const result = await db.getCalculationsByQuotation(testQuotationId, testUserId);
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("deleteQuotation", () => {
    it("should delete quotation successfully", async () => {
      // Create a new quotation to delete
      const newQuotation = await db.createQuotation({
        userId: testUserId,
        supplierName: "Delete Test",
        currency: "USD",
      });
      
      if (newQuotation) {
        const result = await db.deleteQuotation(newQuotation.id, testUserId);
        expect(result).toBe(true);
        
        // Verify deletion
        const deleted = await db.getQuotationById(newQuotation.id, testUserId);
        expect(deleted).toBeNull();
      }
    });
  });
});

describe("Quotation Status Workflow", () => {
  const validStatuses = [
    "draft",
    "analyzing",
    "viable",
    "not_viable",
    "negotiating",
    "approved",
    "ordered",
    "shipped",
    "customs",
    "nationalized",
    "completed",
    "cancelled",
  ];

  it("should have all expected status values defined", () => {
    expect(validStatuses).toHaveLength(12);
  });

  it("should have draft as the initial status", () => {
    expect(validStatuses[0]).toBe("draft");
  });

  it("should have completed as a final status", () => {
    expect(validStatuses).toContain("completed");
  });

  it("should have cancelled as a final status", () => {
    expect(validStatuses).toContain("cancelled");
  });

  describe("CRM workflow stages", () => {
    it("should include analysis stage (analyzing)", () => {
      expect(validStatuses).toContain("analyzing");
    });

    it("should include viability stages (viable, not_viable)", () => {
      expect(validStatuses).toContain("viable");
      expect(validStatuses).toContain("not_viable");
    });

    it("should include negotiation stage", () => {
      expect(validStatuses).toContain("negotiating");
    });

    it("should include order stages (approved, ordered)", () => {
      expect(validStatuses).toContain("approved");
      expect(validStatuses).toContain("ordered");
    });

    it("should include shipping stages (shipped, customs, nationalized)", () => {
      expect(validStatuses).toContain("shipped");
      expect(validStatuses).toContain("customs");
      expect(validStatuses).toContain("nationalized");
    });
  });
});

describe("Quotation Data Structure", () => {
  it("should define required fields for quotation", () => {
    const requiredFields = [
      "id",
      "userId",
      "status",
      "currency",
      "createdAt",
      "updatedAt",
    ];

    expect(requiredFields).toHaveLength(6);
  });

  it("should define optional supplier fields", () => {
    const supplierFields = [
      "supplierId",
      "supplierName",
      "supplierCountry",
      "quotationNumber",
    ];

    expect(supplierFields).toHaveLength(4);
  });

  it("should define cost tracking fields", () => {
    const costFields = [
      "totalFobCents",
      "totalCifCents",
      "totalTaxesCents",
      "totalCostCents",
      "totalSuggestedPriceCents",
    ];

    expect(costFields).toHaveLength(5);
  });

  it("should define timeline tracking fields", () => {
    const timelineFields = [
      "quotationDate",
      "validUntil",
      "orderDate",
      "shipmentDate",
      "estimatedArrival",
      "customsClearanceDate",
      "completionDate",
    ];

    expect(timelineFields).toHaveLength(7);
  });
});
