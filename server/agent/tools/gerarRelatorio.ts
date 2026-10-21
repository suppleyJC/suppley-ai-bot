/**
 * TOOL: gerar_relatorio_calculo
 *
 * Gera e ENTREGA um arquivo do cálculo de importação — planilha Excel (com
 * fórmulas vivas, layout do contador) ou relatório PDF — e devolve um link para
 * download. Fecha o gap "a Excambia traz a planilha/PDF" direto no chat.
 *
 * GUARDRAIL FISCAL: igual ao montar_calculo, NÃO aceita alíquota injetada pelo
 * LLM. Recebe os mesmos parâmetros, roda o MOTOR CERTIFICADO e exporta o
 * resultado determinístico. As alíquotas vêm do motor/tabelas, nunca da IA.
 *
 * Liga serviços que JÁ EXISTEM:
 *   - estimativaService.calculateEstimativa  (motor certificado → EngineResult)
 *   - excelEstimativaService.generateEstimativaExcel (xlsx com fórmulas)
 *   - pdfReportService.generateQuotationReport       (pdf)
 *   - storagePut (sobe o arquivo e devolve URL)
 *   - operacaoService.addEvento/anexarDocumento (registra na timeline — auditável)
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { applyFiscalGuardrail } from "../guardrails/fiscal";
import { CALC_SCHEMA_PROPERTIES, mapArgsToEstimativaInput, type ItemArg } from "./calcParams";

import * as estimativaService from "../../services/estimativaService";
import * as operacaoService from "../../services/operacaoService";
import { generateEstimativaExcel } from "../../services/excelEstimativaService";
import { generateQuotationReport } from "../../services/pdfReportService";
import { storagePut } from "../../storage";
import { linkEstavelDeArquivo } from "../../routes/arquivoRoute";
import type { EngineResult } from "../../services/importCostEngine";

const schema = defineSchema(
  "gerar_relatorio_calculo",
  "Gera e entrega um arquivo do cálculo de importação para download: planilha " +
  "Excel (com fórmulas editáveis) ou relatório PDF. Use quando a pessoa pedir " +
  "'a planilha', 'o PDF', 'o relatório' ou para enviar ao cliente/contador. " +
  "Recebe os mesmos dados do cálculo — NÃO invente alíquotas.",
  {
    type: "object",
    properties: {
      ...CALC_SCHEMA_PROPERTIES,
      formato: {
        type: "string",
        enum: ["excel", "pdf"],
        description: "Formato do arquivo: 'excel' (planilha com fórmulas) ou 'pdf' (relatório). Padrão: excel.",
      },
      modo: {
        type: "string",
        enum: ["internal", "client"],
        description: "Só para Excel: 'client' (oculta o spread do benefício, para enviar ao cliente) ou 'internal' (visão da trading). Padrão: internal.",
      },
      nomeRelatorio: { type: "string", description: "Nome/título do relatório (ex: nome do produto ou da cotação)" },
      clienteNome: { type: "string", description: "Nome do cliente (opcional, aparece no relatório)" },
      fornecedorNome: { type: "string", description: "Nome do fornecedor (opcional)" },
      origemPais: { type: "string", description: "País de origem (opcional, ex: China)" },
    },
    required: ["itens", "cambioBrl", "regimeTributario"],
  },
);

type Regime = "lucro_real" | "lucro_presumido" | "simples_nacional";

/** Converte o EngineResult em QuotationResult (shape do gerador de PDF). */
function toQuotationResult(
  result: EngineResult,
  opts: { nome: string; fornecedor?: string; origem?: string; estado: string; currency: string; regime: Regime },
) {
  const s = result.summary;
  const products = result.items.map((it) => {
    const totalTaxes = it.iiValue + it.ipiValue + it.pisValue + it.cofinsValue + it.icmsValue;
    const profit = it.salePrice - it.netTotalCost;
    return {
      productName: it.description,
      ncmCode: it.ncm,
      quantity: it.quantity,
      unit: it.unit,
      fobValueBrl: it.fobBrl,
      cifValueBrl: it.customsValueBrl,
      totalTaxes,
      totalCost: it.netTotalCost,
      unitCost: it.netUnitCost,
      suggestedPrice: it.salePrice,
      profit,
      profitMargin: it.salePrice > 0 ? (profit / it.salePrice) * 100 : 0,
      taxes: {
        ii: it.iiValue, ipi: it.ipiValue, pis: it.pisValue,
        cofins: it.cofinsValue, icms: it.icmsValue,
      },
    };
  });

  return {
    quotationName: opts.nome,
    supplierName: opts.fornecedor,
    currency: opts.currency,
    exchangeRate: s.exchangeRate,
    originCountry: opts.origem ?? "—",
    destinationState: opts.estado,
    isMercosul: false,
    products,
    totals: {
      totalFobBrl: s.fobTotalBrl,
      totalCifBrl: s.cifTotalBrl,
      totalTaxes: s.taxesTotal,
      totalCost: s.netCostTotal,
      totalSuggestedPrice: s.salePriceTotal,
      totalProfit: s.salePriceTotal - s.netCostTotal,
      averageMargin: s.margemBruta * 100,
    },
    freight: s.freightTotalBrl,
    insurance: s.insuranceTotalBrl,
    additionalCosts: {
      customsBroker: s.assessoriaTotal,
      storage: 0,
      others: s.demaisDespesasTotal,
    },
    markup: s.markupFactor,
    calculatedAt: new Date(),
    taxRegime: opts.regime,
  };
}

