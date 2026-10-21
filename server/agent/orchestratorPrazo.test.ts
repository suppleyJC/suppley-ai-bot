/**
 * Trava o PRAZO do chat.
 *
 * Caso real que motivou: "porcelanato 80x80" levou 7,4 minutos e 7
 * ferramentas. O servidor terminou, mas o proxy já tinha derrubado a conexão e
 * o usuário viu falha. O que precisa continuar valendo:
 *   1. ferramenta que trava é interrompida no teto e o agente segue;
 *   2. passado o prazo da rodada, a próxima chamada ao modelo é de FECHAMENTO:
 *      sem novas ferramentas (tool_choice "none") e sem busca web;
 *   3. ferramentas restantes de um lote não rodam depois do prazo, mas cada
 *      tool_use recebe seu tool_result (exigência da API).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeLLM } from "../_core/llm";
import { runTool, getToolSchemas } from "./tools";
import { runExcambiaStream } from "./orchestrator";

vi.mock("../_core/llm", () => ({ MODELS: { fast: "fast", balanced: "b", powerful: "p" }, invokeLLM: vi.fn() }));
vi.mock("./tools", () => ({ getToolSchemas: vi.fn(), runTool: vi.fn() }));
vi.mock("../db", () => ({ getLearningContext: vi.fn(async () => []) }));
vi.mock("../services/operacaoService", () => ({ getOperacaoContextoChat: vi.fn(async () => null) }));

const pergunta = { userId: 1, messages: [{ role: "user" as const, content: "Quanto custa importar porcelanato 80x80 da China?" }] };

const pedeFerramenta = (...nomes: string[]) => ({
  choices: [{
    message: {
      content: "",
      tool_calls: nomes.map((n, i) => ({ id: `t${i}`, type: "function", function: { name: n, arguments: "{}" } })),
    },
  }],
});
const responde = (texto: string) => ({ choices: [{ message: { content: texto } }] });

async function coletar(gen: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getToolSchemas).mockReturnValue([{ type: "function", function: { name: "x", parameters: {} } }] as any);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("prazo da rodada", () => {
  it("passado o prazo, fecha sem novas ferramentas — busca e raciocínio continuam DECLARADOS", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(pedeFerramenta("precificar_referencia") as any)
      .mockResolvedValueOnce(responde("Aqui está a análise.") as any);
    vi.mocked(runTool).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 45_000); // a ferramenta consumiu o prazo
      return { ok: true, summary: "ok" };
    });

    const chunks = await coletar(runExcambiaStream(pergunta));

    const fechamento = vi.mocked(invokeLLM).mock.calls[1][0];
    expect(fechamento.tool_choice).toBe("none");
    // Desligar a busca no meio do turno fez a API recusar o histórico (400) —
    // o histórico já tinha blocos de busca. O "none" é que impede novas buscas.
    expect(fechamento.webSearch).toBe(true);
    expect(fechamento.thinking).toBe(vi.mocked(invokeLLM).mock.calls[0][0].thinking);
    expect(fechamento.maxTokens).toBe(4000);
    expect(JSON.stringify(fechamento.messages)).toContain("PRAZO DE RESPOSTA ATINGIDO");
    expect(chunks.at(-1)).toMatchObject({ type: "reply", reply: "Aqui está a análise." });
  });

  it("dentro do prazo, segue normal: ferramentas e busca web disponíveis", async () => {
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(pedeFerramenta("classificar_ncm") as any)
      .mockResolvedValueOnce(responde("ok") as any);
    vi.mocked(runTool).mockResolvedValue({ ok: true, summary: "ok" });

    await coletar(runExcambiaStream(pergunta));

    const segunda = vi.mocked(invokeLLM).mock.calls[1][0];
    expect(segunda.tool_choice).toBe("auto");
    expect(segunda.webSearch).toBe(true);
  });

  it("depois do prazo, o resto do lote não roda — mas cada tool_use tem resposta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(pedeFerramenta("a", "b", "c") as any)
      .mockResolvedValueOnce(responde("fim") as any);
    vi.mocked(runTool).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 45_000);
      return { ok: true, summary: "ok" };
    });

    await coletar(runExcambiaStream(pergunta));

    expect(runTool).toHaveBeenCalledTimes(1); // só a primeira rodou
    const msgs = vi.mocked(invokeLLM).mock.calls[1][0].messages as any[];
    expect(msgs.filter((m) => m.role === "tool")).toHaveLength(3);
  });
});

describe("teto por ferramenta", () => {
  it("ferramenta que trava é interrompida e o agente segue", async () => {
    vi.useFakeTimers();
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(pedeFerramenta("dimensionar_mercado") as any)
      .mockResolvedValueOnce(responde("Segui com o que havia.") as any);
    vi.mocked(runTool).mockImplementation(() => new Promise(() => {})); // nunca resolve

    const pendente = coletar(runExcambiaStream(pergunta));
    await vi.advanceTimersByTimeAsync(26_000);
    const chunks = await pendente;

    const resultado = chunks.find((c) => c.type === "tool_result");
    expect(resultado).toMatchObject({ ok: false });
    expect(resultado.summary).toMatch(/tempo limite/);
    expect(chunks.at(-1)).toMatchObject({ type: "reply", reply: "Segui com o que havia." });
  });

  it("ferramenta que lança erro não derruba a conversa", async () => {
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(pedeFerramenta("x") as any)
      .mockResolvedValueOnce(responde("ok") as any);
    vi.mocked(runTool).mockRejectedValue(new Error("boom"));

    const chunks = await coletar(runExcambiaStream(pergunta));

    expect(chunks.find((c) => c.type === "tool_result")).toMatchObject({ ok: false });
    expect(chunks.at(-1)).toMatchObject({ type: "reply", reply: "ok" });
  });
});

describe("raciocínio profundo no fechamento", () => {
  it("não desliga o raciocínio no meio do turno — a API recusaria o histórico", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const longa = { userId: 1, messages: [{ role: "user" as const, content: "x".repeat(700) }] };
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(pedeFerramenta("classificar_ncm") as any)
      .mockResolvedValueOnce(responde("ok") as any);
    vi.mocked(runTool).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 45_000);
      return { ok: true, summary: "ok" };
    });

    await coletar(runExcambiaStream(longa));

    const [primeira, fechamento] = vi.mocked(invokeLLM).mock.calls.map((c) => c[0]);
    expect(primeira.thinking).toBe(true);
    expect(fechamento.thinking).toBe(true);
    expect(fechamento.tool_choice).toBe("none");
  });
});
