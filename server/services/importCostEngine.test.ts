/**
 * GOLDEN TEST — Paridade com a planilha de referência do contador
 * "Escoras - Trade Lucro Real x Lucro Presumido (Contribuinte revisado)"
 *
 * Os valores esperados foram extraídos DIRETAMENTE das células calculadas
 * da planilha. Se este teste quebrar, o motor divergiu do contador.
 * NÃO ajuste os valores esperados sem validação do contador.
 */
import { describe, it, expect } from "vitest";
import { calculateImportCost } from "./importCostEngine";

const TOL = 0.01; // 1 centavo

const globals = {
  exchangeRate: 5.8,
  freightTotalFob: 18000,
  afrmmTotalBrl: 8449.2,
  siscomexTotalBrl: 154.23,
  demaisDespesasBrl: 20600, // BL 4500 + armazenagem 9000 + frete interno 3600 + despacho 3500
  royaltiesBrl: 167098,
  regime: "lucro_real" as const,
  icmsVendaRate: 0.04,
  pisVendaRate: 0.0165,
  cofinsVendaRate: 0.076,
  lucroDesejado: 0.05,
  applyCofinsLc224: false, // planilha usa 9,65%
};

const items = [
  { description: "Post Shore 2.0-3.5 Galvanized", ncm: "7308.40.00", quantity: 2900, unitPriceFob: 3.2, iiRate: 0.126, ipiRate: 0 },
  { description: "Post Shore 2.2-4.0 Galvanized", ncm: "7308.40.00", quantity: 2500, unitPriceFob: 3.5, iiRate: 0.126, ipiRate: 0 },
];

describe("importCostEngine — paridade com planilha do contador", () => {
  const { items: r, summary } = calculateImportCost(globals, items);

  it("rateia por % do valor FOB", () => {
    expect(r[0].shareOfValue).toBeCloseTo(0.51469772601220187, 10);
    expect(r[1].shareOfValue).toBeCloseTo(0.48530227398779813, 10);
  });

  it("item 1 — valores de nacionalização", () => {
    expect(r[0].fobBrl).toBeCloseTo(53824, 2);
    expect(r[0].freightBrl).toBeCloseTo(53734.442595673878, 2);
    expect(r[0].customsValueBrl).toBeCloseTo(107558.44259567387, 2);
    expect(r[0].afrmmBrl).toBeCloseTo(4348.7840266222966, 2);
    expect(r[0].siscomexBrl).toBeCloseTo(79.381830282861898, 2);
    expect(r[0].demaisDespesasBrl).toBeCloseTo(10602.773155851359, 2);
    expect(r[0].iiValue).toBeCloseTo(13552.363767054907, 2);
    expect(r[0].merchandiseValue).toBeCloseTo(121110.80636272878, 2);
    expect(r[0].pisValue).toBeCloseTo(2258.7272945091513, 2);
    expect(r[0].cofinsValue).toBeCloseTo(10379.389710482528, 2);
  });

  it("item 1 — base do ICMS antecipado inclui AFRMM+Siscomex com gross-up de 4%", () => {
    expect(r[0].icmsBase).toBeCloseTo(143934.46794231836, 2);
    expect(r[0].icmsValue).toBeCloseTo(3742.2961665002772, 2);
  });

  it("item 1 — custo total, custo líquido (Lucro Real) e precificação por fator", () => {
    expect(r[0].totalCost).toBeCloseTo(152522.15854697724, 2);
    expect(r[0].netImportCost).toBeCloseTo(136141.74537548528, 2);
    expect(r[0].markupFactor).toBeCloseTo(0.79174242424242425, 10);
    expect(r[0].salePrice).toBeCloseTo(171952.06573116503, 2);
    expect(r[0].icmsVendaValue).toBeCloseTo(6878.0826292466008, 2);
  });

  it("item 2 — verificação cruzada", () => {
    expect(r[1].customsValueBrl).toBeCloseTo(101415.55740432613, 2);
    expect(r[1].iiValue).toBeCloseTo(12778.360232945093, 2);
    expect(r[1].icmsValue).toBeCloseTo(3528.5658897497224, 2);
    expect(r[1].totalCost).toBeCloseTo(143811.30250927276, 2);
    expect(r[1].netImportCost).toBeCloseTo(128366.4086245147, 2);
    expect(r[1].salePrice).toBeCloseTo(162131.5274943636, 2);
  });

  it("consolidado — totais da aba EST. DE CUSTO", () => {
    expect(summary.cifTotalBrl).toBeCloseTo(208974, 2);
    expect(summary.iiTotal).toBeCloseTo(26330.724, 2);
    expect(summary.pisTotal).toBeCloseTo(4388.454, 2);
    expect(summary.cofinsTotal).toBeCloseTo(20165.991, 2);
    expect(summary.icmsTotal).toBeCloseTo(7270.86205625, 2);
    expect(summary.salePriceTotal).toBeCloseTo(334083.5932255286, 1);
    expect(summary.icmsVendaTotal).toBeCloseTo(13363.343729021144, 1);
  });

  it("margem bruta = lucro desejado / (1 − IRPJ − CSLL)", () => {
    expect(summary.margemBruta).toBeCloseTo(0.05 / (1 - 0.34), 10);
    expect(summary.markupFactor).toBeCloseTo(0.79174242424242425, 10);
  });
});

