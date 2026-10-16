import { invokeLLM } from "../_core/llm";
import { ImportCalculationOutput } from "./importCalculationService";

export interface ViabilityAnalysis {
  viabilityScore: number; // 0-100
  summary: string;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
  marketInsights: string;
}

/**
 * Generate AI-powered viability analysis for an import calculation
 */
export async function generateViabilityAnalysis(
  calculation: ImportCalculationOutput,
  productName: string,
  ncmCode: string,
  originCountry: string,
  quantity: number
): Promise<ViabilityAnalysis> {
  const prompt = `Você é um especialista em comércio exterior e análise de viabilidade de importações para o Brasil.

Analise a seguinte operação de importação e forneça uma análise detalhada:

**Produto:** ${productName}
**NCM:** ${ncmCode}
**País de Origem:** ${originCountry}
**Quantidade:** ${quantity} unidades
**É Mercosul:** ${calculation.isMercosul ? "Sim" : "Não"}

**Valores:**
- FOB: R$ ${calculation.fobBrl.toFixed(2)}
- CIF: R$ ${calculation.cifBrl.toFixed(2)}
- Impostos Totais: R$ ${(calculation.taxes.values.totalTaxesCents / 100).toFixed(2)}
- Custo Total: R$ ${calculation.totalCostBrl.toFixed(2)}
- Custo Unitário: R$ ${calculation.unitCostBrl.toFixed(2)}
- Preço Sugerido: R$ ${calculation.suggestedPriceBrl.toFixed(2)}

**Alíquotas Aplicadas:**
- II: ${(calculation.taxes.rates.ii / 100).toFixed(2)}%
- IPI: ${(calculation.taxes.rates.ipi / 100).toFixed(2)}%
- PIS: ${(calculation.taxes.rates.pis / 100).toFixed(2)}%
- COFINS: ${(calculation.taxes.rates.cofins / 100).toFixed(2)}%
- ICMS: ${(calculation.taxes.rates.icms / 100).toFixed(2)}%

**Rentabilidade:**
- Margem Bruta: ${calculation.grossMarginPercent.toFixed(2)}%
- Lucro Bruto Estimado: R$ ${calculation.grossProfitBrl.toFixed(2)}

Forneça sua análise no seguinte formato JSON:
{
  "viabilityScore": <número de 0 a 100>,
  "summary": "<resumo executivo em 2-3 frases>",
  "strengths": ["<ponto forte 1>", "<ponto forte 2>"],
  "weaknesses": ["<ponto fraco 1>", "<ponto fraco 2>"],
  "risks": ["<risco 1>", "<risco 2>"],
  "opportunities": ["<oportunidade 1>", "<oportunidade 2>"],
  "recommendations": ["<recomendação 1>", "<recomendação 2>"],
  "marketInsights": "<insights sobre o mercado brasileiro para este tipo de produto>"
}

Considere:
1. A carga tributária total sobre o CIF
2. A margem de lucro em relação ao mercado
3. Vantagens do Mercosul (se aplicável)
4. Riscos cambiais e logísticos
5. Competitividade do preço final
6. Tendências de mercado para o segmento`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um especialista em comércio exterior brasileiro. Responda sempre em JSON válido." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "viability_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              viabilityScore: { type: "integer", description: "Score de 0 a 100" },
              summary: { type: "string", description: "Resumo executivo" },
              strengths: { type: "array", items: { type: "string" }, description: "Pontos fortes" },
              weaknesses: { type: "array", items: { type: "string" }, description: "Pontos fracos" },
              risks: { type: "array", items: { type: "string" }, description: "Riscos identificados" },
              opportunities: { type: "array", items: { type: "string" }, description: "Oportunidades" },
              recommendations: { type: "array", items: { type: "string" }, description: "Recomendações" },
              marketInsights: { type: "string", description: "Insights de mercado" },
            },
            required: ["viabilityScore", "summary", "strengths", "weaknesses", "risks", "opportunities", "recommendations", "marketInsights"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error("No content in LLM response");
    }

    return JSON.parse(content) as ViabilityAnalysis;
  } catch (error) {
    console.error("[AIAnalysis] Error generating analysis:", error);
    
    // Return a default analysis if AI fails
    return generateDefaultAnalysis(calculation);
  }
}

/**
 * Generate a default analysis when AI is unavailable
 */
