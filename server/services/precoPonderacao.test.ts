/**
 * Trava a MÉDIA PONDERADA de preço.
 *
 * O que precisa continuar valendo:
 *   1. tempo vira PESO (decai), viés vira CORREÇÃO (multiplica o preço) —
 *      são erros de natureza diferente e não se tratam do mesmo jeito;
 *   2. a meia-vida sai da volatilidade do item, não é fixa;
 *   3. o mesmo fornecedor cotando N vezes não vale N fontes;
 *   4. invoice executada pesa mais que oferta;
 *   5. com amostra de um, a faixa é NULA — nunca zero, que leria como
 *      precisão absoluta.
 */
import { describe, it, expect } from "vitest";
import {
  ponderarPrecos,
  meiaVidaMeses,
  pesoRecencia,
  pesoAderencia,
  PESO_FONTE,
  MEIA_VIDA_PADRAO_MESES,
} from "./precoPonderacao";
import type { ObservacaoNormalizada, FontePreco, FaixaQuantidade } from "./precoNormalizacao";

function norm(p: {
  ref?: string;
  fonte?: FontePreco;
  fornecedor?: string | null;
  fornecedorId?: number | null;
  precoUsdCanonico: number;
  idadeMeses?: number | null;
  faixa?: FaixaQuantidade | null;
}): ObservacaoNormalizada {
  return {
    obs: {
      ref: p.ref,
      fonte: p.fonte ?? "cotacao",
      fornecedor: p.fornecedor ?? null,
      fornecedorId: p.fornecedorId ?? null,
      precoUnit: p.precoUsdCanonico,
      moeda: "USD",
      unidade: "kg",
      incoterm: "FOB",
    },
    precoUsdCanonico: p.precoUsdCanonico,
    quantidadeCanonica: null,
    faixa: p.faixa ?? null,
    idadeMeses: p.idadeMeses ?? 0,
    ajustes: [],
  };
}

describe("meia-vida pela volatilidade", () => {
  it("ancora em 12 meses para 10% de volatilidade — o valor fixo de hoje", () => {
    expect(meiaVidaMeses(10)).toBeCloseTo(12, 6);
  });

  it("encurta com item volátil e alonga com item estável", () => {
    expect(meiaVidaMeses(40)).toBeCloseTo(3, 6);
    expect(meiaVidaMeses(20)).toBeCloseTo(6, 6);
    expect(meiaVidaMeses(5)).toBeCloseTo(24, 6); // teto
  });

  it("respeita piso e teto", () => {
    expect(meiaVidaMeses(1000)).toBe(2);
    expect(meiaVidaMeses(0.1)).toBe(24);
  });

  it("sem volatilidade conhecida, mantém o comportamento atual", () => {
    expect(meiaVidaMeses(null)).toBe(MEIA_VIDA_PADRAO_MESES);
    expect(meiaVidaMeses(undefined)).toBe(MEIA_VIDA_PADRAO_MESES);
    expect(meiaVidaMeses(-5)).toBe(MEIA_VIDA_PADRAO_MESES);
  });
});

describe("decaimento por recência", () => {
  it("vale 1 hoje, 0,5 em uma meia-vida e 0,25 em duas", () => {
    expect(pesoRecencia(0, 12)).toBeCloseTo(1, 6);
    expect(pesoRecencia(12, 12)).toBeCloseTo(0.5, 6);
    expect(pesoRecencia(24, 12)).toBeCloseTo(0.25, 6);
  });

  it("sem data, trata como antiga — não como recente", () => {
    expect(pesoRecencia(null, 12)).toBeCloseTo(0.25, 6); // 24 meses assumidos
  });
});

describe("aderência de faixa", () => {
  it("não penaliza quando não há faixa alvo declarada", () => {
    expect(pesoAderencia("amostra", null)).toBe(1);
  });

  it("penaliza conforme a distância entre faixas", () => {
    expect(pesoAderencia("conteiner", "conteiner")).toBe(1);
    expect(pesoAderencia("parcial", "conteiner")).toBe(0.85);
    expect(pesoAderencia("amostra", "conteiner")).toBe(0.65);
    expect(pesoAderencia("amostra", "multiplo")).toBe(0.5);
  });

  it("faixa desconhecida leva penalidade branda, não exclusão", () => {
    expect(pesoAderencia(null, "conteiner")).toBe(0.8);
  });
});

