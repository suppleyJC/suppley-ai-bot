/**
 * Trava a NORMALIZAÇÃO de preço para a base canônica FOB US$/kg.
 *
 * O defeito que estes testes existem para impedir está em produção hoje, em
 * `precificarReferencia.ts:161-180`: a consolidação soma `brlPresente` de
 * observações em unidades diferentes — R$/kg de uma proforma com R$/unidade de
 * um ativo — e de Incoterms diferentes. A média resultante não tem
 * significado, e o erro é invisível porque o número sai formatado igual.
 *
 * O que precisa continuar valendo:
 *   1. tudo converge para FOB US$/kg antes de qualquer média;
 *   2. o que NÃO dá para converter é excluído COM MOTIVO, nunca estimado;
 *   3. Incoterm ausente não vira FOB por omissão;
 *   4. `0` é componente válido; só `null`/`undefined` são ausência.
 */
import { describe, it, expect } from "vitest";
import {
  normalizarObservacao,
  normalizarObservacoes,
  resumirExclusoes,
  fatorParaKg,
  grupoIncoterm,
  faixaQuantidade,
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

describe("unidades", () => {
  it("converte tonelada para kg", () => {
    // US$ 590/ton = US$ 0,59/kg — o caso real do percarbonato.
    expect(ok(normalizarObservacao(obs(), { hoje: HOJE })).precoUsdKg).toBeCloseTo(0.59, 6);
  });

  it("mantém kg como está", () => {
    const r = ok(normalizarObservacao(obs({ precoUnit: 0.59, unidade: "kg" }), { hoje: HOJE }));
    expect(r.precoUsdKg).toBeCloseTo(0.59, 6);
  });

  it("reconhece grafias e plurais", () => {
    expect(fatorParaKg("KG")).toBe(1);
    expect(fatorParaKg("Toneladas")).toBe(1000);
    expect(fatorParaKg("kgs")).toBe(1);
    expect(fatorParaKg("lbs")).toBeCloseTo(0.45359237, 8);
    expect(fatorParaKg("g")).toBeCloseTo(0.001, 8);
  });

  it("trata unidade por peça como dependente de peso, não como erro", () => {
    expect(fatorParaKg("un")).toBe("precisa_peso");
    expect(fatorParaKg("peças")).toBe("precisa_peso");
    expect(fatorParaKg("pcs")).toBe("precisa_peso");
  });

  it("converte por peça QUANDO há peso unitário", () => {
    // 25 USD por peça de 2,5 kg = 10 USD/kg.
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 25, unidade: "un", pesoUnitarioKg: 2.5 }), { hoje: HOJE },
    ));
    expect(r.precoUsdKg).toBeCloseTo(10, 6);
  });

  it("EXCLUI por peça sem peso unitário — não inventa o peso", () => {
    const e = excl(normalizarObservacao(obs({ precoUnit: 25, unidade: "un" }), { hoje: HOJE }));
    expect(e.motivo).toBe("sem_peso_unitario");
  });

  it("EXCLUI unidade que não é de massa", () => {
    const e = excl(normalizarObservacao(obs({ unidade: "litro" }), { hoje: HOJE }));
    expect(e.motivo).toBe("unidade_nao_conversivel");
  });
});

describe("incoterm", () => {
  it("classifica pelos grupos de ajuste", () => {
    expect(grupoIncoterm("FOB")).toBe("fob");
    expect(grupoIncoterm("cif")).toBe("pos_embarque");
    expect(grupoIncoterm("EXW")).toBe("pre_embarque");
    expect(grupoIncoterm("DDP")).toBe("entregue");
    expect(grupoIncoterm(null)).toBe("desconhecido");
    expect(grupoIncoterm("XYZ")).toBe("desconhecido");
  });

  it("CIF vira FOB subtraindo frete e seguro", () => {
    // 700/ton CIF, com 100 de frete e 10 de seguro → 590/ton FOB = 0,59/kg.
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 700, incoterm: "CIF", freteUnit: 100, seguroUnit: 10 }), { hoje: HOJE },
    ));
    expect(r.precoUsdKg).toBeCloseTo(0.59, 6);
    expect(r.ajustes.join(" ")).toMatch(/CIF→FOB/);
  });

  it("EXCLUI CIF sem o frete embutido — a dedução não é estimável", () => {
    const e = excl(normalizarObservacao(obs({ precoUnit: 700, incoterm: "CIF" }), { hoje: HOJE }));
    expect(e.motivo).toBe("incoterm_sem_componentes");
  });

  it("EXW vira FOB somando despesas de embarque, e zero é valor válido", () => {
    const comZero = ok(normalizarObservacao(
      obs({ precoUnit: 590, incoterm: "EXW", despesasEmbarqueUnit: 0 }), { hoje: HOJE },
    ));
    expect(comZero.precoUsdKg).toBeCloseTo(0.59, 6);

    const comCusto = ok(normalizarObservacao(
      obs({ precoUnit: 580, incoterm: "EXW", despesasEmbarqueUnit: 10 }), { hoje: HOJE },
    ));
    expect(comCusto.precoUsdKg).toBeCloseTo(0.59, 6);
  });

  it("DDP converte mas avisa que o FOB resultante é teto", () => {
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 800, incoterm: "DDP", freteUnit: 150, seguroUnit: 10 }), { hoje: HOJE },
    ));
    expect(r.ajustes.join(" ")).toMatch(/teto/i);
  });

  it("EXCLUI Incoterm ausente por padrão — não assume FOB por omissão", () => {
    const e = excl(normalizarObservacao(obs({ incoterm: null }), { hoje: HOJE }));
    expect(e.motivo).toBe("incoterm_desconhecido");
  });

  it("assume FOB só com opção explícita, e registra a suposição", () => {
    const r = ok(normalizarObservacao(
      obs({ incoterm: null }), { hoje: HOJE, assumirFobQuandoDesconhecido: true },
    ));
    expect(r.precoUsdKg).toBeCloseTo(0.59, 6);
    expect(r.ajustes.join(" ")).toMatch(/assumido como FOB/i);
  });

  it("EXCLUI quando frete embutido supera o preço", () => {
    const e = excl(normalizarObservacao(
      obs({ precoUnit: 100, incoterm: "CIF", freteUnit: 150 }), { hoje: HOJE },
    ));
    expect(e.motivo).toBe("ajuste_invalido");
  });
});

