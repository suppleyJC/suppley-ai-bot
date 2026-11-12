/**
 * Purchase Timing Service — camada PREDITIVA (apoio à decisão).
 *
 * Cruza os sinais de mercado (câmbio BCB, commodities FRED, inflação IBGE) num
 * único veredito de JANELA DE COMPRA: comprar agora, aguardar ou neutro, com um
 * score de favorabilidade (0–100) e os fatores que pesaram.
 *
 * Heurística transparente (não é "caixa-preta"): câmbio domina (é o que mais
 * mexe no custo nacionalizado), commodities ajustam, inflação doméstica favorece
 * o importado. GUARDRAIL: é leitura de cenário, não promessa — o custo definitivo
 * sai do motor certificado.
 */
import type { Sinal } from "./marketIntelligenceService";

export interface JanelaCompra {
  score: number; // 0–100 (quanto maior, mais favorável importar agora)
  recomendacao: "comprar" | "aguardar" | "neutro";
  titulo: string;
  texto: string;
  fatores: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function avaliarJanelaCompra(sinais: Sinal[]): JanelaCompra {
  let score = 50;
  const fatores: string[] = [];

  const cambio = sinais.find((s) => s.chave === "USD/BRL");
  if (cambio) {
    if (cambio.tendencia === "baixa") {
      score += 22;
      fatores.push(`Câmbio em baixa (${cambio.variacaoPct.toFixed(1)}%) — importar fica mais barato.`);
    } else if (cambio.tendencia === "alta") {
      score -= 22;
      fatores.push(`Câmbio em alta (+${cambio.variacaoPct.toFixed(1)}%) — importação encarecendo.`);
    } else {
      fatores.push(`Câmbio estável (R$ ${cambio.atual.toFixed(2)}).`);
    }
  }

  // Commodities (FRED): cada uma empurra um pouco; teto para não dominar o câmbio.
  let commodityAjuste = 0;
  for (const s of sinais.filter((x) => x.fonte === "FRED")) {
    if (s.tendencia === "baixa") {
      commodityAjuste += 7;
      fatores.push(`${s.chave} em baixa — insumos ligados tendem a baratear.`);
    } else if (s.tendencia === "alta") {
      commodityAjuste -= 7;
      fatores.push(`${s.chave} em alta — pressão de custo no insumo.`);
    }
  }
  score += clamp(commodityAjuste, -16, 16);

  // Inflação doméstica (IPCA): alta favorece o importado frente ao nacional.
  const ipca = sinais.find((s) => s.chave === "IPCA 12m");
  if (ipca && ipca.tendencia === "alta") {
    score += 8;
    fatores.push(`Inflação doméstica alta (IPCA 12m ${ipca.atual.toFixed(1)}%) — aumenta a vantagem do importado.`);
  }

  score = clamp(Math.round(score));

  const recomendacao: JanelaCompra["recomendacao"] =
    score >= 65 ? "comprar" : score <= 35 ? "aguardar" : "neutro";

  const titulo =
    recomendacao === "comprar" ? "Janela favorável para importar"
      : recomendacao === "aguardar" ? "Momento de cautela — avalie aguardar"
      : "Cenário neutro";

  const texto =
    recomendacao === "comprar"
      ? "O conjunto de sinais favorece antecipar compras e fechar câmbio agora. Considere reforçar estoque de itens recorrentes."
      : recomendacao === "aguardar"
      ? "Os sinais sugerem custo de importação pressionado. Se não for urgente, vale aguardar uma janela melhor ou travar câmbio parcial."
      : "Sem um vetor dominante. Decida pelo prazo da operação; sem pressa, monitore o câmbio.";

  return {
    score,
    recomendacao,
    titulo,
    texto,
    fatores: fatores.length ? fatores : ["Sem sinais fortes o suficiente para uma leitura conclusiva."],
  };
}
