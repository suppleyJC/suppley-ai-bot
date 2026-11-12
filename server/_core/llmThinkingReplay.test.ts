/**
 * Trava o REPLAY dos blocos de raciocínio no loop de ferramentas.
 *
 * A Anthropic assina os blocos de thinking e os valida EM CONJUNTO — ordem
 * inclusive. Remontar a mensagem do assistente por categoria (thinking → texto
 * → tool_use) reordena os blocos quando o modelo intercala raciocínio entre
 * chamadas, e a API derruba a requisição inteira com:
 *
 *   400 — "`thinking` or `redacted_thinking` blocks in the latest assistant
 *          message cannot be modified."
 *
 * Foi exatamente o que quebrou o cálculo a partir de uma cotação anexada: o
 * turno pedia ferramenta, o raciocínio vinha intercalado, e a devolução chegava
 * reordenada. Estes testes garantem que o conteúdo volta VERBATIM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/usageDb", () => ({ recordLlmUsage: vi.fn(async () => {}) }));

import { invokeLLM, type Message } from "./llm";

/** Resposta mínima da API, com o conteúdo bruto que queremos ver replayado. */
function respostaComConteudo(content: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "msg_1",
      model: "claude-opus-5",
      content,
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  };
}

/** Ordem REAL de um turno com raciocínio intercalado entre chamadas. */
const CONTEUDO_INTERCALADO = [
  { type: "thinking", thinking: "primeiro passo", signature: "sig-a" },
  { type: "tool_use", id: "call_1", name: "buscar", input: { q: 1 } },
  { type: "thinking", thinking: "segundo passo", signature: "sig-b" },
  { type: "text", text: "vou checar outra coisa" },
  { type: "tool_use", id: "call_2", name: "calcular", input: { q: 2 } },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Corpo JSON enviado na n-ésima chamada à API. */
function corpoEnviado(n = 0) {
  return JSON.parse(fetchMock.mock.calls[n][1].body as string);
}

describe("replay de blocos de raciocínio", () => {
  it("expõe o conteúdo bruto da resposta para o chamador devolver intacto", async () => {
    fetchMock.mockResolvedValue(respostaComConteudo(CONTEUDO_INTERCALADO));

    const r = await invokeLLM({ messages: [{ role: "user", content: "oi" }] });

    expect(r.choices[0].message.raw_content).toEqual(CONTEUDO_INTERCALADO);
  });

  it("devolve o turno VERBATIM — mesma ordem, nada descartado", async () => {
    fetchMock.mockResolvedValue(respostaComConteudo([{ type: "text", text: "ok" }]));

    const assistente: Message = {
      role: "assistant",
      content: "vou checar outra coisa",
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "buscar", arguments: '{"q":1}' } },
        { id: "call_2", type: "function", function: { name: "calcular", arguments: '{"q":2}' } },
      ],
      raw_content: CONTEUDO_INTERCALADO,
    };

    await invokeLLM({
      messages: [
        { role: "user", content: "calcula" },
        assistente,
        { role: "tool", tool_call_id: "call_1", content: '{"ok":true}' },
      ],
    });

    const enviado = corpoEnviado();
    const doAssistente = enviado.messages.find((m: any) => m.role === "assistant");

    // Verbatim: qualquer reordenação ou perda de bloco invalida a assinatura.
    expect(doAssistente.content).toEqual(CONTEUDO_INTERCALADO);
  });

  it("preserva blocos da pesquisa web nativa, que a remontagem descartava", async () => {
    fetchMock.mockResolvedValue(respostaComConteudo([{ type: "text", text: "ok" }]));

    const comBuscaWeb = [
      { type: "thinking", thinking: "preciso pesquisar", signature: "sig-c" },
      { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "tec ncm" } },
      { type: "web_search_tool_result", tool_use_id: "srv_1", content: [{ type: "web_search_result", url: "https://x", title: "T" }] },
      { type: "tool_use", id: "call_9", name: "classificar", input: {} },
    ];

    await invokeLLM({
      messages: [
        { role: "user", content: "classifica" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "call_9", type: "function", function: { name: "classificar", arguments: "{}" } },
          ],
          raw_content: comBuscaWeb,
        },
        { role: "tool", tool_call_id: "call_9", content: '{"ok":true}' },
      ],
    });

    const doAssistente = corpoEnviado().messages.find((m: any) => m.role === "assistant");
    expect(doAssistente.content).toEqual(comBuscaWeb);
  });

  it("sem raw_content (histórico antigo), ainda monta uma mensagem válida", async () => {
    fetchMock.mockResolvedValue(respostaComConteudo([{ type: "text", text: "ok" }]));

    await invokeLLM({
      messages: [
        { role: "user", content: "e aí" },
        {
          role: "assistant",
          content: "consultando",
          tool_calls: [
            { id: "call_x", type: "function", function: { name: "buscar", arguments: '{"a":1}' } },
          ],
        },
        { role: "tool", tool_call_id: "call_x", content: '{"ok":true}' },
      ],
    });

    const doAssistente = corpoEnviado().messages.find((m: any) => m.role === "assistant");
    expect(doAssistente.content).toEqual([
      { type: "text", text: "consultando" },
      { type: "tool_use", id: "call_x", name: "buscar", input: { a: 1 } },
    ]);
  });
});
