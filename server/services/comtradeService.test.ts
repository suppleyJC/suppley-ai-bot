/**
 * Trava a agregação do UN Comtrade (preço médio global US$/kg). A camada de rede
 * não é testável no sandbox; a matemática é o que importa.
 */
import { describe, it, expect } from "vitest";
import { resumoComtrade, type ComtradeRow } from "./comtradeService";

describe("resumoComtrade", () => {
  it("soma valor e peso globais e calcula US$/kg", () => {
    const rows: ComtradeRow[] = [
      { primaryValue: "1000000", netWgt: "500000" },
      { primaryValue: 500000, netWgt: 500000 },
    ];
    const r = resumoComtrade("731700", "import", 2024, rows);
    expect(r.disponivel).toBe(true);
    expect(r.escopo).toBe("global");
    expect(r.valorUsd).toBe(1_500_000);
    expect(r.kg).toBe(1_000_000);
    expect(r.precoMedioUsdKg!).toBeCloseTo(1.5, 4);
  });

  it("sem peso → não calcula /kg e fica indisponível", () => {
    const r = resumoComtrade("731700", "import", 2024, [{ primaryValue: "1000", netWgt: "0" }]);
    expect(r.precoMedioUsdKg).toBeNull();
    expect(r.disponivel).toBe(false);
  });

  it("sem linhas → indisponível", () => {
    const r = resumoComtrade("731700", "import", null, []);
    expect(r.disponivel).toBe(false);
  });
});
