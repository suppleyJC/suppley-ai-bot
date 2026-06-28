/**
 * Trava a precificação de referência (camada pura): valor presente da base e
 * comparação com a média oficial — o que vira argumento de negociação.
 */
import { describe, it, expect } from "vitest";
import { montarReferencia, type BaseRef, type ExternoRef } from "./referencePricingService";

const baseKg: BaseRef = {
  fonte: "proforma",
  produto: "Prego cabeça simples 17x27",
  ncm: "73170020",
  fornecedor: "Acme Ltd",
  moeda: "USD",
  precoUnit: 1.0, // US$ 1,00/kg
  unidade: "KG",
  dataCotacao: "2025-06-01",
  cambioNaData: 5.0, // na data
};

const externo: ExternoRef = {
  disponivel: true,
  ncm: "73170020",
  precoMedioUsdKg: 1.2, // média oficial US$ 1,20/kg
  tendenciaPreco: "estavel",
  topOrigens: [{ pais: "China", precoMedioUsdKg: 1.1 }],
};

describe("montarReferencia", () => {
  it("traz a base a valor presente com o câmbio de hoje", () => {
    const r = montarReferencia({
      termo: "prego 17x27", base: baseKg, externo: null,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    expect(r.base!.brlNaData).toBeCloseTo(5.0, 4);     // 1,00 × 5,00
    expect(r.base!.brlPresente).toBeCloseTo(6.0, 4);   // 1,00 × 6,00
    expect(r.base!.variacaoCambialPct).toBeCloseTo(20, 4); // câmbio +20%
  });

  it("compara base × externo (kg) e aponta a base como mais competitiva", () => {
    const r = montarReferencia({
      termo: "prego 17x27", base: baseKg, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    // base presente 6,00/kg vs externo 1,20×6,00 = 7,20/kg → base mais barata
    expect(r.comparavel).toBe(true);
    expect(r.maisCompetitivo).toBe("base");
    expect(r.diffPct!).toBeLessThan(0);
    expect(r.leitura).toMatch(/ABAIXO/);
  });

  it("aponta base ACIMA da média como alavanca de negociação", () => {
    const caro: BaseRef = { ...baseKg, precoUnit: 1.5 }; // 1,50 → presente 9,00/kg
    const r = montarReferencia({
      termo: "prego 17x27", base: caro, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    expect(r.maisCompetitivo).toBe("externo");
    expect(r.leitura).toMatch(/ACIMA|negociar/);
  });

  it("não compara direto quando a base é por unidade (não-kg)", () => {
    const un: BaseRef = { ...baseKg, unidade: "UN" };
    const r = montarReferencia({
      termo: "prego 17x27", base: un, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    expect(r.comparavel).toBe(false);
    expect(r.leitura).toMatch(/peso por unidade|limitada/i);
  });

  it("funciona só com externo (sem base na empresa)", () => {
    const r = montarReferencia({
      termo: "item novo", base: null, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: null,
    });
    expect(r.encontrouBase).toBe(false);
    expect(r.externo!.brlPorKgPresente).toBeCloseTo(7.2, 4);
  });
});
