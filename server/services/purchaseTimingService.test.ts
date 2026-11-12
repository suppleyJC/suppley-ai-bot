/**
 * Trava a camada preditiva (janela de compra). Câmbio domina; commodities
 * ajustam; inflação favorece o importado.
 */
import { describe, it, expect } from "vitest";
import { avaliarJanelaCompra } from "./purchaseTimingService";
import type { Sinal } from "./marketIntelligenceService";

const sinal = (over: Partial<Sinal>): Sinal => ({
  chave: "X", fonte: "FRED", atual: 1, anterior: 1, variacaoPct: 0, tendencia: "estavel", ...over,
});

describe("avaliarJanelaCompra", () => {
  it("câmbio em baixa → favorece comprar", () => {
    const r = avaliarJanelaCompra([sinal({ chave: "USD/BRL", fonte: "BCB/PTAX", tendencia: "baixa", variacaoPct: -5 })]);
    expect(r.score).toBeGreaterThan(65);
    expect(r.recomendacao).toBe("comprar");
  });

  it("câmbio em alta → recomenda aguardar", () => {
    const r = avaliarJanelaCompra([sinal({ chave: "USD/BRL", fonte: "BCB/PTAX", tendencia: "alta", variacaoPct: 6 })]);
    expect(r.score).toBeLessThan(35);
    expect(r.recomendacao).toBe("aguardar");
  });

  it("commodities não dominam o câmbio (teto de ajuste)", () => {
    const cambioAlta = sinal({ chave: "USD/BRL", fonte: "BCB/PTAX", tendencia: "alta", variacaoPct: 6 });
    const commosBaixa = Array.from({ length: 6 }, (_, i) =>
      sinal({ chave: `C${i}`, fonte: "FRED", tendencia: "baixa", variacaoPct: -5 }));
    const r = avaliarJanelaCompra([cambioAlta, ...commosBaixa]);
    // câmbio -22, commodities limitadas a +16 → líquido negativo
    expect(r.score).toBeLessThan(50);
  });

  it("sem sinais → neutro", () => {
    const r = avaliarJanelaCompra([]);
    expect(r.recomendacao).toBe("neutro");
    expect(r.fatores.length).toBeGreaterThan(0);
  });
});