describe("importCostEngine — variações de regime e configuração", () => {
  it("LC 224/2025 adiciona 0,6% à COFINS quando ativada", () => {
    const { items: r } = calculateImportCost({ ...globals, applyCofinsLc224: true }, items);
    expect(r[0].cofinsRate).toBeCloseTo(0.1025, 6);
    expect(r[0].cofinsValue).toBeCloseTo(107558.44259567387 * 0.1025, 2);
  });

  it("Lucro Presumido não credita PIS/COFINS", () => {
    const { items: r } = calculateImportCost(
      { ...globals, regime: "lucro_presumido", pisVendaRate: 0.0065, cofinsVendaRate: 0.03 },
      items
    );
    expect(r[0].recoverableCredits).toBeCloseTo(r[0].ipiValue + r[0].icmsValue, 2);
    expect(r[0].netImportCost).toBeGreaterThan(136141.75); // custo líquido maior que no Lucro Real
  });

  it("Simples Nacional não credita nada", () => {
    const { items: r } = calculateImportCost({ ...globals, regime: "simples_nacional" }, items);
    expect(r[0].recoverableCredits).toBe(0);
    expect(r[0].netImportCost).toBeCloseTo(r[0].totalCost, 2);
  });

  it("rejeita fator de markup impossível", () => {
    expect(() =>
      calculateImportCost({ ...globals, lucroDesejado: 0.7 }, items)
    ).toThrow(/markup/i);
  });

  it("repasse do benefício TTD: cliente a 4%, trading desembolsa 2,6%, spread é ganho", () => {
    const { items: r, summary } = calculateImportCost(
      { ...globals, icmsNegociadoClienteRate: 0.04 },
      items
    );
    // Desembolso efetivo da trading permanece o da legislação (TTD 2,6%)
    expect(r[0].icmsValue).toBeCloseTo(143934.46794231836 * 0.026, 2);
    // Cliente é onerado pela alíquota negociada (4%)
    expect(r[0].icmsClienteValue).toBeCloseTo(143934.46794231836 * 0.04, 2);
    // Ganho da trading = spread de 1,4 p.p. sobre a base
    expect(r[0].ganhoBeneficioIcms).toBeCloseTo(143934.46794231836 * 0.014, 2);
    expect(summary.ganhoBeneficioIcmsTotal).toBeGreaterThan(0);
    // O custo do cliente sobe em relação ao repasse integral
    expect(r[0].totalCost).toBeGreaterThan(152522.15);
  });

  it("repasse integral (default): ICMS cliente = ICMS efetivo, ganho zero", () => {
    const { items: r, summary } = calculateImportCost(globals, items);
    expect(r[0].icmsClienteValue).toBeCloseTo(r[0].icmsValue, 6);
    expect(summary.ganhoBeneficioIcmsTotal).toBeCloseTo(0, 6);
  });

  it("TTD após 36 meses: alíquota efetiva 1,0% sobrescrevível", () => {
    const { items: r } = calculateImportCost(
      { ...globals, icmsAntecipadoRate: 0.01 },
      items
    );
    expect(r[0].icmsValue).toBeCloseTo(r[0].icmsBase * 0.01, 2);
  });
});

