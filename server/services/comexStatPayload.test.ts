/**
 * Trava o CONTRATO DE REQUISIÇÃO com o Comex Stat.
 *
 * A camada de rede não é exercitável aqui (o host é bloqueado pela política de
 * egresso do sandbox), então o que dá para garantir é a FORMA do payload: se o
 * período, a dimensão de detalhe ou o tipo das NCMs saírem errados, a fonte
 * devolve vazio e o dimensionamento morre silenciosamente — que foi exatamente
 * o modo de falha original.
 *
 * A validação de ponta a ponta contra a API real é o smoke test em
 * scripts/smoke-comexstat.ts, que roda no ambiente publicado.
 */
import { describe, it, expect } from "vitest";
import { bodiesMercado } from "./comexStatService";

const NCMS = ["73170010", "73170020"];

describe("bodiesMercado", () => {
  it("oferece as três variações conhecidas do schema, na ordem de preferência", () => {
    const corpos = bodiesMercado("import", NCMS, "2024-01", "2024-12", "pais");
    expect(corpos).toHaveLength(3);
    // A primeira é a do portal atual — a que deve funcionar hoje.
    expect(corpos[0]).toHaveProperty("filterArray");
    expect(corpos[0]).toHaveProperty("metricFOB", true);
    expect(corpos[0]).toHaveProperty("metricKG", true);
  });

  it("carrega TODAS as NCMs do recorte, como string de 8 dígitos", () => {
    const [portal] = bodiesMercado("import", NCMS, "2024-01", "2024-12", "pais") as any[];
    expect(portal.filterArray[0].idInput).toBe("ncm");
    expect(portal.filterArray[0].item).toEqual(NCMS);
    // Somar um mercado exige mandar a lista inteira numa consulta só.
    expect(portal.filterArray[0].item).toHaveLength(2);
  });

  it("usa a dimensão de detalhe certa para país e para UF", () => {
    const [pais] = bodiesMercado("import", NCMS, "2024-01", "2024-12", "pais") as any[];
    expect(pais.detailDatabase[0].id).toBe("country");

    const [uf] = bodiesMercado("import", NCMS, "2024-01", "2024-12", "uf") as any[];
    expect(uf.detailDatabase[0].id).toBe("state");
  });

  it("propaga o período e o fluxo pedidos", () => {
    const [portal] = bodiesMercado("export", NCMS, "2023-03", "2025-07", "pais") as any[];
    expect(portal.flow).toBe("export");
    expect(portal.period).toEqual({ from: "2023-03", to: "2025-07" });
    // monthDetail desligado: o recorte é anual, não mensal.
    expect(portal.monthDetail).toBe(false);
  });

  it("a variação enxuta manda NCM numérica (schema alternativo espera número)", () => {
    const corpos = bodiesMercado("import", NCMS, "2024-01", "2024-12", "uf") as any[];
    const enxuto = corpos[2];
    expect(enxuto.filters[0].values).toEqual([73170010, 73170020]);
    expect(enxuto.details).toEqual(["state"]);
  });
});
