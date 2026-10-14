/**
 * precoPonderacao — média ponderada de observações já normalizadas.
 *
 * O PROBLEMA QUE RESOLVE. As fontes erram de maneiras diferentes:
 *  - base própria (invoice, proforma, cotação): valor REAL, mas pode ser
 *    antigo. O erro é de tempo.
 *  - fonte pública/paga (Comex Stat e afins): atual, porém DECLARATÓRIA —
 *    importador que declara a menor puxa a média para baixo. O erro é de
 *    nível, e é direcional.
 *
 * Como os dois erros são de natureza distinta, o tratamento é distinto:
 * tempo vira PESO (decai), viés vira CORREÇÃO (multiplica). Baixar o peso de
 * uma fonte enviesada reduz a influência dela, mas continua puxando o número
 * para o mesmo lado — só que menos. Por isso `correcaoPorFonte` existe
 * separada de `PESO_FONTE`.
 *
 * MEIA-VIDA PELA VOLATILIDADE. Decaimento fixo erra nos dois extremos:
 * commodity volátil envelhece em semanas, peça industrial estável aguenta
 * trimestres. A meia-vida sai da volatilidade do próprio item
 * (`previsaoService.volatilidadePct`), ancorada em 12 meses para 10% de
 * volatilidade — que é o valor fixo usado hoje, preservando continuidade.
 *
 * CLUSTER POR FORNECEDOR. Quem cota todo mês não pode dominar a média sobre
 * quem cotou uma vez. O peso de cada observação é dividido por √n do mesmo
 * fornecedor: 4 cotações de um fornecedor valem 2 unidades efetivas, não 4.
 *
 * A FAIXA É PREDITIVA, NÃO INTERVALO DA MÉDIA. A pergunta do usuário é
 * "quanto vou pagar", não "onde está a média populacional". Com n pequeno (o
 * caso normal), o intervalo de confiança da média é estreito e falsamente
 * preciso. Devolvemos a dispersão das próprias observações.
 *
 * CAMADA PURA: sem rede, sem banco, sem relógio implícito.
 */
import type { FaixaQuantidade, FontePreco, ObservacaoNormalizada } from "./precoNormalizacao";

/**
 * Peso por confiabilidade da fonte. São PRIORES a calibrar contra desfecho
 * real, não verdade — um dia saem para tabela versionada, no padrão de
 * `tax_parameters` (vigência + fonte), para ajustar sem deploy.
 *
 * A ordem reflete o compromisso embutido: invoice foi executada e
 * desembaraçada; proforma é compromisso firme; cotação é oferta que pode não
 * se sustentar; mercado é declaração de terceiro; manual é digitação.
 */
export const PESO_FONTE: Record<FontePreco, number> = {
  invoice: 1.0,
  proforma: 0.85,
  cotacao: 0.7,
  mercado: 0.5,
  manual: 0.4,
};

/** Meia-vida em meses quando a volatilidade do item é desconhecida. */
export const MEIA_VIDA_PADRAO_MESES = 12;
const MEIA_VIDA_MIN_MESES = 2;
const MEIA_VIDA_MAX_MESES = 24;
/** Âncora: volatilidade de 10% ⇒ meia-vida de 12 meses (10 × 12). */
const ANCORA_MEIA_VIDA = 120;

/** Sem data de cotação, a observação é tratada como desta idade. */
const IDADE_ASSUMIDA_SEM_DATA_MESES = 24;

const ORDEM_FAIXA: FaixaQuantidade[] = ["amostra", "parcial", "conteiner", "multiplo"];

export interface OpcoesPonderacao {
  /** Volatilidade do item em % (de `previsaoService.volatilidadePct`). */
  volatilidadePct?: number | null;
  /** Faixa de quantidade que o usuário perguntou — base da aderência. */
  faixaAlvo?: FaixaQuantidade | null;
  /** Pesos por fonte (default: `PESO_FONTE`). */
  pesoFonte?: Partial<Record<FontePreco, number>>;
  /**
   * Correção de viés por fonte (multiplica o preço, não o peso). O estimador
   * de `k` por NCM entra na etapa seguinte; aqui só existe o ponto de encaixe.
   * Default: 1,0 para todas.
   */
  correcaoPorFonte?: Partial<Record<FontePreco, number>>;
}

