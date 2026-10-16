import * as operacaoService from "./operacaoService";

export interface DataGap {
  field: "cliente" | "fornecedor" | "origem" | "prazo" | "regime" | "valor";
  isMissing: boolean;
  isUncertain: boolean;
  confidence: number;
  suggestion?: string;
}

export async function analyzeOperacaoGaps(userId: number, operacaoId: number): Promise<DataGap[]> {
  const result = await operacaoService.getOperacao(userId, operacaoId);
  if (!result) return [];

  const op = result.operacao;
  const gaps: DataGap[] = [];

  if (!op.clienteNome) {
    gaps.push({ field: "cliente", isMissing: true, isUncertain: false, confidence: 0 });
  }

  if (!op.fornecedorNome) {
    gaps.push({ field: "fornecedor", isMissing: true, isUncertain: false, confidence: 0 });
  }

  if (!op.origemPais && !op.origemDesejada) {
    gaps.push({ field: "origem", isMissing: true, isUncertain: false, confidence: 0 });
  }

  if (op.prazoDesejado === null || op.prazoDesejado === undefined) {
    gaps.push({ field: "prazo", isMissing: true, isUncertain: false, confidence: 0 });
  }

  if (!op.regimeTributario) {
    gaps.push({ field: "regime", isMissing: true, isUncertain: false, confidence: 0 });
  }

  if (op.valorEstimadoBrlCents === null || op.valorEstimadoBrlCents === undefined) {
    gaps.push({ field: "valor", isMissing: true, isUncertain: false, confidence: 0 });
  }

  return gaps.slice(0, 3);
}

export function generateGapPrompt(gaps: DataGap[]): string {
  if (gaps.length === 0) return "Seus dados parecem completos! 🎯";

  const labels: Record<string, string> = {
    cliente: "Cliente (quem vai comprar / destino da mercadoria)",
    fornecedor: "Fornecedor / fabricante",
    origem: "País de origem da importação",
    prazo: "Prazo desejado de entrega",
    regime: "Regime tributário (Lucro Real, Presumido, Simples)",
    valor: "Valor estimado da operação",
  };

  let prompt = "**Dados faltando:**\n";
  gaps.forEach((g) => {
    prompt += `- ${labels[g.field]}\n`;
  });

  return prompt;
}
