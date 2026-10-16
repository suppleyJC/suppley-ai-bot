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
import { consultarComexPorNcm, type ComexResumo } from "../../services/comexStatService";

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

    const brl = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const usd = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const itensResultado = Array.isArray(resultado?.items) ? resultado.items : [];

    // DESTAQUE EXECUTIVO (obrigatório na resposta): os três números que a
    // legislação e a decisão de compra pedem — FOB, total nacionalizado e
    // custo por unidade de medida. O LLM deve abrir a apresentação com eles.
    const s = resultado?.summary;
    const kpis = s
      ? `APRESENTE EM DESTAQUE (nesta ordem, antes de qualquer detalhe): ` +
        `1) VALOR FOB: US$ ${usd(s.fobTotalFob)} (R$ ${brl(s.fobTotalBrl)} @ câmbio ${s.exchangeRate}). ` +
        `2) VALOR TOTAL NACIONALIZADO (NF-e de nacionalização: CIF + II + IPI + PIS/COFINS + ICMS + despesas): R$ ${brl(s.nfeNacionalizacao)}` +
        (custo != null ? ` — custo líquido após créditos do regime: R$ ${brl(custo)}. ` : ". ") +
        `3) CUSTO POR UNIDADE DE MEDIDA: ${itensResultado.map((it: any, i: number) => {
          const u = resultado?.unidades?.[i];
          let linha = `${it.description}: R$ ${brl(it.netUnitCost)}/${it.unit || "un"}`;
          if (u?.custoCanonico) linha += ` (= R$ ${brl(u.custoCanonico.valor)}/${u.custoCanonico.unidade})`;
          else if (it.netCostPerKg > 0) linha += ` (R$ ${brl(it.netCostPerKg)}/kg)`;
          return linha;
        }).join(" · ")}. `
      : "";

    // Conversões de unidade aplicadas (transparência da matemática).
    const convTxt = (resultado?.unidades ?? [])
      .map((u) => u.conversao.descricao)
      .filter(Boolean);
    const conversoes = convTxt.length
      ? `Conversões de unidade aplicadas: ${convTxt.join("; ")}. `
      : "";

    // BARREIRAS COMERCIAIS detectadas (antidumping/CIDE/compensatórias) — o
    // agente DEVE evidenciá-las na resposta, com impacto e postura afirmativa.
    const linhasBarreira = (resultado?.ncmWarnings ?? []).filter((w) => w.startsWith("🛑"));
    const barreirasTxt = linhasBarreira.length
      ? `BARREIRAS COMERCIAIS DETECTADAS (OBRIGATÓRIO evidenciar na resposta, de forma afirmativa e consultiva): ${linhasBarreira.join(" | ")} `
      : "";

    // BENCHMARK DE MERCADO (Pilar 4): FOB cotado × média oficial de importação
    // (Comex Stat, US$/kg) por item com peso — automático, best-effort com
    // timeout curto. Valida o preço do fornecedor contra o mercado real sem
    // depender só da nossa base.
    let benchTxt = "";
    const benchmarks: Array<{
      description: string; ncm: string; fobUsdKg: number;
      mercadoUsdKg: number; desvioPct: number; veredicto: string;
    }> = [];
    try {
      const comTimeout = <T,>(p: Promise<T>, ms: number) =>
        Promise.race<T | null>([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

      const candidatos = itensResultado
        .filter((it: any) => it.ncm && it.weightKgTotal > 0 && it.totalFob > 0)
        .slice(0, 5); // teto de consultas externas por cálculo

      // Uma consulta por NCM distinta (cacheia dentro do cálculo).
      const ncmsUnicas = Array.from(new Set(candidatos.map((it: any) => String(it.ncm).replace(/\D/g, "")))) as string[];
      const consultas = new Map<string, ComexResumo | null>();
      await Promise.all(ncmsUnicas.map(async (n) => {
        consultas.set(n, await comTimeout(consultarComexPorNcm({ ncm: n }), 4000).catch(() => null));
      }));

      for (const it of candidatos as any[]) {
        const resumo = consultas.get(String(it.ncm).replace(/\D/g, ""));
        if (!resumo?.disponivel || !resumo.precoMedioUsdKg) continue;
        const fobUsdKg = it.totalFob / it.weightKgTotal;
        const desvio = (fobUsdKg - resumo.precoMedioUsdKg) / resumo.precoMedioUsdKg;
        const veredicto = desvio < -0.1 ? "ABAIXO do mercado (bom preço)"
          : desvio > 0.1 ? "ACIMA do mercado (alavanca de negociação)"
          : "alinhado ao mercado";
        benchmarks.push({
          description: it.description, ncm: it.ncm, fobUsdKg,
          mercadoUsdKg: resumo.precoMedioUsdKg, desvioPct: Math.round(desvio * 1000) / 10,
          veredicto,
        });
      }
      if (benchmarks.length) {
        const linhas = benchmarks.map((b) =>
          `${b.description}: FOB cotado US$ ${b.fobUsdKg.toFixed(2)}/kg × média oficial de importação US$ ${b.mercadoUsdKg.toFixed(2)}/kg ` +
          `(${b.desvioPct > 0 ? "+" : ""}${b.desvioPct}% — ${b.veredicto})`,
        );
        benchTxt =
          `BENCHMARK DE MERCADO (Comex Stat oficial, últimos 12 meses — apresente como validação do preço): ` +
          `${linhas.join(" · ")}. `;
      }
    } catch {
      /* benchmark é enriquecimento — nunca atrasa/derruba o cálculo */
    }

    // Preço final POR ITEM (segregado) — na unidade de medida de cada item + por kg.
    const porItem = itensResultado.length > 1
      ? `Preço final por item — ${itensResultado.map((it: any) =>
          `${it.description}: R$ ${brl(it.netTotalCost)} (R$ ${brl(it.netUnitCost)}/${it.unit}` +
          (it.netCostPerKg > 0 ? `; R$ ${brl(it.netCostPerKg)}/kg` : "") + ")",
        ).join(" · ")}. `
      : "";

    // 7) PREÇO-ALVO (solve reverso p/ negociação) — quando a pessoa dá o preço de
    //    venda pretendido e a finalidade é revenda: verifica viabilidade e, se não
    //    der, calcula o FOB-alvo a negociar com o fornecedor.
    let alvoTxt = "";
    let alvoData: estimativaService.PrecoAlvoAnalise | undefined;
    const precoVendaAlvoBrl = typeof args.precoVendaAlvoBrl === "number" ? args.precoVendaAlvoBrl : undefined;
    if (precoVendaAlvoBrl && precoVendaAlvoBrl > 0 && estimativaInput.finalidade !== "consumo_proprio") {
      try {
        alvoData = await estimativaService.analisarPrecoAlvo(estimativaInput, precoVendaAlvoBrl, resultado);
        if (alvoData.viavel) {
          alvoTxt =
            ` 🎯 Preço-alvo R$ ${brl(precoVendaAlvoBrl)}: VIÁVEL no FOB atual — o preço mínimo com a margem ` +
            `é R$ ${brl(alvoData.precoVendaSugerido)} (folga de R$ ${brl(alvoData.folga)}).`;
        } else {
          const red = alvoData.reducaoNecessariaPct;
          const fatorTxt = alvoData.fatorFob != null
            ? ` FOB precisa cair ~${red}% (fator ${alvoData.fatorFob.toFixed(2)}) — esse é o alvo de negociação com o fornecedor.`
            : "";
          alvoTxt =
            ` 🎯 Preço-alvo R$ ${brl(precoVendaAlvoBrl)}: NÃO fecha no FOB atual — o mínimo com a margem é ` +
            `R$ ${brl(alvoData.precoVendaSugerido)}.${fatorTxt}`;
        }
        // Números COERENTES por linha: custo posto RECALCULADO no FOB-alvo +
        // autovalidação do solve. NUNCA apresente o custo do FOB atual ao lado
        // do FOB-alvo (mistura de linhas gera contradição na tela).
        if (alvoData.custoNacionalizadoNoAlvo != null) {
          alvoTxt +=
            ` No FOB-ALVO, o custo nacionalizado (líquido de créditos) é ~R$ ${brl(alvoData.custoNacionalizadoNoAlvo)}` +
            (alvoData.reversoConfere === true
              ? ` — CONFERIDO: recalculando no FOB-alvo, o preço de venda bate com o alvo.`
              : alvoData.reversoConfere === false
                ? ` — ATENÇÃO: a conferência no FOB-alvo divergiu do alvo; apresente como aproximação e sugira o cálculo completo.`
                : ".") +
            ` IMPORTANTE ao apresentar: use APENAS estes números do motor (não derive custo posto à mão);` +
            ` se o custo líquido ficar abaixo de FOB×câmbio, explicite que é por causa dos CRÉDITOS tributários do regime (não é erro).`;
        }
      } catch {
        /* análise de alvo é best-effort; não bloqueia o cálculo */
      }
    }

    return {
      ok: true,
      summary:
        `Cálculo concluído pelo motor certificado. ` +
        kpis +
        conversoes +
        barreirasTxt +
        benchTxt +
        (precoVenda != null ? `Preço de venda sugerido ~ R$ ${brl(precoVenda)}. ` : "") +
        (margemPct != null ? `Margem bruta ${margemPct}%. ` : "") +
        porItem +
        alvoTxt +
        (resultado?.ncmWarnings?.length ? `⚠️ ${resultado.ncmWarnings.length} aviso(s) de NCM estimada — confirme antes de fechar.` : ""),
      data: {
        ...(alvoData ? { ...resultado, precoAlvo: alvoData } : resultado),
        ...(benchmarks.length ? { benchmarkMercado: benchmarks } : {}),
      },
    };
  },
};
