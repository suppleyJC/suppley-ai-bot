/**
 * tradeBarrier.test — formatação e estimativa de impacto de barreiras.
 * (A consulta ao banco é coberta pelo caminho best-effort: sem DB → lista vazia.)
 */
import { describe, it, expect } from "vitest";
import { detectarBarreiras, formatarBarreira, type BarreiraDetectada } from "./tradeBarrierService";

describe("detectarBarreiras — resiliência", () => {
  it("sem NCM retorna vazio (nunca lança)", async () => {
    expect(await detectarBarreiras({ ncm: "" })).toEqual([]);
    expect(await detectarBarreiras({ ncm: "abc" })).toEqual([]);
  });
});

describe("formatarBarreira — evidência para o agente", () => {
  const base: BarreiraDetectada = {
    tipo: "antidumping",
    ncmPrefix: "6402",
    paisOrigem: "China",
    mecanismo: "usd_por_unidade",
    valor: 1022,
    descricao: "Calçados — direito antidumping de US$ 10,22/par",
    baseLegal: "Res. CAMEX 14/2010",
    impactoEstimadoBrl: 51_100,
    rotulo: "ANTIDUMPING",
  };

  it("com impacto estimado: evidencia valor e alerta que NÃO está no custo do motor", () => {
    const txt = formatarBarreira(base, "6402.91.90");
    expect(txt).toContain("ANTIDUMPING");
    expect(txt).toContain("origem China");
    expect(txt).toContain("Res. CAMEX 14/2010");
    expect(txt).toContain("51.100");
    expect(txt).toContain("NÃO incluído no custo do motor");
  });

  it("sem valor parametrizado: pede confirmação do valor vigente", () => {
    const txt = formatarBarreira(
      { ...base, valor: null, impactoEstimadoBrl: null },
      "7208.39.10",
    );
    expect(txt).toContain("Valor vigente a confirmar");
  });

  it("medida sem origem (CIDE) não inventa origem", () => {
    const txt = formatarBarreira(
      { ...base, tipo: "cide", rotulo: "CIDE", paisOrigem: null, valor: null, impactoEstimadoBrl: null },
      "2710.19.21",
    );
    expect(txt).toContain("CIDE");
    expect(txt).not.toContain("origem");
  });
});