describe("importCostEngine — 2º cenário: revenda do COMPRADOR (Lucro Real)", () => {
  const buyer = {
    icmsVendaRate: 0.12,
    pisVendaRate: 0.0165,
    cofinsVendaRate: 0.076,
    lucroDesejado: 0.15,
    irpjRate: 0.25,
    csllRate: 0.09,
  };

  it("não calcula o comprador quando buyer está ausente", () => {
    const { items: r, summary } = calculateImportCost(globals, items);
    expect(r[0].buyerNetCost).toBeUndefined();
    expect(summary.buyer).toBeUndefined();
  });

  it("custo líquido do comprador = NF venda importador − créditos (ICMS, PIS, COFINS, IPI)", () => {
    const { items: r } = calculateImportCost({ ...globals, royaltiesBrl: 0, buyer }, items);
    const it0 = r[0];
    const esperado =
      it0.totalInvoiceValue -
      it0.ipiVendaValue -
      it0.icmsVendaValue -
      it0.salePrice * buyer.pisVendaRate -
      it0.salePrice * buyer.cofinsVendaRate;
    expect(it0.buyerNetCost).toBeCloseTo(esperado, 2);
  });

  it("markup do comprador = 1 − (ICMS + PIS + COFINS + margem), margem = lucro/(1−IRPJ−CSLL)", () => {
    const { items: r } = calculateImportCost({ ...globals, buyer }, items);
    const margem = buyer.lucroDesejado / (1 - (buyer.irpjRate + buyer.csllRate));
    const markup = 1 - (buyer.icmsVendaRate + buyer.pisVendaRate + buyer.cofinsVendaRate + margem);
    expect(r[0].buyerMarkupFactor).toBeCloseTo(markup, 10);
    expect(r[0].buyerSalePrice).toBeCloseTo((r[0].buyerNetCost ?? 0) / markup, 2);
  });

  it("consolida totais do comprador e o bloco GANHO DA OPERAÇÃO", () => {
    const { items: r, summary } = calculateImportCost(
      { ...globals, royaltiesBrl: 0, icmsNegociadoClienteRate: 0.04, buyer },
      items
    );
    expect(summary.buyer).toBeDefined();
    expect(summary.buyer!.netCostTotal).toBeCloseTo(
      r.reduce((s, x) => s + (x.buyerNetCost ?? 0), 0), 2
    );
    expect(summary.buyer!.salePriceTotal).toBeGreaterThan(0);
    // Ganho da operação = margem venda + margem royalties + ganho ICMS
    expect(summary.ganho.total).toBeCloseTo(
      summary.ganho.margemVenda + summary.ganho.margemRoyalties + summary.ganho.ganhoIcms, 6
    );
    expect(summary.ganho.margemVenda).toBeCloseTo(summary.lucroDesejadoValor, 6);
  });

  it("rejeita markup do comprador impossível", () => {
    expect(() =>
      calculateImportCost({ ...globals, buyer: { ...buyer, lucroDesejado: 0.8 } }, items)
    ).toThrow(/markup do COMPRADOR/i);
  });
});

describe("importCostEngine — finalidade: consumo próprio", () => {
  it("consumo próprio: sem markup, sem impostos de saída, sem crédito; preço = custo", () => {
    const { items: r, summary } = calculateImportCost(
      { ...globals, finalidade: "consumo_proprio" }, items
    );
    expect(summary.finalidade).toBe("consumo_proprio");
    // Sem crédito: custo líquido = custo total (tributos viram custo)
    expect(r[0].recoverableCredits).toBe(0);
    expect(r[0].netImportCost).toBeCloseTo(r[0].totalCost, 2);
    // Sem markup nem impostos de saída: "preço" = custo líquido total
    expect(r[0].markupFactor).toBe(1);
    expect(r[0].salePrice).toBeCloseTo(r[0].netTotalCost, 2);
    expect(r[0].icmsVendaValue).toBe(0);
    expect(r[0].ipiVendaValue).toBe(0);
    // Não calcula comprador mesmo se pedido
    const comBuyer = calculateImportCost(
      { ...globals, finalidade: "consumo_proprio", buyer: { icmsVendaRate: 0.12, lucroDesejado: 0.15 } },
      items
    );
    expect(comBuyer.summary.buyer).toBeUndefined();
  });

  it("revenda (padrão) mantém markup e venda", () => {
    const { summary } = calculateImportCost(globals, items);
    expect(summary.finalidade).toBe("revenda");
    expect(summary.salePriceTotal).toBeGreaterThan(summary.netCostTotal);
  });
});
