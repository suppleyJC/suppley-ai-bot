/**
 * Trava o casamento "fuzzy" do catálogo. O caso real que motivou: a pessoa
 * digita "prego 17×27 cabeça simples" e o produto está cadastrado como
 * "Prego cabeça simples 17x27" — ordem diferente, símbolo × e acento. Isso
 * PRECISA casar, senão a Excambia diz "não cadastrado" para um item que existe.
 */
import { describe, it, expect } from "vitest";
import { catalogMatchScore, normalizeForSearch } from "./productSimilarity";

describe("normalizeForSearch", () => {
  it("converte × em x, remove acento e baixa caixa", () => {
    expect(normalizeForSearch("Prego 17×27 Cabeça")).toBe("prego 17x27 cabeca");
  });
});

describe("catalogMatchScore", () => {
  it("casa apesar da ordem das palavras e do símbolo ×", () => {
    const score = catalogMatchScore("prego 17×27 cabeça simples", "Prego cabeça simples 17x27");
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("casa termo curto contido no nome completo", () => {
    const score = catalogMatchScore("prego 17x27", "Prego cabeça simples 17x27 galvanizado");
    expect(score).toBeGreaterThanOrEqual(0.45);
  });

  it("ignora ruído (container, de) sem derrubar o match", () => {
    const score = catalogMatchScore("container de prego 17x27", "Prego cabeça simples 17x27");
    expect(score).toBeGreaterThanOrEqual(0.45);
  });

  it("NÃO casa produtos diferentes", () => {
    const score = catalogMatchScore("escora de aço 4m", "Prego cabeça simples 17x27");
    expect(score).toBeLessThan(0.45);
  });

  it("distingue variantes pela medida (tokens numéricos)", () => {
    const certo = catalogMatchScore("prego 17x27", "Prego cabeça simples 17x27");
    const errado = catalogMatchScore("prego 17x27", "Prego cabeça simples 18x36");
    expect(certo).toBeGreaterThan(errado);
  });

  it("casa PT com proforma cadastrada em INGLÊS (prego→nail, *→x)", () => {
    const score = catalogMatchScore("prego 17×27 cabeça simples", "Common Nail 17*27 Polished, 1kg/bag");
    expect(score).toBeGreaterThanOrEqual(0.45);
  });

  it("prefere a variante correta entre itens em inglês", () => {
    const comum = catalogMatchScore("prego 17x27 cabeça simples", "Common Nail 17*27 Polished");
    const duplex = catalogMatchScore("prego 17x27 cabeça simples", "Duplex Nail 17*27 Polished");
    expect(comum).toBeGreaterThan(duplex);
  });

  it("arame casa com wire; vergalhão com wire rod/rebar", () => {
    expect(catalogMatchScore("arame BWG 18", "Black Wire BWG 18, 1kg/bag")).toBeGreaterThanOrEqual(0.45);
    expect(catalogMatchScore("vergalhão 4.2mm", "Steel Wire Rod 4.2mm")).toBeGreaterThanOrEqual(0.45);
  });
});
