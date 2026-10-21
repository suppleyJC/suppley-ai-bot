/**
 * Trava a NORMALIZAÇÃO de preço para a base canônica da FAMÍLIA do conjunto.
 *
 * O defeito original: a consolidação somava `brlPresente` de observações em
 * unidades e Incoterms diferentes, produzindo média sem significado.
 *
 * A correção seguinte, igualmente importante: a base canônica NÃO é sempre kg.
 * Invoices e cotações declaram a unidade — tonelada, milheiro, metro, unidade.
 * Milheiro de prego compara com milheiro; converter para kg exigiria peso, que
 * é justamente a informação que às vezes falta.
 *
 * O que precisa continuar valendo:
 *   1. dentro da família, a conversão é exata e automática;
 *   2. ENTRE famílias só há conversão com peso unitário — nunca por chute;
 *   3. unidade ambígua ("MT", "caixa") é recusada, não adivinhada;
 *   4. o que não converte é excluído COM MOTIVO;
 *   5. Incoterm ausente não vira FOB por omissão.
 */
import { describe, it, expect } from "vitest";
import {
  normalizarObservacao,
  normalizarObservacoes,
  detectarFamilia,
  resumirExclusoes,
  interpretarUnidade,
  grupoIncoterm,
  faixaQuantidade,
  UNIDADE_CANONICA,
  type ObservacaoPreco,
  type ObservacaoNormalizada,
  type ExclusaoPreco,
} from "./precoNormalizacao";

const HOJE = new Date("2026-10-14T00:00:00Z");

/** Observação mínima válida: o caso do percarbonato (US$ 590/ton FOB). */
function obs(over: Partial<ObservacaoPreco> = {}): ObservacaoPreco {
  return {
    fonte: "proforma",
    precoUnit: 590,
    moeda: "USD",
    unidade: "ton",
    incoterm: "FOB",
    dataCotacao: "2026-09-14",
    ...over,
  };
}

function ok(r: ObservacaoNormalizada | ExclusaoPreco): ObservacaoNormalizada {
  if ("motivo" in r) throw new Error(`esperava normalizar, veio exclusão: ${r.motivo} — ${r.detalhe}`);
  return r;
}

function excl(r: ObservacaoNormalizada | ExclusaoPreco): ExclusaoPreco {
  if (!("motivo" in r)) throw new Error("esperava exclusão, veio observação normalizada");
  return r;
}

describe("interpretação de unidade", () => {
  it("reconhece massa e converte para kg", () => {
    expect(interpretarUnidade("ton")).toEqual({ familia: "massa", fator: 1000 });
    expect(interpretarUnidade("KG")).toEqual({ familia: "massa", fator: 1 });
    expect(interpretarUnidade("g")).toEqual({ familia: "massa", fator: 0.001 });
    expect(interpretarUnidade("lbs")).toEqual({ familia: "massa", fator: 0.45359237 });
  });

  it("reconhece contagem, inclusive milheiro, cento, dúzia e par", () => {
    expect(interpretarUnidade("un")).toEqual({ familia: "contagem", fator: 1 });
    expect(interpretarUnidade("milheiro")).toEqual({ familia: "contagem", fator: 1000 });
    expect(interpretarUnidade("cento")).toEqual({ familia: "contagem", fator: 100 });
    expect(interpretarUnidade("dúzia")).toEqual({ familia: "contagem", fator: 12 });
    expect(interpretarUnidade("par")).toEqual({ familia: "contagem", fator: 2 });
    expect(interpretarUnidade("peças")).toEqual({ familia: "contagem", fator: 1 });
  });

  it("reconhece comprimento, área e volume", () => {
    expect(interpretarUnidade("metro")).toEqual({ familia: "comprimento", fator: 1 });
    expect(interpretarUnidade("km")).toEqual({ familia: "comprimento", fator: 1000 });
    expect(interpretarUnidade("ft")).toEqual({ familia: "comprimento", fator: 0.3048 });
    expect(interpretarUnidade("m²")).toEqual({ familia: "area", fator: 1 });
    expect(interpretarUnidade("litros")).toEqual({ familia: "volume", fator: 1 });
    expect(interpretarUnidade("m³")).toEqual({ familia: "volume", fator: 1000 });
  });

  it("RECUSA unidade ambígua em vez de adivinhar", () => {
    // "MT" é tonelada métrica no comex e metro em obra — adivinhar erra por
    // três ordens de grandeza. "Caixa" depende de quantas peças cabem.
    expect(interpretarUnidade("MT")).toBe("ambigua");
    expect(interpretarUnidade("caixa")).toBe("ambigua");
    expect(interpretarUnidade("rolo")).toBe("ambigua");
    expect(interpretarUnidade("fardo")).toBe("ambigua");
  });

  it("devolve null para unidade desconhecida", () => {
    expect(interpretarUnidade("xyz")).toBeNull();
    expect(interpretarUnidade("")).toBeNull();
  });
});

