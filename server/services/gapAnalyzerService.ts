import * as operacaoService from "./operacaoService";

export interface DataGap {
  field: "ncm" | "moq" | "price" | "lead_time" | "incoterm" | "quantity" | "payment_terms";
  isMissing: boolean;
  isUncertain: boolean;
  confidence: number;
  suggestion?: string;
}

export async function analyzeOperacaoGaps(userId: number, operacaoId: number): Promise<DataGap[]> {
  const operacao = await operacaoService.getOperacao(userId, operacaoId);
  if (!operacao) return [];

  const gaps: DataGap[] = [];

  if (!operacao.ncmProvavel) {
    gaps.push({
      field: "ncm",
      isMissing: true,
      isUncertain: false,
      confidence: 0,
    });
  } else if (!operacao.ncmValidated) {
    gaps.push({
      field: "ncm",
      isMissing: false,
      isUncertain: true,
      confidence: 60,
      suggestion: operacao.ncmProvavel,
    });
  }

  if (!operacao.quantidadeDesejada) {
    gaps.push({
      field: "quantity",
      isMissing: true,
      isUncertain: false,
      confidence: 0,
    });
  }

  if (operacao.prazoDesejado === null || operacao.prazoDesejado === undefined) {
    gaps.push({
      field: "lead_time",
      isMissing: true,
      isUncertain: false,
      confidence: 0,
    });
  }

  if (!operacao.origemDesejada) {
    gaps.push({
      field: "price",
      isMissing: true,
      isUncertain: false,
      confidence: 0,
    });
  }

  return gaps.slice(0, 3);
}

export function generateGapPrompt(gaps: DataGap[]): string {
  if (gaps.length === 0) return "Seus dados parecem completos! 🎯";

  const missing = gaps.filter((g) => g.isMissing);
  const uncertain = gaps.filter((g) => g.isUncertain && !g.isMissing);

  let prompt = "";

  if (missing.length > 0) {
    prompt += "**Dados faltando:**\n";
    missing.forEach((g) => {
      const labels: Record<string, string> = {
        ncm: "Código NCM (classificação do produto)",
        quantity: "Quantidade desejada",
        price: "Preço ou país de origem",
        lead_time: "Prazo de entrega",
        moq: "Quantidade mínima (MOQ)",
        incoterm: "Termo comercial (FOB, CIF, etc.)",
        payment_terms: "Condições de pagamento",
      };
      prompt += `- ${labels[g.field]}\n`;
    });
    prompt += "\n";
  }

  if (uncertain.length > 0) {
    prompt += "**Dados para confirmar:**\n";
    uncertain.forEach((g) => {
      prompt += `- ${g.suggestion}\n`;
    });
  }

  return prompt;
}
