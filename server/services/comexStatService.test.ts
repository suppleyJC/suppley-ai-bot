/**
 * Trava a AGREGAÇÃO do Comex Stat (camada pura, sem rede). A camada HTTP não é
 * testável no sandbox (sem acesso externo); a matemática de totais, preço médio
 * US$/kg, variação e top origens é o que importa garantir.
 */
import { describe, it, expect } from "vitest";
import { agregarComex, ymMinus, type ComexRow } from "./comexStatService";

const recente: ComexRow[] = [
  { country: "China", metricFOB: "1000000", metricKG: "500000" }, // 2,00 US$/kg
  { country: "Alemanha", metricFOB: "300000", metricKG: "100000" }, // 3,00 US$/kg
  { country: "China", metricFOB: "200000", metricKG: "100000" }, // soma na China
];
// ano anterior: preço médio menor (total 1.000.000 / 800.000 = 1,25) → preço subiu
const anterior: ComexRow[] = [
  { country: "China", metricFOB: "1000000", metricKG: "800000" },
];

describe("agregarComex", () => {
  it("soma totais e calcula o preço médio US$/kg", () => {
    const r = agregarComex("73170020", "import", recente, anterior);
    expect(r.disponivel).toBe(true);
    expect(r.totalFobUsd).toBe(1_500_000);
    expect(r.totalKg).toBe(700_000);
    expect(r.precoMedioUsdKg!).toBeCloseTo(1500000 / 700000, 4);
  });

  it("agrupa por país e ordena por FOB (China na frente)", () => {
    const r = agregarComex("73170020", "import", recente, anterior);
    expect(r.topOrigens[0].pais).toBe("China");
    expect(r.topOrigens[0].fobUsd).toBe(1_200_000);
    expect(r.topOrigens[0].precoMedioUsdKg!).toBeCloseTo(1200000 / 600000, 4);
  });

  it("detecta tendência de ALTA quando o preço médio sobe", () => {
    const r = agregarComex("73170020", "import", recente, anterior);
    // recente ~2,14 vs anterior 1,25 → alta
    expect(r.tendenciaPreco).toBe("alta");
    expect(r.variacaoPrecoPct!).toBeGreaterThan(2);
  });

  it("sem dados → indisponível e neutro", () => {
    const r = agregarComex("73170020", "import", [], []);
    expect(r.disponivel).toBe(false);
    expect(r.precoMedioUsdKg).toBeNull();
    expect(r.tendenciaPreco).toBe("indef");
  });

  it("sem base do ano anterior → tendência indeterminada", () => {
    const r = agregarComex("73170020", "import", recente, []);
    expect(r.disponivel).toBe(true);
    expect(r.variacaoPrecoPct).toBeNull();
    expect(r.tendenciaPreco).toBe("indef");
  });

  it("ymMinus formata YYYY-MM e atravessa a virada de ano", () => {
    expect(ymMinus(new Date(2026, 0, 15), 2)).toBe("2025-11"); // jan/2026 - 2 = nov/2025
  });
});