describe("conversão dentro da família", () => {
  it("tonelada vira kg", () => {
    // US$ 590/ton = US$ 0,59/kg — o caso real do percarbonato.
    expect(ok(normalizarObservacao(obs(), "massa", { hoje: HOJE })).precoUsdCanonico).toBeCloseTo(0.59, 6);
  });

  it("milheiro vira unidade", () => {
    // US$ 85/milheiro de prego = US$ 0,085/un.
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 85, unidade: "milheiro" }), "contagem", { hoje: HOJE },
    ));
    expect(r.precoUsdCanonico).toBeCloseTo(0.085, 6);
  });

  it("quilômetro vira metro", () => {
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 1200, unidade: "km" }), "comprimento", { hoje: HOJE },
    ));
    expect(r.precoUsdCanonico).toBeCloseTo(1.2, 6);
  });

  it("registra o ajuste aplicado", () => {
    const r = ok(normalizarObservacao(obs(), "massa", { hoje: HOJE }));
    expect(r.ajustes.join(" ")).toMatch(/ton→kg: ÷1000/);
  });
});

describe("conversão entre famílias", () => {
  it("contagem vira massa COM peso unitário", () => {
    // US$ 85/milheiro, peça de 0,05 kg → 0,085/un ÷ 0,05 = US$ 1,70/kg.
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 85, unidade: "milheiro", pesoUnitarioKg: 0.05 }), "massa", { hoje: HOJE },
    ));
    expect(r.precoUsdCanonico).toBeCloseTo(1.7, 6);
  });

  it("massa vira contagem COM peso unitário", () => {
    // US$ 1,70/kg, peça de 0,05 kg → US$ 0,085/un.
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 1.7, unidade: "kg", pesoUnitarioKg: 0.05 }), "contagem", { hoje: HOJE },
    ));
    expect(r.precoUsdCanonico).toBeCloseTo(0.085, 6);
  });

  it("EXCLUI contagem→massa sem peso — não inventa o peso", () => {
    const e = excl(normalizarObservacao(obs({ precoUnit: 25, unidade: "un" }), "massa", { hoje: HOJE }));
    expect(e.motivo).toBe("sem_peso_unitario");
  });

  it("EXCLUI famílias sem ponte física — metro não vira kg", () => {
    const e = excl(normalizarObservacao(
      obs({ precoUnit: 3, unidade: "metro", pesoUnitarioKg: 0.2 }), "massa", { hoje: HOJE },
    ));
    expect(e.motivo).toBe("familia_incompativel");
  });

  it("EXCLUI unidade ambígua mesmo com peso informado", () => {
    const e = excl(normalizarObservacao(
      obs({ unidade: "MT", pesoUnitarioKg: 1 }), "massa", { hoje: HOJE },
    ));
    expect(e.motivo).toBe("unidade_ambigua");
  });
});

describe("detecção da família do conjunto", () => {
  it("elege a família mais frequente", () => {
    expect(detectarFamilia([
      obs({ unidade: "milheiro" }), obs({ unidade: "un" }), obs({ unidade: "kg" }),
    ])).toBe("contagem");
  });

  it("empate resolve em massa — mantém comparabilidade com o Comex Stat", () => {
    expect(detectarFamilia([obs({ unidade: "un" }), obs({ unidade: "kg" })])).toBe("massa");
  });

  it("ignora ambíguas e desconhecidas na eleição", () => {
    expect(detectarFamilia([
      obs({ unidade: "MT" }), obs({ unidade: "xyz" }), obs({ unidade: "metro" }),
    ])).toBe("comprimento");
  });

  it("devolve null quando nada é interpretável", () => {
    expect(detectarFamilia([obs({ unidade: "caixa" })])).toBeNull();
    expect(detectarFamilia([])).toBeNull();
  });
});

