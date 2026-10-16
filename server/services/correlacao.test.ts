import { describe, it, expect } from "vitest";
import {
  pearson, retornosMensais, diferencasMensais, alinhar, correlacionarComLag, forcaCorrelacao,
  type PontoYm,
} from "./correlacaoService";

const ym = (i: number) => {
  const d = new Date(2025, i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const serie = (vals: number[], offset = 0): PontoYm[] =>
  vals.map((v, i) => ({ t: ym(i + offset), valor: v }));

describe("correlacaoService", () => {
  describe("pearson", () => {
    it("correlação perfeita positiva", () => {
      expect(pearson([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6);
    });
    it("correlação perfeita negativa", () => {
      expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
    });
    it("sem variância → 0 (não NaN)", () => {
      expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBe(0);
    });
    it("menos de 3 pontos → 0", () => {
      expect(pearson([1, 2], [3, 4])).toBe(0);
    });
  });

  describe("retornosMensais / diferencasMensais", () => {
    it("calcula retornos percentuais rotulados pelo mês de chegada", () => {
      const r = retornosMensais(serie([100, 110, 99]));
      expect(r).toHaveLength(2);
      expect(r[0].valor).toBeCloseTo(10, 6);
      expect(r[1].valor).toBeCloseTo(-10, 6);
      expect(r[0].t).toBe(ym(1));
    });
    it("diferenças em pontos para taxas", () => {
      const d = diferencasMensais(serie([13.75, 13.25, 12.75]));
      expect(d.map((p) => p.valor)).toEqual([-0.5, -0.5]);
    });
  });

  describe("alinhar", () => {
    it("casa apenas os meses comuns, ordenado", () => {
      const a = serie([1, 2, 3]);          // meses 0,1,2
      const b = serie([10, 20, 30], 1);    // meses 1,2,3
      const pares = alinhar(a, b);
      expect(pares).toHaveLength(2);
      expect(pares[0]).toEqual({ t: ym(1), x: 2, y: 10 });
      expect(pares[1]).toEqual({ t: ym(2), x: 3, y: 20 });
    });
  });

  describe("correlacionarComLag", () => {
    it("detecta que x antecede y em 2 meses", () => {
      // y é x deslocado 2 meses (com correlação perfeita no lag 2)
      const base = [1, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10, 13];
      const x = serie(base);
      const y = serie(base, 2); // mesmo padrão, 2 meses depois
      const co = correlacionarComLag(x, y, 4);
      expect(co.lagMeses).toBe(2);
      expect(co.r).toBeCloseTo(1, 4);
      expect(co.beta).toBeCloseTo(1, 4);
    });

    it("séries sem sobreposição suficiente → r 0", () => {
      const co = correlacionarComLag(serie([1, 2, 3]), serie([4, 5, 6], 10), 2);
      expect(co.r).toBe(0);
      expect(co.nPares).toBe(0);
    });
  });

  describe("forcaCorrelacao", () => {
    it("classifica as faixas", () => {
      expect(forcaCorrelacao(0.9)).toBe("forte");
      expect(forcaCorrelacao(-0.7)).toBe("forte");
      expect(forcaCorrelacao(0.5)).toBe("moderada");
      expect(forcaCorrelacao(0.3)).toBe("fraca");
      expect(forcaCorrelacao(0.1)).toBe("irrelevante");
    });
  });
});
