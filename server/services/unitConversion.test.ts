/**
 * unitConversion.test — inteligência de unidades do cálculo.
 *
 * Invariante central: converter unidade NUNCA muda o total — só a leitura.
 * 2 ton × $500/ton ≡ 2000 kg × $0,50/kg.
 */
import { describe, it, expect } from "vitest";
import { parseUnidade, converterItem, custoPorCanonica } from "./unitConversionService";

describe("parseUnidade — reconhecimento em linguagem natural", () => {
  it("reconhece peso em variações pt/en, plural e abreviação", () => {
    for (const raw of ["ton", "TONELADAS", "t", "Tonelada", "MT"]) {
      const u = parseUnidade(raw);
      expect(u.dimensao).toBe("peso");
      expect(u.fator).toBe(1000);
      expect(u.canonica).toBe("kg");
    }
    expect(parseUnidade("g").fator).toBe(0.001);
    expect(parseUnidade("gramas").fator).toBe(0.001);
    expect(parseUnidade("KG").fator).toBe(1);
    expect(parseUnidade("quilos").fator).toBe(1);
  });

  it("reconhece volume (ml, L, m³)", () => {
    expect(parseUnidade("ml")).toMatchObject({ dimensao: "volume", fator: 0.001, canonica: "L" });
    expect(parseUnidade("Litros")).toMatchObject({ dimensao: "volume", fator: 1 });
    expect(parseUnidade("m3")).toMatchObject({ dimensao: "volume", fator: 1000 });
  });

  it("reconhece unidades comerciais (milheiro, dúzia, cento, par, un/pc)", () => {
    expect(parseUnidade("milheiro")).toMatchObject({ dimensao: "contagem", fator: 1000, canonica: "un" });
    expect(parseUnidade("MILHEIROS").fator).toBe(1000);
    expect(parseUnidade("dúzia").fator).toBe(12);
    expect(parseUnidade("cento").fator).toBe(100);
    expect(parseUnidade("par").fator).toBe(2);
    expect(parseUnidade("pc").fator).toBe(1);
    expect(parseUnidade("unidades").fator).toBe(1);
  });

  it("embalagens (pct/cx/fardo) ficam sem fator até informar o conteúdo", () => {
    expect(parseUnidade("cx").fator).toBeNull();
    expect(parseUnidade("caixas").fator).toBeNull();
    expect(parseUnidade("pct").fator).toBeNull();
  });

  it("unidade desconhecida vira passthrough (nunca lança)", () => {
    const u = parseUnidade("bobina");
    expect(u.dimensao).toBe("desconhecida");
    expect(u.rotulo).toBe("bobina");
    expect(u.fator).toBeNull();
  });
});

describe("converterItem — quantidade canônica + peso derivado", () => {
  it("2 ton → 2000 kg e deriva pesoTotalKg automaticamente", () => {
    const c = converterItem({ quantity: 2, unit: "ton" });
    expect(c.quantidadeCanonica).toBe(2000);
    expect(c.unidadeCanonica).toBe("kg");
    expect(c.pesoTotalKgDerivado).toBe(2000);
    expect(c.descricao).toContain("2");
    expect(c.descricao).toContain("kg");
  });

  it("500 g → 0,5 kg (peso fracionário)", () => {
    const c = converterItem({ quantity: 500, unit: "g" });
    expect(c.quantidadeCanonica).toBeCloseTo(0.5, 9);
    expect(c.pesoTotalKgDerivado).toBeCloseTo(0.5, 9);
  });

  it("3 milheiros → 3000 un (sem peso derivado — contagem)", () => {
    const c = converterItem({ quantity: 3, unit: "milheiro" });
    expect(c.quantidadeCanonica).toBe(3000);
    expect(c.unidadeCanonica).toBe("un");
    expect(c.pesoTotalKgDerivado).toBeNull();
  });

  it("40 cx com 24 un/cx → 960 un via itensPorEmbalagem", () => {
    const c = converterItem({ quantity: 40, unit: "cx", itensPorEmbalagem: 24 });
    expect(c.quantidadeCanonica).toBe(960);
    expect(c.fator).toBe(24);
  });

  it("cx sem itensPorEmbalagem: não converte e explica o que falta", () => {
    const c = converterItem({ quantity: 40, unit: "cx" });
    expect(c.quantidadeCanonica).toBeNull();
    expect(c.descricao).toContain("itens por");
  });

  it("unidade já canônica (kg/un/L) não gera descrição de conversão", () => {
    expect(converterItem({ quantity: 10, unit: "kg" }).descricao).toBeNull();
    expect(converterItem({ quantity: 10, unit: "un" }).descricao).toBeNull();
  });
});

describe("custoPorCanonica — invariante do total", () => {
  it("2 ton com custo R$ 10.000 ⇒ R$ 5,00/kg (total preservado)", () => {
    const conv = converterItem({ quantity: 2, unit: "ton" });
    const custo = custoPorCanonica(10_000, conv);
    expect(custo).not.toBeNull();
    expect(custo!.valor).toBeCloseTo(5, 9);
    expect(custo!.unidade).toBe("kg");
    // invariante: custo/canônica × qtd canônica = total original
    expect(custo!.valor * conv.quantidadeCanonica!).toBeCloseTo(10_000, 6);
  });

  it("5 milheiros com custo R$ 2.500 ⇒ R$ 0,50/un", () => {
    const conv = converterItem({ quantity: 5, unit: "milheiro" });
    const custo = custoPorCanonica(2_500, conv);
    expect(custo!.valor).toBeCloseTo(0.5, 9);
    expect(custo!.unidade).toBe("un");
  });

  it("unidade já canônica retorna null (evita linha duplicada)", () => {
    const conv = converterItem({ quantity: 100, unit: "kg" });
    expect(custoPorCanonica(1000, conv)).toBeNull();
  });

  it("não conversível retorna null", () => {
    const conv = converterItem({ quantity: 40, unit: "cx" });
    expect(custoPorCanonica(1000, conv)).toBeNull();
  });
});