export interface ContribuicaoPreco {
  ref?: string;
  fonte: FontePreco;
  fornecedor: string | null;
  /** Preço já com a correção de viés aplicada. */
  precoUsdKg: number;
  /** Preço antes da correção — para a memória de cálculo. */
  precoOriginalUsdKg: number;
  idadeMeses: number | null;
  pesoFonte: number;
  pesoRecencia: number;
  pesoAderencia: number;
  fatorCluster: number;
  /** Peso final normalizado (soma 1 entre todas as contribuições). */
  peso: number;
}

export interface PrecoPonderado {
  precoUsdKg: number;
  /** Dispersão esperada de uma NOVA cotação. Null com amostra insuficiente. */
  faixaUsdKg: { min: number; max: number } | null;
  /** Tamanho efetivo da amostra (Kish): (Σw)² / Σw². */
  nEfetivo: number;
  /** Coeficiente de variação ponderado, em %. */
  dispersaoPct: number | null;
  meiaVidaMeses: number;
  composicao: ContribuicaoPreco[];
  avisos: string[];
}

/**
 * Meia-vida do dado a partir da volatilidade do item.
 * Quanto mais volátil, mais rápido a cotação antiga perde valor informativo.
 */
export function meiaVidaMeses(volatilidadePct: number | null | undefined): number {
  if (volatilidadePct == null || !Number.isFinite(volatilidadePct) || volatilidadePct <= 0) {
    return MEIA_VIDA_PADRAO_MESES;
  }
  const bruta = ANCORA_MEIA_VIDA / volatilidadePct;
  return Math.min(MEIA_VIDA_MAX_MESES, Math.max(MEIA_VIDA_MIN_MESES, bruta));
}

/** Decaimento exponencial: 1 hoje, 0,5 em uma meia-vida, 0,25 em duas. */
export function pesoRecencia(idadeMeses: number | null, meiaVida: number): number {
  const idade = idadeMeses == null ? IDADE_ASSUMIDA_SEM_DATA_MESES : Math.max(0, idadeMeses);
  return Math.pow(0.5, idade / meiaVida);
}

/**
 * Aderência da cotação ao que foi perguntado. Preço de amostra não é preço de
 * contêiner; quanto mais distante a faixa, menos a observação informa.
 */
export function pesoAderencia(
  faixaObs: FaixaQuantidade | null,
  faixaAlvo: FaixaQuantidade | null | undefined,
): number {
  if (!faixaAlvo) return 1; // sem alvo declarado, não há o que penalizar
  if (!faixaObs) return 0.8; // faixa desconhecida: penalidade branda, não exclusão
  const i = ORDEM_FAIXA.indexOf(faixaObs);
  const j = ORDEM_FAIXA.indexOf(faixaAlvo);
  if (i < 0 || j < 0) return 0.8;
  const distancia = Math.abs(i - j);
  return [1, 0.85, 0.65, 0.5][Math.min(distancia, 3)];
}

/** Chave de agrupamento do fornecedor (id tem precedência sobre o nome). */
function chaveFornecedor(n: ObservacaoNormalizada): string {
  if (n.obs.fornecedorId != null) return `id:${n.obs.fornecedorId}`;
  const nome = (n.obs.fornecedor ?? "").trim().toLowerCase();
  return nome || `anon:${n.obs.ref ?? Math.random()}`;
}

/**
 * Média ponderada das observações normalizadas.
 * Devolve `null` quando não há nenhuma observação utilizável.
 */