describe("incoterm", () => {
  it("classifica pelos grupos de ajuste", () => {
    expect(grupoIncoterm("FOB")).toBe("fob");
    expect(grupoIncoterm("cif")).toBe("pos_embarque");
    expect(grupoIncoterm("EXW")).toBe("pre_embarque");
    expect(grupoIncoterm("DDP")).toBe("entregue");
    expect(grupoIncoterm(null)).toBe("desconhecido");
  });

  it("CIF vira FOB subtraindo frete e seguro", () => {
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 700, incoterm: "CIF", freteUnit: 100, seguroUnit: 10 }), "massa", { hoje: HOJE },
    ));
    expect(r.precoUsdCanonico).toBeCloseTo(0.59, 6);
  });

  it("EXCLUI CIF sem o frete embutido", () => {
    const e = excl(normalizarObservacao(obs({ precoUnit: 700, incoterm: "CIF" }), "massa", { hoje: HOJE }));
    expect(e.motivo).toBe("incoterm_sem_componentes");
  });

  it("EXW soma despesas de embarque, e zero é valor válido", () => {
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 590, incoterm: "EXW", despesasEmbarqueUnit: 0 }), "massa", { hoje: HOJE },
    ));
    expect(r.precoUsdCanonico).toBeCloseTo(0.59, 6);
  });

  it("DDP converte mas avisa que o FOB resultante é teto", () => {
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 800, incoterm: "DDP", freteUnit: 150, seguroUnit: 10 }), "massa", { hoje: HOJE },
    ));
    expect(r.ajustes.join(" ")).toMatch(/teto/i);
  });

  it("EXCLUI Incoterm ausente por padrão — não assume FOB por omissão", () => {
    const e = excl(normalizarObservacao(obs({ incoterm: null }), "massa", { hoje: HOJE }));
    expect(e.motivo).toBe("incoterm_desconhecido");
  });

  it("assume FOB só com opção explícita, e registra a suposição", () => {
    const r = ok(normalizarObservacao(
      obs({ incoterm: null }), "massa", { hoje: HOJE, assumirFobQuandoDesconhecido: true },
    ));
    expect(r.ajustes.join(" ")).toMatch(/assumido como FOB/i);
  });

  it("EXCLUI quando o frete embutido supera o preço", () => {
    const e = excl(normalizarObservacao(
      obs({ precoUnit: 100, incoterm: "CIF", freteUnit: 150 }), "massa", { hoje: HOJE },
    ));
    expect(e.motivo).toBe("ajuste_invalido");
  });
});

describe("câmbio", () => {
  it("USD dispensa câmbio", () => {
    expect(ok(normalizarObservacao(obs(), "massa", { hoje: HOJE })).precoUsdCanonico).toBeCloseTo(0.59, 6);
  });

  it("deriva moeda→USD a partir do par com BRL", () => {
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 2955, moeda: "BRL", cambioMoedaBrl: 1, cambioUsdBrl: 5.0096 }),
      "massa", { hoje: HOJE },
    ));
    expect(r.precoUsdCanonico).toBeCloseTo(2955 / 5.0096 / 1000, 6);
  });

  it("EXCLUI moeda estrangeira sem câmbio da data", () => {
    expect(excl(normalizarObservacao(obs({ moeda: "EUR" }), "massa", { hoje: HOJE })).motivo)
      .toBe("sem_cambio");
  });
});

describe("quantidade, faixa e idade", () => {
  it("converte a quantidade e classifica a faixa na unidade da família", () => {
    const r = ok(normalizarObservacao(obs({ quantidade: 27 }), "massa", { hoje: HOJE }));
    expect(r.quantidadeCanonica).toBeCloseTo(27_000, 6);
    expect(r.faixa).toBe("conteiner");
  });

  it("os limiares respeitam a família", () => {
    expect(faixaQuantidade(50, "massa")).toBe("amostra");
    expect(faixaQuantidade(27_000, "massa")).toBe("conteiner");
    expect(faixaQuantidade(60_000, "contagem")).toBe("multiplo");
    expect(faixaQuantidade(500, "area")).toBe("parcial");
    expect(faixaQuantidade(null, "massa")).toBeNull();
  });

  it("mede a idade em meses", () => {
    expect(ok(normalizarObservacao(obs({ dataCotacao: "2026-04-14" }), "massa", { hoje: HOJE })).idadeMeses)
      .toBeCloseTo(6, 0);
  });

  it("idade é null sem data — ausência não vira zero", () => {
    expect(ok(normalizarObservacao(obs({ dataCotacao: null }), "massa", { hoje: HOJE })).idadeMeses).toBeNull();
  });
});

