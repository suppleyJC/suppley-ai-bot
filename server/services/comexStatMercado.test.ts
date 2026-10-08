/**
 * Trava o DIMENSIONAMENTO DE MERCADO (camada pura, sem rede).
 *
 * O que precisa estar certo para a análise não enganar quem decide:
 *  - ranking com posição REAL no universo completo (não na fatia do top N);
 *  - países fixados aparecem mesmo fora do top N, com a posição verdadeira;
 *  - preço médio em US$ por TONELADA (não por kg);
 *  - share somando sobre o total do ano;
 *  - ano corrente marcado como PARCIAL, com a cobertura em meses.
 */
import { describe, it, expect } from "vitest";
import {
  rankearMercado,
  agregarMercadoAno,
  janelaDoAno,
  ultimoMesConsolidado,
  type ComexRow,
} from "./comexStatService";

const paisDe = (r: ComexRow) => String(r.country ?? "—");

// China 2.000.000 US$ / 1.000 t = 2.000 US$/t
// Paraguai 100.000 US$ / 200 t = 500 US$/t  (barato, mas volume pequeno)
const porPais: ComexRow[] = [
  { country: "China", metricFOB: "1500000", metricKG: "750000" },
  { country: "China", metricFOB: "500000", metricKG: "250000" },
  { country: "Alemanha", metricFOB: "900000", metricKG: "150000" },
  { country: "Itália", metricFOB: "700000", metricKG: "200000" },
  { country: "Espanha", metricFOB: "300000", metricKG: "100000" },
  { country: "Paraguai", metricFOB: "100000", metricKG: "200000" },
];

const porUf: ComexRow[] = [
  { state: "Santa Catarina", metricFOB: "2000000", metricKG: "900000" },
  { state: "São Paulo", metricFOB: "1200000", metricKG: "400000" },
  { state: "Paraná", metricFOB: "300000", metricKG: "100000" },
];

describe("rankearMercado", () => {
  it("agrega por chave, ordena por FOB e numera a posição", () => {
    const r = rankearMercado(porPais, paisDe, 10);
    expect(r.total).toBe(5);
    expect(r.linhas[0].chave).toBe("China");
    expect(r.linhas[0].posicao).toBe(1);
    expect(r.linhas[0].fobUsd).toBe(2_000_000); // as duas linhas de China somadas
  });

  it("calcula preço médio em US$ por TONELADA", () => {
    const r = rankearMercado(porPais, paisDe, 10);
    const china = r.linhas.find((l) => l.chave === "China")!;
    expect(china.toneladas).toBeCloseTo(1000, 6);
    expect(china.precoMedioUsdT!).toBeCloseTo(2000, 6);

    const paraguai = r.linhas.find((l) => l.chave === "Paraguai")!;
    expect(paraguai.precoMedioUsdT!).toBeCloseTo(500, 6);
  });

  it("share soma 100% sobre o total do recorte", () => {
    const r = rankearMercado(porPais, paisDe, 10);
    const soma = r.linhas.reduce((s, l) => s + l.sharePct, 0);
    expect(soma).toBeCloseTo(100, 6);
  });

  it("fixa país de destaque fora do top N COM A POSIÇÃO REAL", () => {
    // top 2 = China, Alemanha. Paraguai é o 5º e último — deve entrar mesmo assim.
    const r = rankearMercado(porPais, paisDe, 2, ["Paraguai"]);
    expect(r.linhas).toHaveLength(3);
    const paraguai = r.linhas.find((l) => l.chave === "Paraguai")!;
    expect(paraguai.posicao).toBe(5); // posição no ranking COMPLETO, não 3
  });

  it("não duplica destaque que já está no top N", () => {
    const r = rankearMercado(porPais, paisDe, 5, ["China"]);
    expect(r.linhas.filter((l) => l.chave === "China")).toHaveLength(1);
  });

  it("casa destaque com nome oficial estendido e sem acento", () => {
    const rows: ComexRow[] = [
      { country: "China, República Popular da", metricFOB: "100", metricKG: "100" },
      { country: "Vietnã", metricFOB: "900", metricKG: "100" },
    ];
    const r = rankearMercado(rows, paisDe, 1, ["china"]);
    expect(r.linhas.some((l) => l.chave.startsWith("China"))).toBe(true);
  });
});

describe("agregarMercadoAno", () => {
  it("combina corte por país e por UF, com totais vindos do universo de países", () => {
    const ano = agregarMercadoAno({
      ano: 2024,
      parcial: false,
      mesesCobertos: 12,
      rowsPais: porPais,
      rowsUf: porUf,
      topN: 10,
      paisesDestaque: ["Paraguai"],
      ufsDestaque: ["Santa Catarina"],
    });

    expect(ano.fobUsd).toBe(4_000_000);
    expect(ano.toneladas).toBeCloseTo(1650, 6);
    expect(ano.precoMedioUsdT!).toBeCloseTo(4_000_000 / 1650, 6);
    expect(ano.totalPaises).toBe(5);
    expect(ano.totalUfs).toBe(3);
    expect(ano.porUf[0].chave).toBe("Santa Catarina");
  });

  it("preserva a marcação de ano parcial", () => {
    const ano = agregarMercadoAno({
      ano: 2025, parcial: true, mesesCobertos: 7,
      rowsPais: porPais, rowsUf: porUf, topN: 5,
    });
    expect(ano.parcial).toBe(true);
    expect(ano.mesesCobertos).toBe(7);
  });
});

describe("janelaDoAno", () => {
  const hoje = new Date(2025, 8, 15); // set/2025 → consolidado até jul/2025

  it("ano fechado devolve janela cheia", () => {
    expect(janelaDoAno(2024, hoje)).toEqual({
      from: "2024-01", to: "2024-12", parcial: false, mesesCobertos: 12,
    });
  });

  it("ano corrente devolve janela PARCIAL até o último mês consolidado", () => {
    expect(janelaDoAno(2025, hoje)).toEqual({
      from: "2025-01", to: "2025-07", parcial: true, mesesCobertos: 7,
    });
  });

  it("ano futuro não tem janela", () => {
    expect(janelaDoAno(2026, hoje)).toBeNull();
  });

  it("último mês consolidado respeita a defasagem de 2 meses", () => {
    expect(ultimoMesConsolidado(hoje)).toEqual({ ano: 2025, mes: 7 });
    // virada de ano: fev/2026 → dez/2025
    expect(ultimoMesConsolidado(new Date(2026, 1, 3))).toEqual({ ano: 2025, mes: 12 });
  });
});