export function ponderarPrecos(
  consideradas: ObservacaoNormalizada[],
  opts: OpcoesPonderacao = {},
): PrecoPonderado | null {
  if (!consideradas?.length) return null;

  const pesoFonte = { ...PESO_FONTE, ...(opts.pesoFonte ?? {}) };
  const correcao = opts.correcaoPorFonte ?? {};
  const meiaVida = meiaVidaMeses(opts.volatilidadePct);

  // Quantas observações cada fornecedor trouxe — base do cluster.
  const porFornecedor = new Map<string, number>();
  for (const n of consideradas) {
    const k = chaveFornecedor(n);
    porFornecedor.set(k, (porFornecedor.get(k) ?? 0) + 1);
  }

  const brutos = consideradas.map((n) => {
    const fonte = n.obs.fonte;
    const wFonte = pesoFonte[fonte] ?? 0.5;
    const wRecencia = pesoRecencia(n.idadeMeses, meiaVida);
    const wAderencia = pesoAderencia(n.faixa, opts.faixaAlvo);
    const nFornecedor = porFornecedor.get(chaveFornecedor(n)) ?? 1;
    const fatorCluster = 1 / Math.sqrt(nFornecedor);
    const k = correcao[fonte] ?? 1;

    return {
      ref: n.obs.ref,
      fonte,
      fornecedor: n.obs.fornecedor ?? null,
      precoOriginalUsdKg: n.precoUsdKg,
      precoUsdKg: n.precoUsdKg * k,
      idadeMeses: n.idadeMeses,
      pesoFonte: wFonte,
      pesoRecencia: wRecencia,
      pesoAderencia: wAderencia,
      fatorCluster,
      pesoBruto: wFonte * wRecencia * wAderencia * fatorCluster,
    };
  });

  const somaPeso = brutos.reduce((s, b) => s + b.pesoBruto, 0);
  if (!(somaPeso > 0)) return null;

  const composicao: ContribuicaoPreco[] = brutos.map((b) => ({
    ref: b.ref,
    fonte: b.fonte,
    fornecedor: b.fornecedor,
    precoUsdKg: b.precoUsdKg,
    precoOriginalUsdKg: b.precoOriginalUsdKg,
    idadeMeses: b.idadeMeses,
    pesoFonte: b.pesoFonte,
    pesoRecencia: b.pesoRecencia,
    pesoAderencia: b.pesoAderencia,
    fatorCluster: b.fatorCluster,
    peso: b.pesoBruto / somaPeso,
  }));

  const precoUsdKg = composicao.reduce((s, c) => s + c.peso * c.precoUsdKg, 0);

  // n efetivo de Kish: quanto a amostra "vale" depois da ponderação.
  const somaQuad = brutos.reduce((s, b) => s + b.pesoBruto * b.pesoBruto, 0);
  const nEfetivo = (somaPeso * somaPeso) / somaQuad;

  // Dispersão ponderada das observações (não da média) — ver cabeçalho.
  const variancia = composicao.reduce(
    (s, c) => s + c.peso * Math.pow(c.precoUsdKg - precoUsdKg, 2),
    0,
  );
  const desvio = Math.sqrt(variancia);
  const dispersaoPct = precoUsdKg > 0 ? (desvio / precoUsdKg) * 100 : null;

  // Com uma observação só não há dispersão medível — faixa fica nula em vez de
  // virar zero, que leria como precisão absoluta.
  const faixaUsdKg = composicao.length >= 2 && desvio > 0
    ? { min: Math.max(0, precoUsdKg - 1.28 * desvio), max: precoUsdKg + 1.28 * desvio }
    : null;

  const avisos: string[] = [];
  if (nEfetivo < 2) {
    avisos.push("Amostra efetiva menor que 2 — número indicativo, confirme com cotação direta.");
  }
  const fornecedoresDistintos = porFornecedor.size;
  if (fornecedoresDistintos === 1 && composicao.length > 1) {
    avisos.push("Todas as cotações vêm de um único fornecedor — sem contraste de mercado.");
  }
  const pesoMercadoSemCorrecao = composicao
    .filter((c) => c.fonte === "mercado" && (correcao.mercado ?? 1) === 1)
    .reduce((s, c) => s + c.peso, 0);
  if (pesoMercadoSemCorrecao > 0.3) {
    avisos.push(
      `${Math.round(pesoMercadoSemCorrecao * 100)}% do peso vem de fonte declaratória sem correção de viés — ` +
      "tende a subestimar o preço real.",
    );
  }
  const maior = Math.max(...composicao.map((c) => c.peso));
  if (maior > 0.7 && composicao.length > 1) {
    avisos.push("Uma única observação domina o resultado — as demais são antigas ou de menor confiabilidade.");
  }

  return { precoUsdKg, faixaUsdKg, nEfetivo, dispersaoPct, meiaVidaMeses: meiaVida, composicao, avisos };
}