describe("conjunto", () => {
  it("o caso que motivou a camada: unidades e Incoterms diferentes convergem", () => {
    const r = normalizarObservacoes([
      obs({ ref: "A", precoUnit: 590, unidade: "ton", incoterm: "FOB" }),
      obs({ ref: "B", precoUnit: 0.59, unidade: "kg", incoterm: "FOB" }),
      obs({ ref: "C", precoUnit: 700, unidade: "ton", incoterm: "CIF", freteUnit: 100, seguroUnit: 10 }),
    ], { hoje: HOJE });

    expect(r.familia).toBe("massa");
    expect(r.unidadeCanonica).toBe("kg");
    expect(r.consideradas).toHaveLength(3);
    for (const c of r.consideradas) expect(c.precoUsdCanonico).toBeCloseTo(0.59, 6);
  });

  it("conjunto de contagem fica em unidade — não é forçado a kg", () => {
    const r = normalizarObservacoes([
      obs({ ref: "mil", precoUnit: 85, unidade: "milheiro" }),
      obs({ ref: "un", precoUnit: 0.085, unidade: "un" }),
      obs({ ref: "ct", precoUnit: 8.5, unidade: "cento" }),
    ], { hoje: HOJE });

    expect(r.familia).toBe("contagem");
    expect(r.unidadeCanonica).toBe("un");
    expect(r.consideradas).toHaveLength(3);
    for (const c of r.consideradas) expect(c.precoUsdCanonico).toBeCloseTo(0.085, 6);
  });

  it("a família pode ser imposta pelo chamador", () => {
    const r = normalizarObservacoes(
      [obs({ precoUnit: 85, unidade: "milheiro", pesoUnitarioKg: 0.05 })],
      { hoje: HOJE, familia: "massa" },
    );
    expect(r.unidadeCanonica).toBe("kg");
    expect(r.consideradas[0].precoUsdCanonico).toBeCloseTo(1.7, 6);
  });

  it("separa o que entrou do que ficou de fora, com motivo", () => {
    const r = normalizarObservacoes([
      obs({ ref: "ok" }),
      obs({ ref: "sem-incoterm", incoterm: null }),
      obs({ ref: "ambigua", unidade: "MT" }),
      obs({ ref: "cif-cru", incoterm: "CIF", precoUnit: 700 }),
    ], { hoje: HOJE });

    expect(r.consideradas).toHaveLength(1);
    expect(resumirExclusoes(r.excluidas)).toEqual({
      incoterm_desconhecido: 1,
      unidade_ambigua: 1,
      incoterm_sem_componentes: 1,
    });
  });

  it("sem nenhuma unidade interpretável, tudo é excluído com motivo", () => {
    const r = normalizarObservacoes([obs({ unidade: "caixa" }), obs({ unidade: "xyz" })], { hoje: HOJE });
    expect(r.familia).toBeNull();
    expect(r.consideradas).toHaveLength(0);
    expect(resumirExclusoes(r.excluidas)).toEqual({ unidade_ambigua: 1, unidade_desconhecida: 1 });
  });

  it("não quebra com lista vazia", () => {
    expect(normalizarObservacoes([], { hoje: HOJE }).consideradas).toEqual([]);
  });

  it("EXCLUI preço não positivo", () => {
    expect(excl(normalizarObservacao(obs({ precoUnit: 0 }), "massa", { hoje: HOJE })).motivo)
      .toBe("preco_invalido");
  });

  it("a unidade canônica de cada família é estável", () => {
    expect(UNIDADE_CANONICA).toEqual({
      massa: "kg", contagem: "un", comprimento: "m", area: "m²", volume: "L",
    });
  });
});
