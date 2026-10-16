import { describe, expect, it, vi } from "vitest";
import { runLightTurn, lightTurnText } from "./lightTurn";
import { invokeLLM, MODELS } from "../_core/llm";
import { runExcambia, runExcambiaStream } from "./orchestrator";
vi.mock("../_core/llm", () => ({ MODELS: { fast: "fast" }, invokeLLM: vi.fn() }));
vi.mock("./tools", () => ({ getToolSchemas: vi.fn(), runTool: vi.fn() }));
vi.mock("../db", () => ({ getLearningContext: vi.fn(() => { throw new Error("Full context must not load"); }) }));
vi.mock("../services/operacaoService", () => ({ getOperacaoContextoChat: vi.fn() }));

const input = (text: string) => ({ messages: [{ role: "user" as const, content: text }] });
describe("light conversation route", () => {
  it.each(["Oi!", "Obrigado", 'Teste de duplicação. Responda apenas “Teste recebido”. Não crie operação nem envie cotações.'])
  ("should accept isolated no-action messages: %s", text => expect(lightTurnText(input(text))).toBe(text));
  it.each(["sim", "ok", "continue", "Calcule o CIF", "Obrigado, envie a cotação", "Teste. Exclua o pedido", 'Teste. Responda apenas “ok”. Calcule o frete.'])
  ("should preserve the full route for substantive or ambiguous messages: %s", text => expect(lightTurnText(input(text))).toBeUndefined());
  it("should preserve operations, attachments and prior conversations", () => {
    expect(lightTurnText({ ...input("oi"), operacaoId: 1 })).toBeUndefined();
    expect(lightTurnText({ ...input("oi"), anexo: {} })).toBeUndefined();
    expect(lightTurnText({ messages: [{ role: "assistant", content: "Confirma o pedido?" }, ...input("oi").messages] })).toBeUndefined();
  });
  it("should call a small model without tools or web and return the actual answer", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: "Olá!" } }] } as any);
    expect(await runLightTurn("oi")).toEqual({ reply: "Olá!", toolsUsed: [], toolResults: [] });
    const call = vi.mocked(invokeLLM).mock.calls.at(-1)![0];
    expect(call.model).toBe(MODELS.fast);
    expect(call.webSearch).toBe(false);
    expect(call.tools).toBeUndefined();
    expect(call.maxTokens).toBe(256);
    expect(JSON.stringify(call.messages).length).toBeLessThan(1000);
  });
  it("should use the light route through both production entry points", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: "Olá!" } }] } as any);
    expect((await runExcambia({ userId: 1, ...input("oi") })).reply).toBe("Olá!");
    const chunks = [];
    for await (const chunk of runExcambiaStream({ userId: 1, ...input("oi") })) chunks.push(chunk);
    expect(chunks).toEqual([
      { type: "thinking", content: "Pensando..." },
      { type: "reply", reply: "Olá!", toolsUsed: [], toolResults: [] },
    ]);
  });
});