export const gerarRelatorioTool: AgentTool = {
  name: "gerar_relatorio_calculo",
  schema,
  estagios: ["demand", "analyze", "execute", "finance"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    // 1) Validação mínima
    const itens = (Array.isArray(args.itens) ? args.itens : []) as ItemArg[];
    if (itens.length === 0) {
      return { ok: false, summary: "Sem itens para gerar o relatório.", error: "itens vazio" };
    }
    if (typeof args.cambioBrl !== "number" || args.cambioBrl <= 0) {
      return { ok: false, summary: "Câmbio inválido.", error: "cambioBrl inválido" };
    }

    // 2) GUARDRAIL FISCAL
    const guard = applyFiscalGuardrail(args);
    if (!guard.ok) {
      return { ok: false, summary: guard.reason!, error: "guardrail_fiscal" };
    }

    // 3) MOTOR CERTIFICADO (mesmos parâmetros do montar_calculo)
    const estimativaInput = mapArgsToEstimativaInput(args);
    let result: estimativaService.EstimativaResult;
    try {
      result = await estimativaService.calculateEstimativa(estimativaInput);
    } catch (e: any) {
      return { ok: false, summary: "O motor de cálculo retornou um erro.", error: String(e?.message ?? e) };
    }

    // 4) Gera o arquivo no formato pedido
    const formato = args.formato === "pdf" ? "pdf" : "excel";
    const regime = (args.regimeTributario as Regime) ?? "lucro_presumido";
    const nome = (typeof args.nomeRelatorio === "string" && args.nomeRelatorio) || "Cálculo de importação";
    const estado = typeof args.estadoDestino === "string" ? args.estadoDestino : "SC";

    let buffer: Buffer;
    let contentType: string;
    let ext: string;
    try {
      if (formato === "pdf") {
        buffer = await generateQuotationReport(
          toQuotationResult(result, {
            nome,
            fornecedor: typeof args.fornecedorNome === "string" ? args.fornecedorNome : undefined,
            origem: typeof args.origemPais === "string" ? args.origemPais : undefined,
            estado, currency: "USD", regime,
          }) as any,
        );
        contentType = "application/pdf";
        ext = "pdf";
      } else {
        buffer = await generateEstimativaExcel(result, {
          quotationName: nome,
          supplierName: typeof args.fornecedorNome === "string" ? args.fornecedorNome : undefined,
          originCountry: typeof args.origemPais === "string" ? args.origemPais : undefined,
          clientName: typeof args.clienteNome === "string" ? args.clienteNome : undefined,
          mode: args.modo === "client" ? "client" : "internal",
          regime,
          currency: "USD",
        });
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        ext = "xlsx";
      }
    } catch (e: any) {
      return { ok: false, summary: "Erro ao gerar o arquivo do relatório.", error: String(e?.message ?? e) };
    }

    // 5) Sobe ao storage e obtém o link
    //
    // O link entregue no chat é ESTÁVEL (rota da aplicação), não a URL
    // pré-assinada do S3: a mensagem fica no histórico para sempre, e a
    // assinatura do S3 vale 1 hora — depois disso o clique devolvia um XML cru
    // de AccessDenied, como se o arquivo tivesse sumido. A URL do S3 segue
    // sendo gerada, mas só para o registro na operação.
    let urlS3: string;
    const fileKey = `reports/excambia-calc-${ctx.userId}-${Date.now()}.${ext}`;
    try {
      ({ url: urlS3 } = await storagePut(fileKey, buffer, contentType));
    } catch (e: any) {
      return { ok: false, summary: "Arquivo gerado, mas falhou ao subir para o storage.", error: String(e?.message ?? e) };
    }

    const fileName = `${nome}.${ext}`;
    const url = await linkEstavelDeArquivo({ k: fileKey, n: fileName, u: ctx.userId });

    // 6) WORKFLOW AUDITÁVEL: registra como anexo na operação (se houver).
    // fileKey = CHAVE permanente (a URL pré-assinada expira em ~1h — gravar a
    // URL no lugar da chave quebrava o "abrir anexo" com NoSuchKey).
    if (ctx.operacaoId) {
      try {
        await operacaoService.anexarDocumento({
          userId: ctx.userId,
          operacaoId: ctx.operacaoId,
          tipo: formato === "pdf" ? "pdf" : "outro",
          nome: fileName,
          fileKey,
          fileUrl: urlS3,
          contentType,
          autor: "excambia",
          descricao: `Relatório de cálculo (${formato.toUpperCase()}) gerado pela Excambia`,
        });
      } catch {
        // não bloqueia a entrega do arquivo se o registro falhar
      }
    }

    const custo = result.summary?.netCostTotal;
    return {
      ok: true,
      summary:
        `Relatório ${formato.toUpperCase()} gerado. Link para download: ${url}` +
        (custo != null
          ? ` (custo líquido ~ R$ ${Number(custo).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}).`
          : "."),
      data: { url, fileKey, formato, fileName },
    };
  },
};
