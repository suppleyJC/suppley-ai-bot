/**
 * Trava a BUSCA DE NCM sobre descrição hierárquica.
 *
 * O defeito que estes testes existem para impedir: 95,4% das 11.023 linhas de
 * `ncm_tax_rates` guardam o caminho completo ("39 Plástico e suas obras. >
 * 39.26 Outras obras... > 3926.90.90 Outras"), e a busca antiga fazia
 * LIKE '%termo%' sobre esse texto. Buscar "plástico" casava com o capítulo 39
 * INTEIRO — o nome do capítulo está em todas as suas ~900 linhas. Pior, o
 * `LIMIT 200` era aplicado ANTES do ranqueamento e sem ORDER BY, então a
 * resposta certa muitas vezes nem entrava no conjunto de candidatos, e o
 * desempate pelo menor código criava viés sistemático para o começo do capítulo.
 *
 * O que precisa continuar valendo:
 *   1. a folha (o item de fato) é separável do caminho herdado;
 *   2. quem casa na FOLHA vence quem casa só no nome do capítulo;
 *   3. a descrição do produto ENTRA na recuperação, não só o nome curto;
 *   4. sem o índice FULLTEXT o sistema degrada, mas não quebra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, execMock, limitMock } = vi.hoisted(() => {
  const execMock = vi.fn();
  const limitMock = vi.fn();
  const dbMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: limitMock,
    execute: execMock,
  };
  return { dbMock, execMock, limitMock };
});

vi.mock("../db", () => ({ getDb: vi.fn(async () => dbMock) }));
vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn(), MODELS: { balanced: "m" } }));

import {
  searchNCMs,
  folhaDaDescricao,
  resetDeteccaoFulltext,
  clearNCMCaches,
} from "./ncmService";

/** Linhas com a forma REAL da tabela: caminho hierárquico completo. */
const CAP39 = "39 Plástico e suas obras.";
const POS3926 = "39.26 Outras obras de plástico e obras de outras matérias das posições 39.01 a 39.14.";

const LINHAS = [
  {
    ncmCode: "39269090",
    description: `${CAP39} > ${POS3926} > 3926.90 - Outras > 3926.90.90 Outras`,
    iiRate: 1800,
  },
  {
    ncmCode: "39232110",
    description: `${CAP39} > 39.23 Artigos de transporte ou de embalagem, de plástico > 3923.21 - De polímeros de etileno > 3923.21.10 De capacidade inferior ou igual a 1.000 cm3`,
    iiRate: 1800,
  },
  {
    // A folha nomeia o produto procurado; o caminho não menciona "solenoide".
    ncmCode: "84818092",
    description: `84 Reatores nucleares, caldeiras, máquinas e instrumentos mecânicos. > 84.81 Torneiras, válvulas e dispositivos semelhantes > 8481.80 - Outros dispositivos > 8481.80.92 Válvulas solenoides`,
    iiRate: 1400,
  },
];

