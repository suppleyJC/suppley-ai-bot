/**
 * unitConversion.test — inteligência de unidades do cálculo.
 *
 * Invariante central: converter unidade NUNCA muda o total — só a leitura.
 * 2 ton × $500/ton ≡ 2000 kg × $0,50/kg.
 */
import { describe, it, expect } from "vitest";
import {
  parseUnidade,
  converterItem,
  custoPorCanonica,
  custoPorMetro,
  extrairComprimentoM,
} from "./unitConversionService";

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

describe("comprimento — bens lineares (rodapé, perfil, tubo, cabo)", () => {
  it("reconhece m/metros/mts como comprimento canônico", () => {
    expect(parseUnidade("m")).toMatchObject({ dimensao: "comprimento", fator: 1, canonica: "m" });
    expect(parseUnidade("Metros").fator).toBe(1);
    expect(parseUnidade("mts").fator).toBe(1);
    expect(parseUnidade("cm").fator).toBe(0.01);
    expect(parseUnidade("km").fator).toBe(1000);
  });

  it("caso real WPC Skirting: 1.920 cx × 10 pç/cx × 2,4 m/pç = 46.080 m", () => {
    const c = converterItem({
      quantity: 1920,
      unit: "cx",
      itensPorEmbalagem: 10,
      metrosPorUnidade: 2.4,
    });
    expect(c.quantidadeCanonica).toBe(19_200);
    expect(c.comprimentoTotalM).toBeCloseTo(46_080, 6);
    expect(c.descricao).toContain("46.080");
    expect(c.descricao).toContain("m");
  });

  it("peças soltas (un) com metros/peça derivam a metragem total", () => {
    const c = converterItem({ quantity: 19_200, unit: "un", metrosPorUnidade: 2.4 });
    expect(c.comprimentoTotalM).toBeCloseTo(46_080, 6);
  });

  it("unidade já em metros: comprimento total = quantidade", () => {
    const c = converterItem({ quantity: 500, unit: "m" });
    expect(c.dimensao).toBe("comprimento");
    expect(c.comprimentoTotalM).toBe(500);
  });

  it("sem metros/peça não inventa comprimento", () => {
    const c = converterItem({ quantity: 100, unit: "un" });
    expect(c.comprimentoTotalM).toBeNull();
  });
});

describe("custoPorMetro — a unidade em que o mercado cota", () => {
  it("caso da auditoria: custo líquido R$ 304.349,53 em 46.080 m ⇒ R$ 6,60/m", () => {
    const conv = converterItem({
      quantity: 1920,
      unit: "cx",
      itensPorEmbalagem: 10,
      metrosPorUnidade: 2.4,
    });
    const custo = custoPorMetro(304_349.53, conv);
    expect(custo).not.toBeNull();
    expect(custo!.valor).toBeCloseTo(6.6048, 3);
    expect(custo!.unidade).toBe("m");
    // invariante: custo/m × metragem total = total original
    expect(custo!.valor * conv.comprimentoTotalM!).toBeCloseTo(304_349.53, 6);
  });

  it("item já cotado em metros não duplica a leitura", () => {
    const conv = converterItem({ quantity: 500, unit: "m" });
    expect(custoPorMetro(1000, conv)).toBeNull();
  });

  it("sem comprimento conhecido retorna null", () => {
    const conv = converterItem({ quantity: 100, unit: "un" });
    expect(custoPorMetro(1000, conv)).toBeNull();
  });
});

describe("extrairComprimentoM — comprimento no nome do produto", () => {
  it('extrai "(2,4m)" do nome real do rodapé WPC', () => {
    expect(
      extrairComprimentoM("WPC Skirting / Rodapé WPC com acabamento PVC (2,4m)"),
    ).toBeCloseTo(2.4, 9);
  });

  it("aceita ponto decimal, espaço e a palavra 'metros'", () => {
    expect(extrairComprimentoM("Perfil de alumínio 6.0 m")).toBeCloseTo(6, 9);
    expect(extrairComprimentoM("Tubo PVC 3 metros")).toBeCloseTo(3, 9);
  });

  it("em medidas compostas fica com o comprimento (o maior), não a altura", () => {
    expect(extrairComprimentoM("Rodapé 8cm x 2,4m")).toBeCloseTo(2.4, 9);
  });

  it("não trata parafuso 50mm nem área m² como comprimento de peça", () => {
    expect(extrairComprimentoM("Parafuso autoatarraxante 50mm")).toBeNull();
    expect(extrairComprimentoM("Piso vinílico 4m²")).toBeNull();
  });

  it("nome sem medida retorna null", () => {
    expect(extrairComprimentoM("Cadeira de escritório")).toBeNull();
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
