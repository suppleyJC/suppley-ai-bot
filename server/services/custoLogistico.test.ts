import { describe, it, expect } from "vitest";
import {
  calcularDemurrage, compararLclFcl, thcPorto, DEMURRAGE_REF_USD,
} from "./custoLogisticoService";

describe("custoLogisticoService", () => {
  describe("calcularDemurrage", () => {
    it("dentro do free time custa zero", () => {
      const r = calcularDemurrage("40HC", 7, 7);
      expect(r.custoUsd).toBe(0);
      expect(r.diasAlemFreeTime).toBe(0);
    });

    it("escalona por faixas de 7 dias", () => {
      // 7 free + 10 além: 7 dias na faixa 1 + 3 na faixa 2
      const t = DEMURRAGE_REF_USD["40HC"];
      const r = calcularDemurrage("40HC", 17, 7);
      expect(r.diasAlemFreeTime).toBe(10);
      expect(r.custoUsd).toBe(7 * t.ate7 + 3 * t.ate14);
    });

    it("terceira faixa após 14 dias de atraso", () => {
      const t = DEMURRAGE_REF_USD["20DV"];
      const r = calcularDemurrage("20DV", 7 + 16, 7); // 16 além
      expect(r.custoUsd).toBe(7 * t.ate7 + 7 * t.ate14 + 2 * t.apos14);
    });

    it("multiplica pela quantidade de contêineres", () => {
      const um = calcularDemurrage("40DV", 10, 7, 1);
      const tres = calcularDemurrage("40DV", 10, 7, 3);
      expect(tres.custoUsd).toBe(um.custoUsd * 3);
    });
  });

  describe("compararLclFcl", () => {
    it("carga pequena fica no LCL", () => {
      const r = compararLclFcl({
        volumeM3: 3, pesoKg: 1500,
        freteLclUsdPorWm: 45, freteFclUsd: 2200,
      });
      expect(r.recomendacao).toBe("LCL");
      expect(r.wm).toBe(3); // m³ > 1,5 t
    });

    it("carga volumosa vira FCL", () => {
      const r = compararLclFcl({
        volumeM3: 22, pesoKg: 9000,
        freteLclUsdPorWm: 60, freteFclUsd: 1800,
      });
      expect(r.recomendacao).toBe("FCL");
      expect(r.cabeNoFcl).toBe(true);
      expect(r.custoFclUsd).toBeLessThan(r.custoLclUsd);
    });

    it("w/m cobra pelo MAIOR entre toneladas e m³ (carga densa)", () => {
      const r = compararLclFcl({
        volumeM3: 2, pesoKg: 8000, // 8 t > 2 m³
        freteLclUsdPorWm: 50, freteFclUsd: 2000,
      });
      expect(r.wm).toBe(8);
    });

    it("carga que não cabe no contêiner não recomenda FCL único", () => {
      const r = compararLclFcl({
        volumeM3: 40, pesoKg: 12000, // > 28 m³ do 20DV
        freteLclUsdPorWm: 30, freteFclUsd: 1500,
        tipoFcl: "20DV",
      });
      expect(r.cabeNoFcl).toBe(false);
      expect(r.recomendacao).toBe("LCL");
    });

    it("breakeven fica entre o custo fixo e a capacidade", () => {
      const r = compararLclFcl({
        volumeM3: 10, pesoKg: 4000,
        freteLclUsdPorWm: 50, freteFclUsd: 2000,
      });
      expect(r.breakevenM3).not.toBeNull();
      expect(r.breakevenM3!).toBeGreaterThan(0);
    });
  });

  describe("thcPorto", () => {
    it("acha porto com acento e caixa diferentes", () => {
      expect(thcPorto("Itajaí")).toBe(thcPorto("itajai"));
      expect(thcPorto("SANTOS")).not.toBeNull();
    });

    it("porto desconhecido retorna null", () => {
      expect(thcPorto("Roterdã")).toBeNull();
    });
  });
});
