/**
 * Trava a RESILIÊNCIA do Comex Stat diante de estrangulamento.
 *
 * O defeito que estes testes impedem: sob 429, o serviço tentava até 6
 * requisições por consulta (3 formatos × 2), cada uma com retentativas de
 * 2+4+8 s, e o `catch {}` engolia tudo e devolvia `[]`. Resultado: minutos de
 * espera e o agente dizendo "não há importação deste produto no Brasil".
 *
 * O que precisa continuar valendo:
 *   1. 429 vira `erro` explícito — nunca "sem dados";
 *   2. falha de consulta NÃO dispara os formatos alternativos;
 *   3. depois de um 429 persistente, o disjuntor responde na hora, sem rede;
 *   4. resposta bem-sucedida é cacheada — inclusive vazia, que é um fato.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  consultarComexPorNcm,
  dimensionarMercadoComex,
  resetComexEstado,
  MSG_COMEX_INDISPONIVEL,
} from "./comexStatService";

function resp(status: number, body: unknown = { data: { list: [] } }): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  resetComexEstado();
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("429 vira erro explícito, não ausência de dado", () => {
  it("consulta por NCM devolve `erro` e não finge que não há fluxo", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(429));

    const r = await consultarComexPorNcm({ ncm: "28369920" });

    expect(r.disponivel).toBe(false);
    expect(r.erro).toBe(MSG_COMEX_INDISPONIVEL);
    expect(r.erro).toMatch(/NÃO significa ausência de importação/);
  });

  it("dimensionamento devolve `erro` com o motivo certo", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(429));

    const r = await dimensionarMercadoComex({
      ncms: ["28369920"], anos: [2025], hoje: new Date("2026-10-19"),
    });

    expect(r.disponivel).toBe(false);
    expect(r.erro).toBe(MSG_COMEX_INDISPONIVEL);
  });

  it("HTTP 500 também é falha de consulta, não 'sem dados'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(500));
    const r = await consultarComexPorNcm({ ncm: "28369920" });
    expect(r.erro).toBe(MSG_COMEX_INDISPONIVEL);
  });

  it("falha de rede também", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    const r = await consultarComexPorNcm({ ncm: "28369920" });
    expect(r.erro).toBe(MSG_COMEX_INDISPONIVEL);
  });

  it("200 vazio é FATO, sem `erro` — a fonte respondeu e não há fluxo", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(200, { data: { list: [] } }));
    const r = await consultarComexPorNcm({ ncm: "28369920" });
    expect(r.disponivel).toBe(false);
    expect(r.erro).toBeUndefined();
  });
});

describe("leque de requisições", () => {
  it("sob 429 NÃO tenta os formatos alternativos — antes eram até 6 por consulta", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(429));

    await dimensionarMercadoComex({ ncms: ["28369920"], anos: [2025], hoje: new Date("2026-10-19") });

    // 1 tentativa + 1 retentativa, depois o disjuntor abre e o resto falha sem rede.
    expect(f.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe("disjuntor", () => {
  it("depois de 429 persistente, a próxima consulta falha NA HORA, sem rede", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(429));

    await consultarComexPorNcm({ ncm: "28369920" });
    const chamadasAntes = f.mock.calls.length;
    const inicio = Date.now();
    const r = await consultarComexPorNcm({ ncm: "73170020" });

    expect(f.mock.calls.length).toBe(chamadasAntes); // nenhuma nova requisição
    expect(Date.now() - inicio).toBeLessThan(200);
    expect(r.erro).toBe(MSG_COMEX_INDISPONIVEL);
  });
});

describe("cache", () => {
  it("a mesma consulta repetida não vai de novo à rede", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(200, { data: { list: [] } }));

    await consultarComexPorNcm({ ncm: "28369920" });
    const primeira = f.mock.calls.length;
    await consultarComexPorNcm({ ncm: "28369920" });

    expect(f.mock.calls.length).toBe(primeira);
  });

  it("falha NÃO é cacheada — quando a fonte voltar, a consulta volta", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(resp(500));
    await consultarComexPorNcm({ ncm: "28369920" });

    f.mockResolvedValue(resp(200, { data: { list: [] } }));
    const r = await consultarComexPorNcm({ ncm: "28369920" });

    expect(r.erro).toBeUndefined();
  });
});
