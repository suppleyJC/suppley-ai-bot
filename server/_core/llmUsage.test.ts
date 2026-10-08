import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/usageDb", () => ({ recordLlmUsage: vi.fn(async () => {}) }));
import { recordLlmUsage } from "../db/usageDb";
import { invokeLLM } from "./llm";

const usage = { input_tokens: 100, output_tokens: 20,
  cache_creation_input_tokens: 300, cache_read_input_tokens: 500 };
const request = { messages: [{ role: "user" as const, content: "test" }] };

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
  vi.mocked(recordLlmUsage).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200,
    json: async () => ({ id: "test", model: "returned-model", usage,
      content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }) }));
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("LLM usage recording", () => {
  it("stores API counters separately and includes cache in total tokens", async () => {
    const result = await invokeLLM(request);
    expect(recordLlmUsage).toHaveBeenCalledExactlyOnceWith({ model: "returned-model",
      promptTokens: 100, completionTokens: 20, cacheCreationTokens: 300, cacheReadTokens: 500 });
    expect(result.usage?.total_tokens).toBe(920);
    expect(result.usage?.cache_read_input_tokens).toBe(500);
  });
  it("waits for recording before returning the response", async () => {
    let release!: () => void;
    vi.mocked(recordLlmUsage).mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    let finished = false;
    const pending = invokeLLM(request).then(() => { finished = true; });
    await vi.waitFor(() => expect(recordLlmUsage).toHaveBeenCalled());
    expect(finished).toBe(false);
    release();
    await pending;
    expect(finished).toBe(true);
  });
  it("preserves the answer and reports recording failure without exposing the error", async () => {
    vi.mocked(recordLlmUsage).mockRejectedValue(new Error("sensitive connection details"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await invokeLLM(request);
    expect(result.choices[0].message.content).toBe("ok");
    expect(warn).toHaveBeenCalledWith("[usage:record-failed]", { model: "returned-model" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive");
  });
});