function generateDefaultAnalysis(calculation: ImportCalculationOutput): ViabilityAnalysis {
  const taxBurden = (calculation.taxes.values.totalTaxesCents / 100 / calculation.cifBrl) * 100;
  const margin = calculation.grossMarginPercent;
  
  // Calculate viability score based on metrics
  let score = 50;
  
  // Margin impact
  if (margin >= 30) score += 20;
  else if (margin >= 20) score += 10;
  else if (margin < 10) score -= 20;
  
  // Tax burden impact
  if (taxBurden < 30) score += 10;
  else if (taxBurden > 50) score -= 10;
  
  // Mercosul advantage
  if (calculation.isMercosul && calculation.taxes.rates.ii === 0) score += 15;
  
  score = Math.max(0, Math.min(100, score));
  
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const risks: string[] = [];
  const opportunities: string[] = [];
  const recommendations: string[] = [];
  
  if (calculation.isMercosul) {
    strengths.push("Origem Mercosul com possível isenção de II");
    opportunities.push("Explorar outros produtos com benefício Mercosul");
  }
  
  if (margin >= 25) {
    strengths.push(`Margem bruta atrativa de ${margin.toFixed(1)}%`);
  } else if (margin < 15) {
    weaknesses.push(`Margem bruta baixa de ${margin.toFixed(1)}%`);
    recommendations.push("Renegociar preço FOB com fornecedor");
  }
  
  if (taxBurden > 40) {
    weaknesses.push(`Alta carga tributária de ${taxBurden.toFixed(1)}% sobre o CIF`);
    recommendations.push("Verificar possibilidade de regimes especiais ou incentivos fiscais");
  }
  
  risks.push("Variação cambial pode impactar custos");
  risks.push("Atrasos na liberação aduaneira podem gerar custos extras");
  
  opportunities.push("Economia de escala com volumes maiores");
  recommendations.push("Monitorar câmbio para otimizar momento da compra");
  
  return {
    viabilityScore: score,
    summary: `Operação com viabilidade ${score >= 70 ? "alta" : score >= 50 ? "moderada" : "baixa"}. Margem bruta de ${margin.toFixed(1)}% com carga tributária de ${taxBurden.toFixed(1)}% sobre o CIF.`,
    strengths,
    weaknesses,
    risks,
    opportunities,
    recommendations,
    marketInsights: "Análise de mercado não disponível. Recomenda-se pesquisa adicional sobre concorrência e demanda.",
  };
}

/**
 * Generate comparative analysis between multiple calculations
 */
export async function generateComparativeAnalysis(
  calculations: Array<{ name: string; result: ImportCalculationOutput }>
): Promise<string> {
  if (calculations.length < 2) {
    return "É necessário pelo menos 2 cálculos para comparação.";
  }
  
  const comparisonData = calculations.map(c => ({
    name: c.name,
    unitCost: c.result.unitCostBrl,
    margin: c.result.grossMarginPercent,
    taxBurden: (c.result.taxes.values.totalTaxesCents / 100 / c.result.cifBrl) * 100,
    isMercosul: c.result.isMercosul,
  }));
  
  const prompt = `Compare as seguintes opções de importação e recomende a melhor:

${comparisonData.map((c, i) => `
**Opção ${i + 1}: ${c.name}**
- Custo Unitário: R$ ${c.unitCost.toFixed(2)}
- Margem: ${c.margin.toFixed(1)}%
- Carga Tributária: ${c.taxBurden.toFixed(1)}%
- Mercosul: ${c.isMercosul ? "Sim" : "Não"}
`).join("\n")}

Forneça uma análise comparativa concisa (máximo 3 parágrafos) indicando qual opção é mais vantajosa e por quê.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um especialista em comércio exterior. Seja conciso e objetivo." },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    return typeof content === 'string' ? content : "Análise comparativa não disponível.";
  } catch (error) {
    console.error("[AIAnalysis] Error generating comparative analysis:", error);
    
    // Simple comparison without AI
    const best = comparisonData.reduce((a, b) => 
      a.margin > b.margin ? a : b
    );
    
    return `Com base nos dados fornecidos, a opção "${best.name}" apresenta a melhor margem de ${best.margin.toFixed(1)}%. Recomenda-se análise adicional considerando outros fatores como prazo de entrega, qualidade e confiabilidade do fornecedor.`;
  }
}
