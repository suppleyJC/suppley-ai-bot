/**
 * Trava de duplicidade de proformas/cotações — regras de comparação.
 *
 * Critérios de aceite:
 * - Registro 100% idêntico (fornecedor, data, itens, quantidades, preços) → mesma chave (bloqueia)
 * - Alteração em variável crítica (data, quantidade ou preço) → chave diferente (libera)
 */
import { describe, it, expect } from "vitest";
import { chaveCabecalho, chaveItens } from "./services/proformaService";

const cabecalho = {
  tipo: "proforma",
  supplierName: "Tianjin Metals Co.",
  currency: "USD",
  incoterm: "FOB",
  paymentTerms: "30% adiantado, 70% contra BL",
  leadTimeDays: 45,
  moq: 100,
  quotationDate: "2026-07-01",
};

const itens = [
  { productName: "Vergalhão CA-50 10mm", quantity: 24.5, unitPriceCents: 61500, unit: "t" },
  { productName: "Vergalhão CA-50 8mm", quantity: 10, unitPriceCents: 63000, unit: "t" },
];

describe("trava de duplicidade — cabeçalho", () => {
  it("registro idêntico gera a mesma chave (bloqueia)", () => {
    expect(chaveCabecalho({ ...cabecalho })).toBe(chaveCabecalho({ ...cabecalho }));
  });

  it("normaliza caixa/espaços do fornecedor (duplicata disfarçada ainda bloqueia)", () => {
    expect(chaveCabecalho({ ...cabecalho, supplierName: "  TIANJIN   metals co. " })).toBe(
      chaveCabecalho(cabecalho),
    );
  });

  it("data em string ISO e Date equivalem ao mesmo dia (linha do banco × input da API)", () => {
    expect(chaveCabecalho({ ...cabecalho, quotationDate: new Date("2026-07-01") })).toBe(
      chaveCabecalho(cabecalho),
    );
  });

  it("data diferente libera o cadastro (reajuste do mesmo fornecedor)", () => {
    expect(chaveCabecalho({ ...cabecalho, quotationDate: "2026-08-01" })).not.toBe(
      chaveCabecalho(cabecalho),
    );
  });

  it("defaults equivalem a ausência (incoterm FOB, tipo proforma, moeda USD)", () => {
    expect(
      chaveCabecalho({ ...cabecalho, tipo: undefined, incoterm: undefined, currency: "usd" }),
    ).toBe(chaveCabecalho({ ...cabecalho, tipo: "proforma", incoterm: "FOB", currency: "USD" }));
  });

  it("condição comercial diferente libera (não é 100% idêntica)", () => {
    expect(chaveCabecalho({ ...cabecalho, paymentTerms: "à vista" })).not.toBe(
      chaveCabecalho(cabecalho),
    );
  });
});

describe("trava de duplicidade — itens", () => {
  it("mesmos itens em ordem diferente geram a mesma chave (bloqueia)", () => {
    expect(chaveItens([...itens].reverse())).toBe(chaveItens(itens));
  });

  it("quantidade diferente libera (inclusive fracionada: 24,5 → 24,6)", () => {
    const alterado = [{ ...itens[0], quantity: 24.6 }, itens[1]];
    expect(chaveItens(alterado)).not.toBe(chaveItens(itens));
  });

  it("preço diferente libera (reajuste)", () => {
    const alterado = [{ ...itens[0], unitPriceCents: 62000 }, itens[1]];
    expect(chaveItens(alterado)).not.toBe(chaveItens(itens));
  });

  it("item sem preço não colide com preço zero nem com outro preço", () => {
    const semPreco = [{ ...itens[0], unitPriceCents: null }, itens[1]];
    const precoZero = [{ ...itens[0], unitPriceCents: 0 }, itens[1]];
    expect(chaveItens(semPreco)).not.toBe(chaveItens(itens));
    expect(chaveItens(semPreco)).not.toBe(chaveItens(precoZero));
  });
});
