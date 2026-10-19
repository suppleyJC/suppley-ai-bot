/**
 * Trava a ALTERNATIVA ao Comex Stat no dimensionamento de mercado.
 *
 * Requisito de produto: a pergunta "qual o tamanho do mercado de X" tem que
 * terminar com resposta. Quando o Comex Stat não consegue CONSULTAR (429/rede),
 * cai para o Comtrade (Brasil como declarante, SH6); se também falhar, orienta
 * pesquisa web com fonte citada. Quando o Comex Stat RESPONDE sem fluxo, isso
 * é resultado — e não aciona alternativa nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { comexMock, comtradeMock, expandMock } = vi.hoisted(() => ({
  comexMock: vi.fn(),
  comtradeMock: vi.fn(),
  expandMock: vi.fn(),
}));

vi.mock("../../services/comexStatService", () => ({ dimensionarMercadoComex: comexMock }));
vi.mock("../../services/comtradeService", () => ({ consultarComtradeBrasil: comtradeMock }));
vi.mock("../../services/ncmService", () => ({ expandNcmPrefixes: expandMock }));

import { dimensionarMercadoTool } from "./dimensionarMercado";

const ctx = { userId: 1 } as never;
const indisponivel = { disponivel: false, erro: "a base oficial do Comex Stat está temporariamente indisponível" };

beforeEach(() => {
  vi.clearAllMocks();
  expandMock.mockResolvedValue({ ncms: ["28369920"], naoEncontrados: [] });
});

describe("dimensionar_mercado — Comex Stat indisponível", () => {
  it("cai para o Comtrade e ENTREGA números", async () => {
    comexMock.mockResolvedValue(indisponivel);
    comtradeMock.mockResolvedValue({
      hs6: "283699", fluxo: "import", disponivel: true, anosSemDado: [],
      fonte: "UN Comtrade",
      anos: [{
        ano: 2025, valorUsd: 12_500_000, kg: 21_000_000, precoMedioUsdKg: 0.595,
        topOrigens: [{ pais: "China", valorUsd: 9_000_000, kg: 15_000_000, precoMedioUsdKg: 0.6, participacaoPct: 72 }],
      }],
    });

    const r = await dimensionarMercadoTool.run({ ncms: ["28369920"], anos: [2025] }, ctx);

    expect(r.ok).toBe(true);
    expect(comtradeMock).toHaveBeenCalledWith(expect.objectContaining({ ncm: "283699" }));
    expect(r.summary).toMatch(/UN Comtrade/);
    expect(r.summary).toMatch(/China 72%/);
    expect(r.summary).toMatch(/Não trate como falha/);
  });

  it("sem Comtrade também, orienta pesquisa web COM fonte — nunca número inventado", async () => {
    comexMock.mockResolvedValue(indisponivel);
    comtradeMock.mockResolvedValue({ hs6: "283699", fluxo: "import", disponivel: false, anos: [], anosSemDado: [2025], fonte: "" });

    const r = await dimensionarMercadoTool.run({ ncms: ["28369920"], anos: [2025] }, ctx);

    expect(r.ok).toBe(true);
    expect(r.summary).toMatch(/ENTREGUE UMA RESPOSTA/);
    expect(r.summary).toMatch(/CITE cada fonte/);
    expect(r.summary).toMatch(/Nunca apresente número sem fonte/);
  });

  it("NCMs do mesmo SH6 viram UMA consulta no Comtrade", async () => {
    expandMock.mockResolvedValue({ ncms: ["28369910", "28369920", "28369990"], naoEncontrados: [] });
    comexMock.mockResolvedValue(indisponivel);
    comtradeMock.mockResolvedValue({ hs6: "283699", fluxo: "import", disponivel: false, anos: [], anosSemDado: [], fonte: "" });

    await dimensionarMercadoTool.run({ ncms: ["283699"], anos: [2025] }, ctx);

    expect(comtradeMock).toHaveBeenCalledTimes(1);
  });
});

describe("dimensionar_mercado — Comex Stat respondeu sem fluxo", () => {
  it("é RESULTADO: não aciona alternativa e não pede para estimar", async () => {
    comexMock.mockResolvedValue({ disponivel: false });

    const r = await dimensionarMercadoTool.run({ ncms: ["28369920"], anos: [2025] }, ctx);

    expect(comtradeMock).not.toHaveBeenCalled();
    expect(r.summary).toMatch(/não registra importação/);
  });
});

describe("agregarComtradeBrasil", () => {
  it("total vem do parceiro Mundo; origens dos demais, ordenadas", async () => {
    const { agregarComtradeBrasil: real } = await vi.importActual<typeof import("../../services/comtradeService")>(
      "../../services/comtradeService",
    );
    const r = real(2025, [
      { partnerCode: 0, partnerDesc: "World", primaryValue: 1000, netWgt: 2000 },
      { partnerCode: 156, partnerDesc: "China", primaryValue: 700, netWgt: 1400 },
      { partnerCode: 842, partnerDesc: "USA", primaryValue: 300, netWgt: 400 },
    ])!;
    expect(r.valorUsd).toBe(1000);
    expect(r.precoMedioUsdKg).toBeCloseTo(0.5, 6);
    expect(r.topOrigens.map((o) => o.pais)).toEqual(["China", "USA"]);
    expect(r.topOrigens[0].participacaoPct).toBeCloseTo(70, 6);
  });

  it("sem linha Mundo, soma os parceiros", async () => {
    const { agregarComtradeBrasil: real } = await vi.importActual<typeof import("../../services/comtradeService")>(
      "../../services/comtradeService",
    );
    const r = real(2025, [
      { partnerCode: 156, partnerDesc: "China", primaryValue: 700, netWgt: 1400 },
      { partnerCode: 842, partnerDesc: "USA", primaryValue: 300, netWgt: 600 },
    ])!;
    expect(r.valorUsd).toBe(1000);
    expect(r.kg).toBe(2000);
  });

  it("sem valor devolve null", async () => {
    const { agregarComtradeBrasil: real } = await vi.importActual<typeof import("../../services/comtradeService")>(
      "../../services/comtradeService",
    );
    expect(real(2025, [])).toBeNull();
  });
});
