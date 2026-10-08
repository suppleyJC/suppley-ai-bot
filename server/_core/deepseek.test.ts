import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeDeepSeek } from "./deepseek";
import { recordLlmUsage } from "../db/usageDb";
vi.mock("../db/usageDb", () => ({ recordLlmUsage: vi.fn().mockResolvedValue(undefined) }));
const params = { messages: [{ role: "user" as const, content: "oi" }] };
const response = { id: "test", model: "deepseek-flash", choices: [{ finish_reason: "stop", message: { content: "Olá!" } }],
  usage: { prompt_tokens: 100, completion_tokens: 5, prompt_cache_hit_tokens: 60 } };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(status = 200, body: unknown = response) {
  vi.stubEnv("DEEPSEEK_API_KEY", "secret-for-test");
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
describe("DeepSeek bounded adapter", () => {
  it("should require an explicitly configured key without calling the API", async () => {
    const fetcher = setup(); vi.stubEnv("DEEPSEEK_API_KEY", "");
    await expect(invokeDeepSeek(params)).rejects.toThrow("not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("should use the official endpoint without thinking or provider-specific fields", async () => {
    const fetcher = setup(); const result = await invokeDeepSeek(params);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(JSON.parse(request.body)).toMatchObject({ model: "deepseek-flash", max_tokens: 256, thinking: { type: "disabled" } });
    expect(result.usage).toMatchObject({ prompt_tokens: 40, cache_read_input_tokens: 60, total_tokens: 105 });
    expect(recordLlmUsage).toHaveBeenCalledWith(expect.objectContaining({ source: "deepseek-light", promptTokens: 40, cacheReadTokens: 60 }));
  });
  it("should redact provider errors and avoid recording failed calls", async () => {
    setup(402, { error: "secret-for-test private prompt" });
    await expect(invokeDeepSeek(params)).rejects.toThrow(/^DeepSeek request failed \(HTTP 402\)$/);
    expect(recordLlmUsage).not.toHaveBeenCalled();
  });
  it("should reject unsupported capabilities before sending", async () => {
    const fetcher = setup();
    await expect(invokeDeepSeek({ ...params, webSearch: true })).rejects.toThrow("plain text only");
    await expect(invokeDeepSeek({ ...params, maxTokens: 16000 })).rejects.toThrow("output limit");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("should reject truncated output", async () => {
    setup(200, { ...response, choices: [{ finish_reason: "length", message: { content: "partial" } }] });
    await expect(invokeDeepSeek(params)).rejects.toThrow("incomplete");
  });
});
