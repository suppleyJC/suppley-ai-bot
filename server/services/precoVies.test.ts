/**
 * Trava o ESTIMADOR DE VIÉS das fontes declaratórias.
 *
 * O que precisa continuar valendo:
 *   1. o fator é MEDIDO na sobreposição, não arbitrado;
 *   2. a estimativa é a MEDIANA das razões — a média seria arrastada pela
 *      cauda suja (mix de produtos na mesma NCM, negócio pontual);
 *   3. sem amostra no nível específico, sobe a hierarquia da nomenclatura E
 *      informa de que nível veio;
 *   4. sem amostra em nenhum nível, k = 1 com `estimado: false` — não
 *      corrigir é honesto, inventar um fator plausível não é;
 *   5. fator fora da faixa admissível é aparado COM aviso, porque indica dado
 *      sujo e não mercado exótico.
 */
import { describe, it, expect } from "vitest";
import {
  estimarFatorVies,
  correcaoParaPonderacao,
  mediana,
  mad,
  type ParObservado,
} from "./precoVies";

const HOJE = new Date("2026-10-14T00:00:00Z");

function par(ncm: string, proprio: number, declarado: number, data = "2026-06-01"): ParObservado {
  return { ncm, precoProprio: proprio, precoDeclarado: declarado, data };
}

describe("estatística robusta", () => {
  it("mediana com n par e ímpar", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it("a mediana ignora o outlier que arrastaria a média", () => {
    // média = 5,0; mediana = 1,2 — é o caso que motiva a escolha.
    expect(mediana([1.1, 1.2, 1.3, 20])).toBeCloseTo(1.25, 6);
  });

  it("MAD mede dispersão sem se deixar levar pela cauda", () => {
    expect(mad([1, 1, 1, 1])).toBe(0);
    expect(mad([1, 2, 3])).toBe(1);
  });
});

describe("estimativa no nível da NCM", () => {
  it("mede o fator a partir da sobreposição", () => {
    // Base própria consistentemente ~20% acima do declarado.
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.60, 0.50),
      par("28369920", 0.59, 0.49),
      par("28369920", 0.61, 0.51),
    ], { hoje: HOJE });

    expect(r.estimado).toBe(true);
    expect(r.nivel).toBe("ncm8");
    expect(r.n).toBe(3);
    expect(r.k).toBeCloseTo(0.59 / 0.49, 2);
    expect(r.k).toBeGreaterThan(1.15);
  });

  it("usa a mediana — um negócio pontual não desloca o fator", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.60, 0.50),
      par("28369920", 0.60, 0.50),
      par("28369920", 0.60, 0.50),
      par("28369920", 3.00, 0.50), // compra emergencial, 6x
    ], { hoje: HOJE });

    expect(r.k).toBeCloseTo(1.2, 6);
  });

  it("não estima com amostra abaixo do mínimo do nível", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.60, 0.50),
      par("28369920", 0.59, 0.49),
    ], { hoje: HOJE });

    expect(r.nivel).not.toBe("ncm8");
  });
});

describe("hierarquia da nomenclatura", () => {
  const paresSh4 = [
    par("28361000", 1.20, 1.00), par("28362000", 1.25, 1.00),
    par("28363000", 1.15, 1.00), par("28364000", 1.20, 1.00),
    par("28365000", 1.20, 1.00),
  ];

  it("sobe para SH4 quando a NCM específica não tem amostra", () => {
    const r = estimarFatorVies("28369920", paresSh4, { hoje: HOJE });
    expect(r.estimado).toBe(true);
    expect(r.nivel).toBe("sh4");
    expect(r.chave).toBe("2836");
    expect(r.k).toBeCloseTo(1.2, 6);
  });

  it("avisa que o nível é menos específico", () => {
    const r = estimarFatorVies("28369920", paresSh4, { hoje: HOJE });
    expect(r.aviso).toMatch(/posição \(SH4\)/);
  });

  it("prefere o nível mais específico quando ambos têm amostra", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 1.50, 1.00), par("28369920", 1.50, 1.00), par("28369920", 1.50, 1.00),
      ...paresSh4,
    ], { hoje: HOJE });

    expect(r.nivel).toBe("ncm8");
    expect(r.k).toBeCloseTo(1.5, 6);
  });

  it("sobe até capítulo quando SH4 também é fino", () => {
    const r = estimarFatorVies("28369920", [
      par("28111000", 1.30, 1.00), par("28129000", 1.30, 1.00),
      par("28150000", 1.30, 1.00), par("28161000", 1.30, 1.00),
      par("28170000", 1.30, 1.00), par("28182000", 1.30, 1.00),
      par("28191000", 1.30, 1.00), par("28201000", 1.30, 1.00),
    ], { hoje: HOJE });

    expect(r.nivel).toBe("capitulo");
    expect(r.chave).toBe("28");
    expect(r.k).toBeCloseTo(1.3, 6);
  });
});

