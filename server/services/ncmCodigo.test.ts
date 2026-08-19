/**
 * A especificação da normalização de NCM são os DADOS REAIS de produção.
 *
 * Todos os valores abaixo saíram do diagnóstico do catálogo (3.571 produtos):
 * apenas 26,3% estavam em forma canônica; 35,4% tinham grafia divergente e a
 * mesma NCM chegava a existir em cinco formas ao mesmo tempo.
 *
 * O teste mais importante deste arquivo é o último bloco: o que a função se
 * RECUSA a resolver. Um código de 7 dígitos completado por chute vira uma
 * classificação errada com aparência de certeza — o defeito que a migração
 * inteira existe para eliminar.
 */
import { describe, it, expect } from "vitest";
import {
  normalizarNcm,
  ncmCanonico,
  candidatosNcmAmbiguo,
  formatarNcm,
} from "./ncmCodigo";

describe("normalizarNcm — grafias reais do catálogo", () => {
  it("reconhece o que já está canônico sem marcar como conserto", () => {
    const r = normalizarNcm("39233090");
    expect(r.canonico).toBe("39233090");
    expect(r.classe).toBe("canonico");
  });

  it("converge as cinco grafias de 3304.30.00 para o mesmo código", () => {
    // O caso mais grave da base: 140 produtos numa mesma NCM, espalhados em
    // cinco representações que hoje não se agrupam.
    const grafias = ["3304.30.00", "3304.3000", "33043000", "3304300000", "3304300062"];
    const canonicos = grafias.map((g) => ncmCanonico(g));

    expect(new Set(canonicos).size).toBe(1);
    expect(canonicos[0]).toBe("33043000");
  });

  it("trata pontuação como conserto determinístico, não como classificação", () => {
    for (const g of ["3923.30.90", "9503.0090", "39.24.10.00", "7326.9090"]) {
      expect(normalizarNcm(g).classe).toBe("formato");
    }
  });

  it("trunca excesso de dígitos, seja preenchimento ou sufixo interno", () => {
    expect(normalizarNcm("3923300000")).toMatchObject({ canonico: "39233000", classe: "excesso" });
    // '62' no fim não é zero de preenchimento — é sufixo de sistema. Os 8
    // primeiros dígitos continuam sendo a classificação.
    expect(normalizarNcm("3304300062")).toMatchObject({ canonico: "33043000", classe: "excesso" });
  });
});

describe("normalizarNcm — ausência de classificação", () => {
  it("trata os literais legados como ausência, não como código", () => {
    for (const v of ["<UNKNOWN>", "UNKNOWN", "", "   ", "n/d"]) {
      const r = normalizarNcm(v);
      expect(r.canonico).toBeNull();
      expect(r.classe).toBe("ausente");
    }
  });

  it("trata a sentinela 00000000 como ausência, não como NCM válida", () => {
    expect(normalizarNcm("00000000")).toMatchObject({ canonico: null, classe: "ausente" });
  });

  it("aceita entrada não-string sem quebrar", () => {
    for (const v of [null, undefined, 39233090]) {
      expect(() => normalizarNcm(v)).not.toThrow();
    }
    expect(normalizarNcm(39233090).canonico).toBe("39233090");
  });
});

describe("normalizarNcm — o que ela se RECUSA a adivinhar", () => {
  it("não completa código de 7 dígitos: as duas saídas dão capítulos diferentes", () => {
    // '7007190' pode ser 70071900 (vidro) ou 07007190 (produtos hortícolas).
    // Completar por conta própria escolheria um capítulo no escuro.
    const r = normalizarNcm("7007190");
    expect(r.canonico).toBeNull();
    expect(r.classe).toBe("ambiguo");
    expect(r.digitos).toBe("7007190");
  });

  it("marca nível da hierarquia como parcial, não como item", () => {
    // '3923' é posição e '3304.99' é subposição: são níveis reais, mas nenhum
    // é um item de 8 dígitos declarável. Completar com '00' foi exatamente o
    // que produziu os 963 códigos inexistentes do catálogo.
    for (const [v, digitos] of [["39", "39"], ["3923", "3923"], ["3304.99", "330499"]] as const) {
      const r = normalizarNcm(v);
      expect(r.classe).toBe("parcial");
      expect(r.canonico).toBeNull();
      expect(r.digitos).toBe(digitos);
    }
  });

  it("NUNCA transforma subposição em item completando com zeros", () => {
    // A regra que impede a reincidência: '3923.30' não pode virar '39233000',
    // que não existe na nomenclatura e hoje carrega 168 produtos.
    expect(ncmCanonico("3923.30")).toBeNull();
    expect(ncmCanonico("392330")).toBeNull();
  });
});

describe("candidatosNcmAmbiguo", () => {
  it("propõe as duas leituras possíveis, para conferência contra a nomenclatura", () => {
    expect(candidatosNcmAmbiguo("7007190")).toEqual(["70071900", "07007190"]);
  });

  it("não propõe nada fora do caso de 7 dígitos", () => {
    expect(candidatosNcmAmbiguo("3923")).toEqual([]);
    expect(candidatosNcmAmbiguo("39233090")).toEqual([]);
  });
});

describe("formatarNcm", () => {
  it("formata para exibição e deixa passar o que não é canônico", () => {
    expect(formatarNcm("39233090")).toBe("3923.30.90");
    expect(formatarNcm("3923")).toBe("3923");
  });
});
