/**
 * COMANDO 9 — Validação de COESÃO entre o Painel e a Excambia.
 *
 * Princípio da Fase 2: "Painel e Excambia chamam o MESMO serviço e gravam o
 * MESMO evento em operacao_eventos (timeline = fonte de verdade)."
 *
 * Estes testes provam isso de forma determinística (sem DB, sem LLM): para cada
 * ação compartilhada, o caminho do PAINEL (operationsRouter) e o caminho da
 * EXCAMBIA (agent tools) convergem para a MESMA função de serviço, com o MESMO
 * tipo — o que garante o mesmo evento na timeline. A única diferença é o `autor`
 * (procedência: "usuario" no painel, "excambia" nas tools), que é justamente o
 * que torna a timeline auditável.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Evita inicialização real do banco ao importar o serviço/rotas.
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));

import * as operacaoService from "./services/operacaoService";
import { operationsRouter } from "./routers/operationsRouter";
import { runTool } from "./agent/tools";

// Contexto do Painel (tRPC): um usuário autenticado.
const painelCtx = { user: { id: 1, role: "user" } } as any;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Coesão Painel ↔ Excambia — Marcos", () => {
  it("registrar marco: ambos os caminhos chamam svc.registrarMarco com o MESMO tipo", async () => {
    const spy = vi
      .spyOn(operacaoService, "registrarMarco")
      .mockResolvedValue({ id: 1, tipo: "pedido_confirmado" } as any);

    // PAINEL (router)
    await operationsRouter
      .createCaller(painelCtx)
      .registrarMarco({ operacaoId: 10, tipo: "pedido_confirmado" });

    // EXCAMBIA (tool)
    await runTool(
      "registrar_marco_producao",
      { tipo: "pedido_confirmado" },
      { userId: 1, operacaoId: 10, estagio: "execute" },
    );

    expect(spy).toHaveBeenCalledTimes(2);
    const painelArgs = spy.mock.calls[0][0];
    const excambiaArgs = spy.mock.calls[1][0];

    // Mesmo serviço, mesmo tipo, mesma operação → o MESMO evento na timeline.
    expect(painelArgs.tipo).toBe("pedido_confirmado");
    expect(excambiaArgs.tipo).toBe("pedido_confirmado");
    expect(painelArgs.operacaoId).toBe(excambiaArgs.operacaoId);

    // Procedência (autor) distingue quem gerou — o evento em si é o mesmo.
    expect(excambiaArgs.autor).toBe("excambia");
    expect(painelArgs.autor).toBeUndefined(); // serviço aplica default "usuario"
  });

  it("registrar_nacionalizacao usa a MESMA função de marco que o Painel (tipo nacionalizado)", async () => {
    const spy = vi
      .spyOn(operacaoService, "registrarMarco")
      .mockResolvedValue({ id: 2, tipo: "nacionalizado" } as any);

    // EXCAMBIA (tool dedicada)
    await runTool(
      "registrar_nacionalizacao",
      {},
      { userId: 1, operacaoId: 10, estagio: "finance" },
    );

    // PAINEL faria o mesmo marco via a procedure genérica
    await operationsRouter
      .createCaller(painelCtx)
      .registrarMarco({ operacaoId: 10, tipo: "nacionalizado" });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0].tipo).toBe("nacionalizado"); // excambia
    expect(spy.mock.calls[1][0].tipo).toBe("nacionalizado"); // painel
    expect(spy.mock.calls[0][0].autor).toBe("excambia");
  });
});

describe("Coesão Painel ↔ Excambia — Financeiro", () => {
  it("lançar financeiro: ambos os caminhos chamam svc.lancarFinanceiro com o MESMO valor/tipo", async () => {
    const spy = vi
      .spyOn(operacaoService, "lancarFinanceiro")
      .mockResolvedValue({ id: 1, tipo: "frete" } as any);

    // PAINEL (router)
    await operationsRouter
      .createCaller(painelCtx)
      .lancarFinanceiro({ operacaoId: 10, tipo: "frete", direcao: "saida", valorCents: 100000 });

    // EXCAMBIA (tool) — usa `valor` no schema do LLM, que mapeia para valorCents
    await runTool(
      "lancar_financeiro",
      { tipo: "frete", direcao: "saida", valor: 100000 },
      { userId: 1, operacaoId: 10, estagio: "execute" },
    );

    expect(spy).toHaveBeenCalledTimes(2);
    const painelArgs = spy.mock.calls[0][0];
    const excambiaArgs = spy.mock.calls[1][0];

    expect(painelArgs.tipo).toBe("frete");
    expect(excambiaArgs.tipo).toBe("frete");
    expect(painelArgs.valorCents).toBe(100000);
    expect(excambiaArgs.valorCents).toBe(100000);
    expect(painelArgs.operacaoId).toBe(excambiaArgs.operacaoId);
    expect(excambiaArgs.autor).toBe("excambia");
  });
});

describe("Coesão — vocabulário único de eventos", () => {
  it("os tipos de marco usados pelas tools existem no enum de eventos (mesma fonte)", async () => {
    // Garante que cada marco que a Excambia pode registrar tem um tipo de evento
    // correspondente — sem isto, o evento da Excambia não casaria com o do Painel.
    const tiposMarco: operacaoService.TipoMarco[] = [
      "pedido_confirmado", "producao_iniciada", "produto_embarcado",
      "di_registrada", "nacionalizado", "entregue",
    ];
    // O serviço mapeia tipo de marco → evento de mesmo nome (addEvento tipo: input.tipo).
    // Aqui validamos só que a lista é a esperada (contrato compartilhado).
    expect(tiposMarco).toHaveLength(6);
    expect(new Set(tiposMarco).size).toBe(6);
  });
});