describe("câmbio", () => {
  it("USD dispensa câmbio", () => {
    expect(ok(normalizarObservacao(obs(), { hoje: HOJE })).precoUsdKg).toBeCloseTo(0.59, 6);
  });

  it("deriva moeda→USD a partir do par com BRL", () => {
    // 2.955 BRL/ton, BRL→BRL = 1, USD→BRL = 5,0096 → 589,87 USD/ton.
    const r = ok(normalizarObservacao(
      obs({ precoUnit: 2955, moeda: "BRL", cambioMoedaBrl: 1, cambioUsdBrl: 5.0096 }),
      { hoje: HOJE },
    ));
    expect(r.precoUsdKg).toBeCloseTo(2955 / 5.0096 / 1000, 6);
  });

  it("EXCLUI moeda estrangeira sem câmbio da data", () => {
    const e = excl(normalizarObservacao(obs({ moeda: "EUR" }), { hoje: HOJE }));
    expect(e.motivo).toBe("sem_cambio");
  });
});

describe("quantidade e idade", () => {
  it("converte a quantidade para kg e classifica a faixa", () => {
    const r = ok(normalizarObservacao(obs({ quantidade: 27 }), { hoje: HOJE })); // 27 ton
    expect(r.quantidadeKg).toBeCloseTo(27_000, 6);
    expect(r.faixa).toBe("conteiner");
  });

  it("separa amostra de lote — cotações de faixas diferentes não são o mesmo preço", () => {
    expect(faixaQuantidade(50)).toBe("amostra");
    expect(faixaQuantidade(3_000)).toBe("parcial");
    expect(faixaQuantidade(27_000)).toBe("conteiner");
    expect(faixaQuantidade(60_000)).toBe("multiplo");
    expect(faixaQuantidade(null)).toBeNull();
  });

  it("mede a idade em meses a partir da data da cotação", () => {
    const r = ok(normalizarObservacao(obs({ dataCotacao: "2026-04-14" }), { hoje: HOJE }));
    expect(r.idadeMeses).toBeCloseTo(6, 0);
  });

  it("idade é null sem data — ausência não vira zero nem 24", () => {
    expect(ok(normalizarObservacao(obs({ dataCotacao: null }), { hoje: HOJE })).idadeMeses).toBeNull();
  });
});

describe("conjunto", () => {
  it("o caso que motivou a camada: unidades e Incoterms diferentes convergem", () => {
    // As três descrevem o MESMO preço por caminhos diferentes. Antes desta
    // camada, a consolidação somava 590, 0,59 e 700 como se fossem comparáveis.
    const r = normalizarObservacoes([
      obs({ ref: "A", precoUnit: 590, unidade: "ton", incoterm: "FOB" }),
      obs({ ref: "B", precoUnit: 0.59, unidade: "kg", incoterm: "FOB" }),
      obs({ ref: "C", precoUnit: 700, unidade: "ton", incoterm: "CIF", freteUnit: 100, seguroUnit: 10 }),
    ], { hoje: HOJE });

    expect(r.consideradas).toHaveLength(3);
    for (const c of r.consideradas) expect(c.precoUsdKg).toBeCloseTo(0.59, 6);
  });

  it("separa o que entrou do que ficou de fora, com motivo", () => {
    const r = normalizarObservacoes([
      obs({ ref: "ok" }),
      obs({ ref: "sem-incoterm", incoterm: null }),
      obs({ ref: "sem-peso", unidade: "un", precoUnit: 25 }),
      obs({ ref: "cif-cru", incoterm: "CIF", precoUnit: 700 }),
    ], { hoje: HOJE });

    expect(r.consideradas).toHaveLength(1);
    expect(r.excluidas).toHaveLength(3);
    expect(resumirExclusoes(r.excluidas)).toEqual({
      incoterm_desconhecido: 1,
      sem_peso_unitario: 1,
      incoterm_sem_componentes: 1,
    });
  });

  it("não quebra com lista vazia", () => {
    expect(normalizarObservacoes([], { hoje: HOJE })).toEqual({ consideradas: [], excluidas: [] });
  });

  it("EXCLUI preço não positivo", () => {
    expect(excl(normalizarObservacao(obs({ precoUnit: 0 }), { hoje: HOJE })).motivo).toBe("preco_invalido");
    expect(excl(normalizarObservacao(obs({ precoUnit: -5 }), { hoje: HOJE })).motivo).toBe("preco_invalido");
  });
});
