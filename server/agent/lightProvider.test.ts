import { afterEach, expect, it, vi } from "vitest";
import { runLightTurn } from "./lightTurn";
import { invokeLLM } from "../_core/llm";
import { invokeDeepSeek } from "../_core/deepseek";
const reply = { choices: [{ message: { content: "Olá!" } }] };
vi.mock("../_core/llm", () => ({ MODELS: { fast: "haiku" }, invokeLLM: vi.fn(async () => reply) }));
vi.mock("../_core/deepseek", () => ({ invokeDeepSeek: vi.fn(async () => reply) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("should preserve Anthropic when no provider is configured", async () => {
  vi.stubEnv("LIGHT_LLM_PROVIDER", undefined);
  await runLightTurn("oi");
  expect(invokeLLM).toHaveBeenCalledOnce();
  expect(invokeDeepSeek).not.toHaveBeenCalled();
});
it("should use DeepSeek only when explicitly enabled", async () => {
  vi.stubEnv("LIGHT_LLM_PROVIDER", "deepseek");
  await runLightTurn("oi");
  expect(invokeDeepSeek).toHaveBeenCalledOnce();
  expect(invokeLLM).not.toHaveBeenCalled();
});
it("should reject an invalid provider without sending data", async () => {
  vi.stubEnv("LIGHT_LLM_PROVIDER", "invalid");
  await expect(runLightTurn("oi")).rejects.toThrow("Invalid LIGHT_LLM_PROVIDER");
  expect(invokeDeepSeek).not.toHaveBeenCalled();
  expect(invokeLLM).not.toHaveBeenCalled();
});