describe("quando NÃO dá para estimar", () => {
  it("devolve k = 1 com estimado false, não um fator plausível", () => {
    const r = estimarFatorVies("28369920", [par("73170020", 1.4, 1.0)], { hoje: HOJE });
    expect(r.estimado).toBe(false);
    expect(r.k).toBe(1);
    expect(r.nivel).toBe("nenhum");
    expect(r.aviso).toMatch(/sem correção/i);
  });

  it("lista vazia não quebra", () => {
    const r = estimarFatorVies("28369920", [], { hoje: HOJE });
    expect(r.estimado).toBe(false);
    expect(r.k).toBe(1);
  });

  it("descarta par com preço não positivo", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.6, 0), par("28369920", 0, 0.5), par("28369920", -1, 0.5),
    ], { hoje: HOJE });
    expect(r.estimado).toBe(false);
  });

  it("descarta par fora da janela temporal", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.6, 0.5, "2019-01-01"),
      par("28369920", 0.6, 0.5, "2019-02-01"),
      par("28369920", 0.6, 0.5, "2019-03-01"),
    ], { hoje: HOJE, janelaMeses: 36 });

    expect(r.estimado).toBe(false);
  });

  it("par sem data entra — a janela não exclui por omissão", () => {
    const r = estimarFatorVies("28369920", [
      { ncm: "28369920", precoProprio: 0.6, precoDeclarado: 0.5 },
      { ncm: "28369920", precoProprio: 0.6, precoDeclarado: 0.5 },
      { ncm: "28369920", precoProprio: 0.6, precoDeclarado: 0.5 },
    ], { hoje: HOJE });

    expect(r.estimado).toBe(true);
    expect(r.k).toBeCloseTo(1.2, 6);
  });
});

describe("faixa admissível e avisos", () => {
  it("apara fator absurdamente alto e avisa", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 50, 1), par("28369920", 50, 1), par("28369920", 50, 1),
    ], { hoje: HOJE });

    expect(r.k).toBe(2.5);
    expect(r.limitado).toBe(true);
    expect(r.aviso).toMatch(/fora da faixa admissível/i);
  });

  it("apara fator absurdamente baixo e avisa", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.01, 1), par("28369920", 0.01, 1), par("28369920", 0.01, 1),
    ], { hoje: HOJE });

    expect(r.k).toBe(0.7);
    expect(r.limitado).toBe(true);
  });

  it("k abaixo de 1 é reportado como evidência contra subdeclaração", () => {
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.90, 1.00), par("28369920", 0.90, 1.00), par("28369920", 0.90, 1.00),
    ], { hoje: HOJE });

    expect(r.k).toBeCloseTo(0.9, 6);
    expect(r.limitado).toBe(false);
    expect(r.aviso).toMatch(/evidência contra subdeclaração/i);
  });

  it("avisa quando as razões são muito dispersas", () => {
    // razões 0,5 / 1,0 / 2,0 / 3,0 → mediana 1,5; desvios 1,0 / 0,5 / 0,5 / 1,5
    // → MAD 0,75 → 50% da mediana.
    const r = estimarFatorVies("28369920", [
      par("28369920", 0.5, 1.0), par("28369920", 1.0, 1.0),
      par("28369920", 2.0, 1.0), par("28369920", 3.0, 1.0),
    ], { hoje: HOJE });

    expect(r.dispersaoPct).toBeGreaterThan(40);
    expect(r.aviso).toMatch(/dispersas/i);
  });
});

describe("integração com a ponderação", () => {
  it("entrega o mapa que ponderarPrecos espera", () => {
    const fator = estimarFatorVies("28369920", [
      par("28369920", 0.60, 0.50), par("28369920", 0.60, 0.50), par("28369920", 0.60, 0.50),
    ], { hoje: HOJE });

    expect(correcaoParaPonderacao(fator)).toEqual({ mercado: 1.2 });
  });

  it("não devolve correção quando não houve estimativa — o aviso de viés continua valendo", () => {
    expect(correcaoParaPonderacao(estimarFatorVies("28369920", [], { hoje: HOJE }))).toBeUndefined();
  });

  it("corrige APENAS a fonte declaratória — corrigir a base própria seria circular", () => {
    const fator = estimarFatorVies("28369920", [
      par("28369920", 0.60, 0.50), par("28369920", 0.60, 0.50), par("28369920", 0.60, 0.50),
    ], { hoje: HOJE });
    const correcao = correcaoParaPonderacao(fator)!;

    expect(Object.keys(correcao)).toEqual(["mercado"]);
  });
});
