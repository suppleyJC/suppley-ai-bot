import { describe, it, expect } from "vitest";
import {
  regressaoLinear, indicesSazonais, volatilidadePct, analisarEProjetar, agregarMensal,
} from "./previsaoService";

describe("previsaoService", () => {
  describe("regressaoLinear", () => {
    it("recupera inclinação e intercepto de uma reta perfeita", () => {
      const y = [10, 12, 14, 16, 18]; // y = 10 + 2x
      const r = regressaoLinear(y);
      expect(r.a).toBeCloseTo(10, 6);
      expect(r.b).toBeCloseTo(2, 6);
      expect(r.r2).toBeCloseTo(1, 6);
      expect(r.stderr).toBeCloseTo(0, 6);
    });

    it("série constante tem inclinação zero e stderr zero", () => {
      const r = regressaoLinear([5, 5, 5, 5]);
      expect(r.b).toBeCloseTo(0, 6);
      expect(r.stderr).toBeCloseTo(0, 6);
    });

    it("não explode com 1 ponto", () => {
      const r = regressaoLinear([7]);
      expect(r.a).toBe(7);
      expect(r.b).toBe(0);
    });
  });

  describe("indicesSazonais", () => {
    it("retorna null sem 2 ciclos completos", () => {
      expect(indicesSazonais([1, 2, 3], 12)).toBeNull();
    });

    it("detecta padrão sazonal simples (ciclo 4)", () => {
      // padrão [1, 2, 1, 2] repetido 3x — índices ~[0.67, 1.33, 0.67, 1.33]
      const y = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
      const idx = indicesSazonais(y, 4)!;
      expect(idx).toHaveLength(4);
      expect(idx[1]).toBeGreaterThan(idx[0]);
      const media = idx.reduce((s, v) => s + v, 0) / 4;
      expect(media).toBeCloseTo(1, 6);
    });
  });

  describe("volatilidadePct", () => {
    it("série constante tem volatilidade zero", () => {
      expect(volatilidadePct([10, 10, 10, 10])).toBeCloseTo(0, 6);
    });

    it("série alternante tem volatilidade alta", () => {
      expect(volatilidadePct([10, 12, 10, 12, 10])).toBeGreaterThan(10);
    });
  });

  describe("analisarEProjetar", () => {
    const serie = (vals: number[]) =>
      vals.map((v, i) => ({ t: `2025-${String((i % 12) + 1).padStart(2, "0")}`, valor: v }));

    it("série curta (<4) fica indisponível", () => {
      const a = analisarEProjetar(serie([1, 2, 3]), 3);
      expect(a.disponivel).toBe(false);
      expect(a.projecoes).toHaveLength(0);
    });

    it("tendência de alta clara é detectada e projetada com faixa", () => {
      const a = analisarEProjetar(serie([100, 104, 108, 112, 116, 120]), 3);
      expect(a.disponivel).toBe(true);
      expect(a.tendencia).toBe("alta");
      expect(a.projecoes).toHaveLength(3);
      // Projeção central continua a reta (~124, 128, 132)
      expect(a.projecoes[0].valor).toBeGreaterThan(120);
      expect(a.projecoes[2].valor).toBeGreaterThan(a.projecoes[0].valor);
      // Banda contém a central
      for (const p of a.projecoes) {
        expect(p.min).toBeLessThanOrEqual(p.valor);
        expect(p.max).toBeGreaterThanOrEqual(p.valor);
      }
    });

    it("série estável não inventa tendência", () => {
      const a = analisarEProjetar(serie([50, 50.2, 49.8, 50.1, 49.9, 50]), 2);
      expect(a.tendencia).toBe("estavel");
    });

    it("projeção nunca fica negativa", () => {
      const a = analisarEProjetar(serie([10, 8, 6, 4, 2, 1]), 4);
      for (const p of a.projecoes) {
        expect(p.valor).toBeGreaterThanOrEqual(0);
        expect(p.min).toBeGreaterThanOrEqual(0);
      }
    });

    it("rotula os meses seguintes corretamente", () => {
      const pts = [
        { t: "2026-01", valor: 10 }, { t: "2026-02", valor: 11 },
        { t: "2026-03", valor: 12 }, { t: "2026-04", valor: 13 },
      ];
      const a = analisarEProjetar(pts, 2);
      expect(a.projecoes[0].t).toBe("2026-05");
      expect(a.projecoes[1].t).toBe("2026-06");
    });
  });

  describe("agregarMensal", () => {
    it("agrega diário em médias mensais ordenadas", () => {
      const m = agregarMensal([
        { data: "2026-02-10", valor: 6 },
        { data: "2026-01-05", valor: 5 },
        { data: "2026-01-20", valor: 7 },
      ]);
      expect(m).toEqual([
        { t: "2026-01", valor: 6 },
        { t: "2026-02", valor: 6 },
      ]);
    });

    it("ignora pontos inválidos", () => {
      const m = agregarMensal([
        { data: "invalida", valor: 5 },
        { data: "2026-03-01", valor: Number.NaN },
        { data: "2026-03-02", valor: 4 },
      ]);
      expect(m).toEqual([{ t: "2026-03", valor: 4 }]);
    });
  });
});
