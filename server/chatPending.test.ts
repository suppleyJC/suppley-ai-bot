import { describe, expect, it } from "vitest";
import { visiblePendingMessages, type PendingMessage } from "../client/src/lib/chatPending";

describe("chat provisional messages", () => {
  const pending: PendingMessage = { id: "opt-1", content: "Teste", conversationId: 7, previousIds: [1] };
  it("shows the provisional message until persisted", () => {
    expect(visiblePendingMessages([pending], [], 7)).toEqual([pending]);
  });
  it("replaces the provisional bubble when the query refreshes during streaming", () => {
    expect(visiblePendingMessages([pending], [{ id: 2, role: "user", content: "Teste" }], 7)).toEqual([]);
  });
  it("preserves deliberate repeats of historical messages", () => {
    expect(visiblePendingMessages([pending], [{ id: 1, role: "user", content: "Teste" }], 7)).toEqual([pending]);
  });
  it("does not match an assistant message or another conversation", () => {
    expect(visiblePendingMessages([pending], [{ id: 2, role: "assistant", content: "Teste" }], 7)).toEqual([pending]);
    expect(visiblePendingMessages([pending], [], 8)).toEqual([]);
  });
  it("reconciles attachments with their persisted marker", () => {
    const attachment = { ...pending, content: "Anexo: teste.csv\n\nConfira" };
    expect(visiblePendingMessages([attachment], [{ id: 2, role: "user", content: attachment.content }], 7)).toEqual([]);
  });
});
