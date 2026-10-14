/**
 * Trava a precificação de referência (camada pura): valor presente da base e
 * comparação com a média oficial — o que vira argumento de negociação.
 */
import { describe, it, expect } from "vitest";
import { montarReferencia, type BaseRef, type ExternoRef } from "./referencePricingService";

const baseKg: BaseRef = {
  fonte: "proforma",
  produto: "Prego cabeça simples 17x27",
  ncm: "73170020",
  fornecedor: "Acme Ltd",
  moeda: "USD",
  precoUnit: 1.0, // US$ 1,00/kg
  unidade: "KG",
  dataCotacao: "2025-06-01",
  cambioNaData: 5.0, // na data
};

const externo: ExternoRef = {
  disponivel: true,
  ncm: "73170020",
  precoMedioUsdKg: 1.2, // média oficial US$ 1,20/kg
  tendenciaPreco: "estavel",
  topOrigens: [{ pais: "China", precoMedioUsdKg: 1.1 }],
  escopo: "brasil",
};

describe("montarReferencia", () => {
  it("traz a base a valor presente com o câmbio de hoje", () => {
    const r = montarReferencia({
      termo: "prego 17x27", base: baseKg, externo: null,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    expect(r.base!.brlNaData).toBeCloseTo(5.0, 4);     // 1,00 × 5,00
    expect(r.base!.brlPresente).toBeCloseTo(6.0, 4);   // 1,00 × 6,00
    expect(r.base!.variacaoCambialPct).toBeCloseTo(20, 4); // câmbio +20%
  });

  it("compara base × externo (kg) e aponta a base como mais competitiva", () => {
    const r = montarReferencia({
      termo: "prego 17x27", base: baseKg, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    // base presente 6,00/kg vs externo 1,20×6,00 = 7,20/kg → base mais barata
    expect(r.comparavel).toBe(true);
    expect(r.maisCompetitivo).toBe("base");
    expect(r.diffPct!).toBeLessThan(0);
    expect(r.leitura).toMatch(/ABAIXO/);
  });

  it("aponta base ACIMA da média como alavanca de negociação", () => {
    const caro: BaseRef = { ...baseKg, precoUnit: 1.5 }; // 1,50 → presente 9,00/kg
    const r = montarReferencia({
      termo: "prego 17x27", base: caro, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    expect(r.maisCompetitivo).toBe("externo");
    expect(r.leitura).toMatch(/ACIMA|negociar/);
  });

  it("não compara direto quando a base é por unidade (não-kg)", () => {
    const un: BaseRef = { ...baseKg, unidade: "UN" };
    const r = montarReferencia({
      termo: "prego 17x27", base: un, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: 6.0,
    });
    expect(r.comparavel).toBe(false);
    expect(r.leitura).toMatch(/peso por unidade|limitada/i);
  });

  it("funciona só com externo (sem base na empresa)", () => {
    const r = montarReferencia({
      termo: "item novo", base: null, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: null,
    });
    expect(r.encontrouBase).toBe(false);
    expect(r.externo!.brlPorKgPresente).toBeCloseTo(7.2, 4);
  });

  it("rotula sutilmente quando o preço é GLOBAL", () => {
    const r = montarReferencia({
      termo: "item novo", base: null,
      externo: { ...externo, escopo: "global" },
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: null,
    });
    expect(r.leitura).toMatch(/global/i);
  });

  it("NÃO rotula quando o preço é de importação para o Brasil", () => {
    const r = montarReferencia({
      termo: "item", base: null, externo,
      cambioHojeUsdBrl: 6.0, cambioHojeMoedaBrl: null,
    });
    expect(r.leitura).not.toMatch(/global/i);
  });
});

/**
 * CONJUNTO DE OBSERVAÇÕES — a `base` única passa a ser o caso particular de
 * uma lista de um elemento.
 *
 * O defeito que esta parte existe para impedir está em produção hoje, em
 * `precificarReferencia.ts:102-104`: a cotação exibida é escolhida por
 * `sort((x,y) => x.brlPresente - y.brlPresente)[0]` — a MAIS BARATA. Isso
 * enviesa a base própria para baixo, na mesma direção do viés de
 * subdeclaração da fonte pública: os dois erros se somam em vez de se
 * cancelarem.
 */
describe("montarReferencia — conjunto de observações", () => {
  const obsBase = {
    fonte: "proforma" as const,
    produto: "Percarbonato de sódio",
    ncm: "28369920",
    moeda: "USD",
    unidade: "ton",
    incoterm: "FOB",
  };

  it("escolhe a representativa pela RECÊNCIA, não pelo menor preço", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, ref: "antiga-barata", fornecedor: "A", precoUnit: 480, dataCotacao: "2024-02-01" },
        { ...obsBase, ref: "recente-cara", fornecedor: "B", precoUnit: 590, dataCotacao: "2026-09-14" },
      ],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.conjunto?.representativa?.obs.ref).toBe("recente-cara");
    expect(r.conjunto?.representativa?.precoUsdKg).toBeCloseTo(0.59, 6);
  });

  it("deriva a base do conjunto quando ela não é passada", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      externo,
      cambioHojeUsdBrl: 5.0096,
      observacoes: [{ ...obsBase, fornecedor: "B", precoUnit: 590, dataCotacao: "2026-09-14" }],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.encontrouBase).toBe(true);
    expect(r.base?.unidade).toBe("kg");
    expect(r.base?.moeda).toBe("USD");
    expect(r.base?.precoUnit).toBeCloseTo(0.59, 6);
  });

  it("normaliza unidades e Incoterms diferentes antes de formar a faixa", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fornecedor: "A", precoUnit: 590, unidade: "ton", dataCotacao: "2026-09-01" },
        { ...obsBase, fornecedor: "B", precoUnit: 0.62, unidade: "kg", dataCotacao: "2026-08-01" },
        { ...obsBase, fornecedor: "C", precoUnit: 700, unidade: "ton", incoterm: "CIF",
          freteUnit: 100, seguroUnit: 10, dataCotacao: "2026-07-01" },
      ],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.conjunto?.consideradas).toHaveLength(3);
    expect(r.conjunto?.minUsdKg).toBeCloseTo(0.59, 6);
    expect(r.conjunto?.maxUsdKg).toBeCloseTo(0.62, 6);
    expect(r.conjunto?.fornecedoresDistintos).toBe(3);
  });

  it("não conta o mesmo fornecedor como várias fontes", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fornecedorId: 7, fornecedor: "Acme", precoUnit: 590, dataCotacao: "2026-09-01" },
        { ...obsBase, fornecedorId: 7, fornecedor: "Acme", precoUnit: 600, dataCotacao: "2026-06-01" },
        { ...obsBase, fornecedorId: 9, fornecedor: "Outra", precoUnit: 610, dataCotacao: "2026-05-01" },
      ],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.conjunto?.consideradas).toHaveLength(3);
    expect(r.conjunto?.fornecedoresDistintos).toBe(2);
  });

  it("guarda o que não deu para normalizar, com motivo — não descarta em silêncio", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fornecedor: "A", precoUnit: 590, dataCotacao: "2026-09-01" },
        { ...obsBase, fornecedor: "B", precoUnit: 700, incoterm: "CIF", dataCotacao: "2026-08-01" },
        { ...obsBase, fornecedor: "C", precoUnit: 25, unidade: "un", dataCotacao: "2026-07-01" },
      ],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.conjunto?.consideradas).toHaveLength(1);
    expect(r.conjunto?.excluidas.map((e) => e.motivo).sort()).toEqual(
      ["incoterm_sem_componentes", "sem_peso_unitario"],
    );
  });

  it("conta por fonte — invoice e cotação não são a mesma evidência", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fonte: "invoice", fornecedor: "A", precoUnit: 580, dataCotacao: "2026-03-01" },
        { ...obsBase, fonte: "cotacao", fornecedor: "B", precoUnit: 590, dataCotacao: "2026-09-01" },
        { ...obsBase, fonte: "cotacao", fornecedor: "C", precoUnit: 600, dataCotacao: "2026-08-01" },
      ],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.conjunto?.porFonte).toEqual({ invoice: 1, cotacao: 2 });
  });

  it("cotação por peça com peso passa a ser comparável com a média oficial", () => {
    // Antes, base em "un" bloqueava a comparação (`comparavel: false`).
    const r = montarReferencia({
      termo: "item por peça",
      externo,
      cambioHojeUsdBrl: 5.0,
      observacoes: [{
        fonte: "cotacao", produto: "Peça", ncm: "73170020", fornecedor: "A",
        precoUnit: 2.5, moeda: "USD", unidade: "un", pesoUnitarioKg: 2.5,
        incoterm: "FOB", dataCotacao: "2026-09-01",
      }],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.comparavel).toBe(true);
    expect(r.base?.precoUnit).toBeCloseTo(1.0, 6); // US$ 2,50 / 2,5 kg
  });

  it("mantém o contrato original: sem `observacoes`, conjunto é null", () => {
    const r = montarReferencia({
      termo: "prego", base: baseKg, externo,
      cambioHojeUsdBrl: 5.5, cambioHojeMoedaBrl: 5.5,
    });

    expect(r.conjunto).toBeNull();
    expect(r.base?.precoUnit).toBe(1.0);
  });

  it("a base explícita tem precedência sobre o conjunto", () => {
    const r = montarReferencia({
      termo: "prego", base: baseKg,
      cambioHojeUsdBrl: 5.5, cambioHojeMoedaBrl: 5.5,
      observacoes: [{ ...obsBase, fornecedor: "Z", precoUnit: 999, dataCotacao: "2026-10-01" }],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.base?.fornecedor).toBe("Acme Ltd");
    expect(r.conjunto?.consideradas).toHaveLength(1); // o conjunto continua disponível
  });

  it("conjunto sem nenhuma observação normalizável não quebra a leitura", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [{ ...obsBase, fornecedor: "A", precoUnit: 590, incoterm: null }],
      opcoesNormalizacao: { hoje: new Date("2026-10-14T00:00:00Z") },
    });

    expect(r.conjunto?.consideradas).toHaveLength(0);
    expect(r.conjunto?.representativa).toBeNull();
    expect(r.encontrouBase).toBe(false);
    expect(r.leitura).toContain("Sem preço na base");
  });
});

