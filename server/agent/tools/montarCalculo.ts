/**
 * TOOL: montar_calculo
 *
 * A ferramenta central da Excambia. Recebe os parâmetros estruturados de uma
 * importação e chama o MOTOR CERTIFICADO (estimativaService → importCostEngine)
 * para calcular o custo nacionalizado, CMV e margem.
 *
 * GUARDRAIL FISCAL (crítico): esta tool NÃO calcula imposto por conta própria
 * nem aceita alíquotas inventadas pelo LLM. Ela apenas coleta parâmetros e
 * delega ao motor determinístico. As alíquotas vêm do motor/tabelas, nunca da IA.
 *
 * Liga-se a serviços que JÁ EXISTEM no projeto:
 *   - estimativaService.calculateEstimativa (motor certificado)
 *   - operacaoService.addEvento (registra o cálculo na timeline — auditável)
 *
 * NOTA DE INTEGRAÇÃO: o schema exposto ao LLM usa nomes em português (itens,
 * cambioBrl, regimeTributario, ttdFase) por serem mais naturais para o modelo.
 * O handler abaixo ADAPTA esses nomes para a interface real do serviço
 * (products, exchangeRate, taxRegime, ttdPhase).
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { applyFiscalGuardrail } from "../guardrails/fiscal";

// Serviços existentes
import * as estimativaService from "../../services/estimativaService";
import * as operacaoService from "../../services/operacaoService";

const schema = defineSchema(
  "montar_calculo",
  "Calcula o custo nacionalizado, CMV e margem de uma importação usando o motor " +
  "certificado. Use quando tiver os dados do produto (NCM, quantidade, preço FOB), " +
  "frete, câmbio e regime tributário. NÃO invente alíquotas — o motor as aplica.",
  {
    type: "object",
    properties: {
      ncm: { type: "string", description: "Código NCM de 8 dígitos (ex: 7308.40.00)" },
      itens: {
        type: "array",
        description: "Itens da importação",
        items: {
          type: "object",
          properties: {
            descricao: { type: "string" },
            quantidade: { type: "number" },
            precoFobUnitarioUsd: { type: "number", description: "Preço FOB unitário em USD" },
          },
          required: ["quantidade", "precoFobUnitarioUsd"],
        },
      },
      freteUsd: { type: "number", description: "Frete internacional total em USD" },
      seguroUsd: { type: "number", description: "Seguro em USD (opcional)" },
      cambioBrl: { type: "number", description: "Taxa de câmbio USD→BRL (PTAX)" },
      regimeTributario: {
        type: "string",
        enum: ["lucro_real", "lucro_presumido", "simples_nacional"],
        description: "Regime tributário do importador",
      },
      estadoDestino: { type: "string", description: "UF de destino (ex: SC)" },
      ttdFase: {
        type: "string",
        description: "Fase do TTD/benefício estadual de SC: 'primeiros_36m' (2,6%) ou 'apos_36m' (1,0%)",
      },
    },
    required: ["itens", "cambioBrl", "regimeTributario"],
  },
);

interface ItemArg {
  descricao?: string;
  quantidade: number;
  precoFobUnitarioUsd: number;
  ncm?: string;
}

/** Mapeia a fase TTD textual vinda do LLM para o enum esperado pelo motor. */
function mapTtdPhase(ttdFase?: unknown): "primeiros_36m" | "apos_36m" | undefined {
  if (typeof ttdFase !== "string") return undefined;
  const f = ttdFase.toLowerCase();
  if (f.includes("primeiros") || f.includes("2.6") || f.includes("2,6")) return "primeiros_36m";
  if (f.includes("apos") || f.includes("após") || f.includes("1.0") || f.includes("1,0") || f === "1%") return "apos_36m";
  return undefined;
}

export const montarCalculoTool: AgentTool = {
  name: "montar_calculo",
  schema,
  estagios: ["demand", "analyze"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    // 1) Validação mínima dos argumentos vindos do LLM
    const itens = (Array.isArray(args.itens) ? args.itens : []) as ItemArg[];
    if (itens.length === 0) {
      return { ok: false, summary: "Sem itens para calcular.", error: "itens vazio" };
    }
    if (typeof args.cambioBrl !== "number" || args.cambioBrl <= 0) {
      return { ok: false, summary: "Câmbio inválido.", error: "cambioBrl inválido" };
    }

    // 2) GUARDRAIL FISCAL: garante que nenhuma alíquota foi injetada pelo LLM.
    //    Se o motor precisar de alíquota, ela vem das tabelas — não daqui.
    const guard = applyFiscalGuardrail(args);
    if (!guard.ok) {
      return { ok: false, summary: guard.reason!, error: "guardrail_fiscal" };
    }

    // 3) ADAPTADOR: nomes do LLM (pt) → interface real do serviço (en)
    const ncmTopo = typeof args.ncm === "string" ? args.ncm : "";
    const estimativaInput: estimativaService.EstimativaInput = {
      products: itens.map((i) => ({
        productName: i.descricao ?? "Item",
        ncmCode: i.ncm ?? ncmTopo,
        quantity: Number(i.quantidade),
        unitPrice: Number(i.precoFobUnitarioUsd),
      })),
      exchangeRate: args.cambioBrl as number,
      currency: "USD",
      freight: typeof args.freteUsd === "number" ? args.freteUsd : undefined,
      insurance: typeof args.seguroUsd === "number" ? args.seguroUsd : undefined,
      taxRegime: args.regimeTributario as estimativaService.EstimativaInput["taxRegime"],
      ttdPhase: mapTtdPhase(args.ttdFase),
    };

    // 4) Delega ao MOTOR CERTIFICADO (determinístico)
    let resultado: estimativaService.EstimativaResult;
    try {
      resultado = await estimativaService.calculateEstimativa(estimativaInput);
    } catch (e: any) {
      return {
        ok: false,
        summary: "O motor de cálculo retornou um erro.",
        error: String(e?.message ?? e),
      };
    }

    // 5) WORKFLOW AUDITÁVEL: grava o cálculo como evento na operação
    if (ctx.operacaoId) {
      try {
        await operacaoService.addEvento({
          operacaoId: ctx.operacaoId,
          tipo: "calculo_executado",
          estagio: (ctx.estagio as any) ?? "analyze",
          autor: "excambia",
          titulo: "Cálculo de viabilidade (motor certificado)",
          payload: { input: estimativaInput, resultado },
        });
      } catch {
        // não bloqueia o resultado se o log falhar; apenas segue
      }
    }

    // 6) Resumo para o LLM continuar a conversa (campos REAIS do EngineSummary)
    const custo = resultado?.summary?.netCostTotal;
    const margemFrac = resultado?.summary?.margemBruta; // fração (ex: 0.05)
    const margemPct = typeof margemFrac === "number" ? (margemFrac * 100).toFixed(1) : undefined;
    const precoVenda = resultado?.summary?.salePriceTotal;

    return {
      ok: true,
      summary:
        `Cálculo concluído pelo motor certificado. ` +
        (custo != null ? `Custo líquido ~ R$ ${Number(custo).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}. ` : "") +
        (precoVenda != null ? `Preço de venda sugerido ~ R$ ${Number(precoVenda).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}. ` : "") +
        (margemPct != null ? `Margem bruta ${margemPct}%. ` : "") +
        (resultado?.ncmWarnings?.length ? `⚠️ ${resultado.ncmWarnings.length} aviso(s) de NCM estimada — confirme antes de fechar.` : ""),
      data: resultado,
    };
  },
};
