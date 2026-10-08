import { ENV } from "./env";
import { recordLlmUsage } from "../db/usageDb";
import type { InvokeParams, InvokeResult } from "./llm";

/** Initial integration deliberately supports only bounded, text-only light turns. */
export async function invokeDeepSeek(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.deepseekApiKey.trim()) throw new Error("DEEPSEEK_API_KEY is not configured");
  if (params.tools?.length || params.webSearch || params.thinking || params.outputSchema ||
      params.output_schema || params.responseFormat || params.response_format ||
      params.messages.some(m => !["system", "user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" || m.tool_calls?.length || m.raw_content?.length)) {
    throw new Error("DeepSeek light integration supports plain text only");
  }
  const maxTokens = params.maxTokens ?? params.max_tokens ?? 256;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 256) {
    throw new Error("DeepSeek light output limit must be between 1 and 256");
  }
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${ENV.deepseekApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-flash", messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens, stream: false, thinking: { type: "disabled" } }),
  });
  // Do not put provider error bodies, keys or prompts in application logs.
  if (!response.ok) throw new Error(`DeepSeek request failed (HTTP ${response.status})`);
  const data = await response.json();
  const choice = data.choices?.[0];
  if (typeof choice?.message?.content !== "string" || !choice.message.content.trim() ||
      choice.message.tool_calls?.length || choice.finish_reason !== "stop" ||
      typeof data.model !== "string" || !data.model.startsWith("deepseek-")) {
    throw new Error("Invalid or incomplete DeepSeek light response");
  }
  const u = data.usage;
  let usage: InvokeResult["usage"];
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const cached = u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? 0;
  if (valid(u?.prompt_tokens) && valid(u?.completion_tokens) && valid(cached) && cached <= u.prompt_tokens) {
    usage = { prompt_tokens: u.prompt_tokens - cached, completion_tokens: u.completion_tokens,
      cache_creation_input_tokens: 0, cache_read_input_tokens: cached,
      total_tokens: u.prompt_tokens + u.completion_tokens };
    try {
      await recordLlmUsage({ model: data.model, source: "deepseek-light",
        promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
        cacheCreationTokens: 0, cacheReadTokens: cached });
    } catch { console.warn("[usage:record-failed]", { model: data.model }); }
  } else { console.warn("[usage:missing]", { model: data.model }); }
  return { id: data.id ?? "", created: data.created ?? Math.floor(Date.now() / 1000), model: data.model,
    choices: [{ index: 0, message: { role: "assistant", content: choice.message.content }, finish_reason: "stop" }], usage };
}
