import { describe, it, expect } from "vitest";
import {
  isStatusProgression,
  shouldNotifyStatusChange,
} from "./services/quotationNotificationService";

describe("Quotation Notification Service", () => {
  describe("isStatusProgression", () => {
    it("should return true for forward progression", () => {
      expect(isStatusProgression("draft", "analyzing")).toBe(true);
      expect(isStatusProgression("analyzing", "viable")).toBe(true);
      expect(isStatusProgression("approved", "ordered")).toBe(true);
      expect(isStatusProgression("shipped", "customs")).toBe(true);
      expect(isStatusProgression("customs", "nationalized")).toBe(true);
    });

    it("should return false for backward progression", () => {
      expect(isStatusProgression("analyzing", "draft")).toBe(false);
      expect(isStatusProgression("ordered", "approved")).toBe(false);
      expect(isStatusProgression("completed", "draft")).toBe(false);
    });

    it("should return false for same status", () => {
      expect(isStatusProgression("draft", "draft")).toBe(false);
      expect(isStatusProgression("approved", "approved")).toBe(false);
    });

    it("should handle unknown statuses", () => {
      expect(isStatusProgression("unknown", "draft")).toBe(true);
      expect(isStatusProgression("draft", "unknown")).toBe(true);
    });
  });

  describe("shouldNotifyStatusChange", () => {
    it("should notify for critical status changes", () => {
      expect(shouldNotifyStatusChange("negotiating", "approved")).toBe(true);
      expect(shouldNotifyStatusChange("approved", "ordered")).toBe(true);
      expect(shouldNotifyStatusChange("ordered", "shipped")).toBe(true);
      expect(shouldNotifyStatusChange("shipped", "customs")).toBe(true);
      expect(shouldNotifyStatusChange("customs", "nationalized")).toBe(true);
      expect(shouldNotifyStatusChange("nationalized", "completed")).toBe(true);
    });

    it("should notify for cancellation", () => {
      expect(shouldNotifyStatusChange("draft", "cancelled")).toBe(true);
      expect(shouldNotifyStatusChange("approved", "cancelled")).toBe(true);
      expect(shouldNotifyStatusChange("ordered", "cancelled")).toBe(true);
    });

    it("should notify for significant progressions", () => {
      expect(shouldNotifyStatusChange("draft", "analyzing")).toBe(true);
      expect(shouldNotifyStatusChange("analyzing", "viable")).toBe(true);
    });

    it("should notify for backward changes (potential issues)", () => {
      expect(shouldNotifyStatusChange("approved", "negotiating")).toBe(true);
      expect(shouldNotifyStatusChange("ordered", "approved")).toBe(true);
    });
  });
});