describe("montarReferencia — base vem da PONDERAÇÃO, não de uma cotação isolada", () => {
  const obsBase = {
    fonte: "cotacao" as const,
    produto: "Percarbonato de sódio",
    ncm: "28369920",
    moeda: "USD",
    unidade: "ton",
    incoterm: "FOB",
  };
  const hoje = new Date("2026-10-14T00:00:00Z");

  it("o preço da base é a média ponderada, não a observação mais recente", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fornecedor: "A", precoUnit: 600, dataCotacao: "2026-10-14" }, // hoje
        { ...obsBase, fornecedor: "B", precoUnit: 800, dataCotacao: "2025-10-14" }, // 1 meia-vida
      ],
      opcoesNormalizacao: { hoje },
    });

    // pesos 1 e 0,5 → (0,60·2 + 0,80)/3 = 0,6667
    expect(r.base?.precoUnit).toBeCloseTo(0.6667, 3);
    expect(r.conjunto?.representativa?.obs.fornecedor).toBe("A"); // âncora continua a recente
    expect(r.conjunto?.ponderado?.precoUsdKg).toBeCloseTo(0.6667, 3);
  });

  it("não atribui a média a um fornecedor específico", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fornecedor: "A", precoUnit: 590, dataCotacao: "2026-09-01" },
        { ...obsBase, fornecedor: "B", precoUnit: 610, dataCotacao: "2026-08-01" },
      ],
      opcoesNormalizacao: { hoje },
    });

    expect(r.conjunto?.fornecedoresDistintos).toBe(2);
    expect(r.base?.fornecedor).toBeNull();
    expect(r.leitura).toContain("referência ponderada da base");
  });

  it("com um fornecedor só, mantém a atribuição", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [{ ...obsBase, fornecedorId: 1, fornecedor: "Acme", precoUnit: 590, dataCotacao: "2026-09-01" }],
      opcoesNormalizacao: { hoje },
    });

    expect(r.base?.fornecedor).toBe("Acme");
  });

  it("repassa volatilidade e faixa alvo para a ponderação", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fornecedor: "A", precoUnit: 590, quantidade: 27, dataCotacao: "2026-09-01" },
        { ...obsBase, fornecedor: "B", precoUnit: 900, quantidade: 0.05, dataCotacao: "2026-09-01" },
      ],
      opcoesNormalizacao: { hoje },
      opcoesPonderacao: { volatilidadePct: 40, faixaAlvo: "conteiner" },
    });

    expect(r.conjunto?.ponderado?.meiaVidaMeses).toBeCloseTo(3, 6);
    // a cotação de amostra (50 kg) entra com aderência menor que a de contêiner
    const amostra = r.conjunto!.ponderado!.composicao.find((c) => c.fornecedor === "B")!;
    expect(amostra.pesoAderencia).toBeLessThan(1);
  });

  it("a leitura usa a faixa preditiva quando há dispersão", () => {
    const r = montarReferencia({
      termo: "percarbonato",
      cambioHojeUsdBrl: 5.0096,
      observacoes: [
        { ...obsBase, fornecedor: "A", precoUnit: 500, dataCotacao: "2026-09-01" },
        { ...obsBase, fornecedor: "B", precoUnit: 700, dataCotacao: "2026-09-01" },
      ],
      opcoesNormalizacao: { hoje },
    });

    expect(r.conjunto?.ponderado?.faixaUsdKg).not.toBeNull();
    expect(r.leitura).toMatch(/2 cotações normalizadas a FOB US\$\/kg de 2 fornecedores/);
  });
});
