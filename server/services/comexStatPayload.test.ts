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
    // A primeira é a "documentada" (filters/details/metrics) — a única que a
    // sonda contra a API real confirmou aplicar o filtro de NCM (as demais
    // devolvem o agregado nacional em silêncio, HTTP 200 sem erro).
    expect(corpos[0]).toHaveProperty("filters");
    expect(corpos[0]).toHaveProperty("details");
    expect(corpos[0]).toHaveProperty("metrics", ["metricFOB", "metricKG"]);
  });

  it("carrega TODAS as NCMs do recorte, como número (schema documentado espera número)", () => {
    const [documentado] = bodiesMercado("import", NCMS, "2024-01", "2024-12", "pais") as any[];
    expect(documentado.filters[0].filter).toBe("ncm");
    // Somar um mercado exige mandar a lista inteira numa consulta só.
    expect(documentado.filters[0].values).toEqual([73170010, 73170020]);
  });

  it("usa a dimensão de detalhe certa para país e para UF", () => {
    const [pais] = bodiesMercado("import", NCMS, "2024-01", "2024-12", "pais") as any[];
    expect(pais.details).toEqual(["country"]);

    const [uf] = bodiesMercado("import", NCMS, "2024-01", "2024-12", "uf") as any[];
    expect(uf.details).toEqual(["state"]);
  });

  it("propaga o período e o fluxo pedidos", () => {
    const [documentado] = bodiesMercado("export", NCMS, "2023-03", "2025-07", "pais") as any[];
    expect(documentado.flow).toBe("export");
    expect(documentado.period).toEqual({ from: "2023-03", to: "2025-07" });
    // monthDetail desligado: o recorte é anual, não mensal.
    expect(documentado.monthDetail).toBe(false);
  });

  it("a variação de fallback 'portal' carrega as NCMs como string de 8 dígitos", () => {
    const corpos = bodiesMercado("import", NCMS, "2024-01", "2024-12", "uf") as any[];
    const portal = corpos[1];
    expect(portal.filterArray[0].idInput).toBe("ncm");
    expect(portal.filterArray[0].item).toEqual(NCMS);
    expect(portal.detailDatabase[0].id).toBe("state");
  });
});
