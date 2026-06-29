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
import { CALC_SCHEMA_PROPERTIES, mapArgsToEstimativaInput, type ItemArg } from "./calcParams";

// Serviços existentes
import * as estimativaService from "../../services/estimativaService";
import * as operacaoService from "../../services/operacaoService";

const schema = defineSchema(
  "montar_calculo",
  "Calcula o custo nacionalizado, CMV e margem de uma importação usando o motor " +
  "certificado. Use quando tiver os dados do produto (NCM, quantidade, preço FOB), " +
  "frete, câmbio e regime tributário. NÃO invente alíquotas — o motor as aplica. " +
  "IMPORTANTE: liste CADA item da proforma como uma entrada separada em 'itens' " +
  "(com sua unidade e peso) — NUNCA agregue vários produtos numa linha só; o custo " +
  "é segregado e reportado por item.",
  {
    type: "object",
    properties: CALC_SCHEMA_PROPERTIES,
    required: ["itens", "cambioBrl", "regimeTributario"],
  },
);

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
    const estimativaInput = mapArgsToEstimativaInput(args);

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

    // Preço final POR ITEM (segregado) — na unidade de medida de cada item + por kg.
    const brl = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const itensResultado = Array.isArray(resultado?.items) ? resultado.items : [];
    const porItem = itensResultado.length > 1
      ? `Preço final por item — ${itensResultado.map((it: any) =>
          `${it.description}: R$ ${brl(it.netTotalCost)} (R$ ${brl(it.netUnitCost)}/${it.unit}` +
          (it.netCostPerKg > 0 ? `; R$ ${brl(it.netCostPerKg)}/kg` : "") + ")",
        ).join(" · ")}. `
      : "";

    return {
      ok: true,
      summary:
        `Cálculo concluído pelo motor certificado. ` +
        (custo != null ? `Custo líquido ~ R$ ${brl(custo)}. ` : "") +
        (precoVenda != null ? `Preço de venda sugerido ~ R$ ${brl(precoVenda)}. ` : "") +
        (margemPct != null ? `Margem bruta ${margemPct}%. ` : "") +
        porItem +
        (resultado?.ncmWarnings?.length ? `⚠️ ${resultado.ncmWarnings.length} aviso(s) de NCM estimada — confirme antes de fechar.` : ""),
      data: resultado,
    };
  },
};