/** Faz a conexão simular índice FULLTEXT presente e devolver `linhas`. */
function comFulltext(linhas: any[]) {
  execMock.mockReset();
  execMock.mockImplementation(async (q: any) => {
    const texto = String(q?.queryChunks?.map?.((c: any) => c?.value ?? "").join(" ") ?? "");
    if (texto.includes("STATISTICS") || texto.includes("information_schema")) {
      return [[{ n: 1 }]];
    }
    return [linhas];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearNCMCaches();
  resetDeteccaoFulltext();
  limitMock.mockResolvedValue([]);
});

describe("folhaDaDescricao", () => {
  it("separa o item do caminho herdado do capítulo", () => {
    expect(folhaDaDescricao(LINHAS[0].description)).toBe("3926.90.90 Outras");
    expect(folhaDaDescricao(LINHAS[2].description)).toBe("8481.80.92 Válvulas solenoides");
  });

  it("devolve o texto inteiro quando não há caminho", () => {
    expect(folhaDaDescricao("Tachas")).toBe("Tachas");
    expect(folhaDaDescricao(null)).toBe("");
  });
});

describe("searchNCMs — ranqueamento por folha", () => {
  it("promove quem casa na FOLHA sobre quem casa só no nome do capítulo", async () => {
    // Todas as três linhas voltam do banco (como voltariam de um LIKE amplo).
    // Só a terceira tem "solenoide" na folha — ela tem que vir primeiro, mesmo
    // sendo a última na ordem de chegada e a de maior código.
    comFulltext(LINHAS);

    const r = await searchNCMs("válvula solenoide");

    expect(r[0].ncmCode).toBe("84818092");
  });

  it("a contagem na folha vence a pontuação bruta do FULLTEXT", async () => {
    // Caso REAL medido contra a base de produção, buscando "garrafa térmica
    // inox": a máquina de encher garrafas tem a MAIOR pontuação de FULLTEXT
    // (37,84 contra 24,94), mas casa um termo só na folha. Quem descreve o
    // ITEM tem que ganhar de quem apenas compartilha vocabulário — foi por
    // este caso que a combinação multiplicativa foi abandonada.
    comFulltext([
      {
        ncmCode: "84223010",
        description:
          "84 Reatores nucleares, caldeiras, máquinas. > 84.22 Máquinas de lavar louça > 8422.30 - Para encher > 8422.30.10 Máquinas e aparelhos para encher, fechar, arrolhar, capsular ou rotular garrafas",
        iiRate: 1400,
        score: 37.84,
      },
      {
        ncmCode: "96170010",
        description:
          "96 Obras diversas. > 96.17 Garrafas térmicas e outros recipientes isotérmicos > 9617.00.10 Garrafas térmicas e outros recipientes isotérmicos",
        iiRate: 1800,
        score: 24.94,
      },
    ]);

    const r = await searchNCMs("garrafa termica inox parede dupla");

    expect(r[0].ncmCode).toBe("96170010");
  });

  it("casa termo sem acento contra descrição acentuada", async () => {
    // A consulta vem de proforma, com frequência sem acentuação; a folha tem
    // "térmicas". Se a comparação em JS fosse literal, a folha não pontuaria e
    // o critério principal do ranqueamento ficaria sempre zerado.
    comFulltext([
      {
        ncmCode: "96170010",
        description: "96 Obras diversas. > 9617.00.10 Garrafas térmicas e outros recipientes isotérmicos",
        iiRate: 1800,
        score: 1,
      },
      { ncmCode: "39269090", description: `${CAP39} > ${POS3926} > 3926.90.90 Outras`, iiRate: 1800, score: 9 },
    ]);

    const r = await searchNCMs("garrafa termica");

    expect(r[0].ncmCode).toBe("96170010");
  });

  it("não decide por menor código quando há empate de termos", async () => {
    // O viés antigo: empate na pontuação → localeCompare do código → sempre o
    // menor. Aqui '39232110' é o menor e NÃO pode ganhar de quem casa na folha.
    comFulltext(LINHAS);

    const r = await searchNCMs("solenoide");

    expect(r[0].ncmCode).not.toBe("39232110");
  });
});

describe("searchNCMs — a descrição entra na recuperação", () => {
  it("usa o contexto do produto, não só o nome comercial", async () => {
    comFulltext(LINHAS);

    // O nome comercial não diz nada classificável; o detalhe técnico sim.
    await searchNCMs("Item FX-220", 20, "válvula solenoide de comando elétrico");

    const consultas = execMock.mock.calls
      .map((c) => JSON.stringify(c[0]?.queryChunks ?? ""))
      .join(" ");
    expect(consultas).toContain("solenoide");
  });

  it("distingue o cache por contexto — mesmo nome, detalhes diferentes", async () => {
    comFulltext(LINHAS);

    await searchNCMs("Cabo", 20, "condutor de cobre isolado em PVC");
    const chamadasApos1 = execMock.mock.calls.length;
    await searchNCMs("Cabo", 20, "cabo de aço para içamento");

    // Se o cache ignorasse o contexto, a segunda busca devolveria a primeira.
    expect(execMock.mock.calls.length).toBeGreaterThan(chamadasApos1);
  });
});

describe("searchNCMs — degradação sem o índice", () => {
  it("cai para LIKE quando ft_ncm_description não existe, sem quebrar", async () => {
    execMock.mockResolvedValue([[{ n: 0 }]]); // índice ausente
    limitMock.mockResolvedValue(LINHAS);

    const r = await searchNCMs("válvula solenoide");

    expect(r.length).toBeGreaterThan(0);
    expect(r[0].ncmCode).toBe("84818092"); // o ranqueamento por folha continua valendo
  });

  it("não estoura quando o banco devolve algo que não é lista", async () => {
    execMock.mockResolvedValue([[{ n: 0 }]]);
    limitMock.mockResolvedValue(undefined as any);

    await expect(searchNCMs("qualquer coisa")).resolves.toEqual([]);
  });
});

describe("searchNCMs — busca por código", () => {
  it("trata consulta numérica como prefixo de código, sem passar pelo FULLTEXT", async () => {
    execMock.mockResolvedValue([[{ n: 1 }]]);
    limitMock.mockResolvedValue([LINHAS[0]]);

    const r = await searchNCMs("3926");

    expect(r).toHaveLength(1);
    expect(limitMock).toHaveBeenCalled();
  });
});