describe("ponderação", () => {
  it("a cotação recente pesa o dobro da que está a uma meia-vida", () => {
    const r = ponderarPrecos([
      norm({ ref: "nova", fornecedor: "A", precoUsdCanonico: 0.6, idadeMeses: 0 }),
      norm({ ref: "velha", fornecedor: "B", precoUsdCanonico: 0.8, idadeMeses: 12 }),
    ])!;
    // pesos 1 e 0,5 → 2/3 e 1/3
    expect(r.precoUsdCanonico).toBeCloseTo(0.6 * (2 / 3) + 0.8 * (1 / 3), 6);
    expect(r.composicao.find((c) => c.ref === "nova")!.peso).toBeCloseTo(2 / 3, 6);
  });

  it("volatilidade alta faz a cotação antiga perder relevância mais rápido", () => {
    const obs = [
      norm({ ref: "nova", fornecedor: "A", precoUsdCanonico: 0.6, idadeMeses: 0 }),
      norm({ ref: "velha", fornecedor: "B", precoUsdCanonico: 1.2, idadeMeses: 12 }),
    ];
    const estavel = ponderarPrecos(obs, { volatilidadePct: 5 })!;
    const volatil = ponderarPrecos(obs, { volatilidadePct: 40 })!;
    // Com meia-vida curta a antiga some; o preço se aproxima da nova.
    expect(volatil.precoUsdCanonico).toBeLessThan(estavel.precoUsdCanonico);
    expect(volatil.precoUsdCanonico).toBeCloseTo(0.6, 1);
  });

  it("invoice executada pesa mais que oferta na mesma data", () => {
    const r = ponderarPrecos([
      norm({ ref: "inv", fonte: "invoice", fornecedor: "A", precoUsdCanonico: 1.0 }),
      norm({ ref: "cot", fonte: "cotacao", fornecedor: "B", precoUsdCanonico: 2.0 }),
    ])!;
    const soma = PESO_FONTE.invoice + PESO_FONTE.cotacao;
    expect(r.precoUsdCanonico).toBeCloseTo(
      (1.0 * PESO_FONTE.invoice + 2.0 * PESO_FONTE.cotacao) / soma, 6,
    );
    expect(r.composicao.find((c) => c.ref === "inv")!.peso)
      .toBeGreaterThan(r.composicao.find((c) => c.ref === "cot")!.peso);
  });

  it("o mesmo fornecedor cotando N vezes não vale N fontes", () => {
    // X cota duas vezes a 1,00; Y cota uma vez a 2,00. Sem cluster a média
    // seria 1,33 (X domina por quantidade). Com √n, X vale √2 unidades.
    const r = ponderarPrecos([
      norm({ fornecedorId: 1, fornecedor: "X", precoUsdCanonico: 1.0 }),
      norm({ fornecedorId: 1, fornecedor: "X", precoUsdCanonico: 1.0 }),
      norm({ fornecedorId: 2, fornecedor: "Y", precoUsdCanonico: 2.0 }),
    ])!;
    const esperado = (2 * Math.SQRT1_2 * 1.0 + 1 * 2.0) / (2 * Math.SQRT1_2 + 1);
    expect(r.precoUsdCanonico).toBeCloseTo(esperado, 6);
    expect(r.precoUsdCanonico).toBeGreaterThan(4 / 3); // maior que a média sem cluster
  });

  it("agrupa pelo id do fornecedor mesmo com grafias diferentes do nome", () => {
    const r = ponderarPrecos([
      norm({ fornecedorId: 7, fornecedor: "Acme Ltd", precoUsdCanonico: 1.0 }),
      norm({ fornecedorId: 7, fornecedor: "ACME LTDA", precoUsdCanonico: 1.0 }),
    ])!;
    expect(r.composicao[0].fatorCluster).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("CORREÇÃO DE VIÉS multiplica o PREÇO, não o peso", () => {
    // É o ponto central do modelo: baixar o peso de uma fonte enviesada ainda
    // puxa o número para o mesmo lado. A correção desloca o valor.
    const r = ponderarPrecos(
      [norm({ fonte: "mercado", fornecedor: null, precoUsdCanonico: 1.0 })],
      { correcaoPorFonte: { mercado: 1.2 } },
    )!;
    expect(r.precoUsdCanonico).toBeCloseTo(1.2, 6);
    expect(r.composicao[0].precoOriginalUsdCanonico).toBeCloseTo(1.0, 6);
    expect(r.composicao[0].peso).toBeCloseTo(1, 6); // o peso não mudou
  });

  it("os pesos normalizados somam 1", () => {
    const r = ponderarPrecos([
      norm({ fonte: "invoice", fornecedor: "A", precoUsdCanonico: 1.0, idadeMeses: 3 }),
      norm({ fonte: "cotacao", fornecedor: "B", precoUsdCanonico: 1.2, idadeMeses: 9 }),
      norm({ fonte: "mercado", fornecedor: null, precoUsdCanonico: 0.8, idadeMeses: 1 }),
    ])!;
    expect(r.composicao.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1, 10);
  });
});

describe("incerteza declarada", () => {
  it("com uma observação a faixa é NULA, não zero", () => {
    const r = ponderarPrecos([norm({ fornecedor: "A", precoUsdCanonico: 1.0 })])!;
    expect(r.faixaUsdCanonico).toBeNull();
    expect(r.nEfetivo).toBeCloseTo(1, 6);
  });

  it("duas observações de peso igual dão n efetivo 2", () => {
    const r = ponderarPrecos([
      norm({ fornecedor: "A", precoUsdCanonico: 1.0 }),
      norm({ fornecedor: "B", precoUsdCanonico: 1.0 }),
    ])!;
    expect(r.nEfetivo).toBeCloseTo(2, 6);
  });

  it("observações dispersas produzem faixa larga", () => {
    const r = ponderarPrecos([
      norm({ fornecedor: "A", precoUsdCanonico: 0.5 }),
      norm({ fornecedor: "B", precoUsdCanonico: 1.5 }),
    ])!;
    expect(r.faixaUsdCanonico).not.toBeNull();
    expect(r.faixaUsdCanonico!.max - r.faixaUsdCanonico!.min).toBeGreaterThan(1);
    expect(r.dispersaoPct).toBeGreaterThan(40);
  });

  it("a faixa nunca desce abaixo de zero", () => {
    const r = ponderarPrecos([
      norm({ fornecedor: "A", precoUsdCanonico: 0.1 }),
      norm({ fornecedor: "B", precoUsdCanonico: 5.0 }),
    ])!;
    expect(r.faixaUsdCanonico!.min).toBeGreaterThanOrEqual(0);
  });
});

describe("avisos", () => {
  it("avisa quando a amostra efetiva é pequena", () => {
    const r = ponderarPrecos([norm({ fornecedor: "A", precoUsdCanonico: 1.0 })])!;
    expect(r.avisos.join(" ")).toMatch(/amostra efetiva/i);
  });

  it("avisa quando tudo vem de um fornecedor só", () => {
    const r = ponderarPrecos([
      norm({ fornecedorId: 1, fornecedor: "X", precoUsdCanonico: 1.0 }),
      norm({ fornecedorId: 1, fornecedor: "X", precoUsdCanonico: 1.1 }),
    ])!;
    expect(r.avisos.join(" ")).toMatch(/único fornecedor/i);
  });

  it("avisa quando fonte declaratória domina sem correção de viés", () => {
    const r = ponderarPrecos([
      norm({ fonte: "mercado", fornecedor: null, precoUsdCanonico: 1.0 }),
      norm({ fonte: "cotacao", fornecedor: "B", precoUsdCanonico: 1.1, idadeMeses: 24 }),
    ])!;
    expect(r.avisos.join(" ")).toMatch(/declaratória sem correção/i);
  });

  it("NÃO avisa de viés quando a correção foi aplicada", () => {
    const r = ponderarPrecos(
      [
        norm({ fonte: "mercado", fornecedor: null, precoUsdCanonico: 1.0 }),
        norm({ fonte: "cotacao", fornecedor: "B", precoUsdCanonico: 1.1, idadeMeses: 24 }),
      ],
      { correcaoPorFonte: { mercado: 1.18 } },
    )!;
    expect(r.avisos.join(" ")).not.toMatch(/declaratória sem correção/i);
  });

  it("avisa quando uma observação domina o resultado", () => {
    const r = ponderarPrecos([
      norm({ fonte: "invoice", fornecedor: "A", precoUsdCanonico: 1.0, idadeMeses: 0 }),
      norm({ fonte: "manual", fornecedor: "B", precoUsdCanonico: 2.0, idadeMeses: 36 }),
    ])!;
    expect(r.avisos.join(" ")).toMatch(/domina/i);
  });
});

describe("bordas", () => {
  it("lista vazia devolve null", () => {
    expect(ponderarPrecos([])).toBeNull();
    expect(ponderarPrecos(undefined as never)).toBeNull();
  });

  it("caso realista: invoice antiga, cotação recente e mercado declaratório", () => {
    const r = ponderarPrecos(
      [
        norm({ ref: "inv", fonte: "invoice", fornecedorId: 1, fornecedor: "A", precoUsdCanonico: 0.58, idadeMeses: 7, faixa: "conteiner" }),
        norm({ ref: "cot", fonte: "cotacao", fornecedorId: 2, fornecedor: "B", precoUsdCanonico: 0.59, idadeMeses: 1, faixa: "conteiner" }),
        norm({ ref: "mkt", fonte: "mercado", fornecedor: null, precoUsdCanonico: 0.44, idadeMeses: 2, faixa: null }),
      ],
      { volatilidadePct: 12, faixaAlvo: "conteiner", correcaoPorFonte: { mercado: 1.18 } },
    )!;

    // O declaratório corrigido (0,44 × 1,18 = 0,52) deixa de puxar tanto.
    expect(r.precoUsdCanonico).toBeGreaterThan(0.52);
    expect(r.precoUsdCanonico).toBeLessThan(0.6);
    expect(r.nEfetivo).toBeGreaterThan(2);
    expect(r.faixaUsdCanonico).not.toBeNull();
    expect(r.meiaVidaMeses).toBeCloseTo(10, 6); // 120/12
  });
});
