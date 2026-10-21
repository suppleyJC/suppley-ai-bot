/**
 * TOOL: simular_reforma_tributaria (LEITURA/SIMULAÇÃO)
 *
 * Simula o custo tributário de uma importação sob a REFORMA TRIBUTÁRIA
 * (EC 132/2023 + LC 214/2025) usando o motor dual já certificado
 * (taxReformService): regime ATUAL × TRANSIÇÃO (2026–2032, sistemas
 * convivendo) × regime NOVO (IBS/CBS/Imposto Seletivo pleno, 2033+).
 *
 * GUARDRAIL FISCAL: as alíquotas do regime atual vêm do BANCO por NCM
 * (ncm_tax_rates), nunca do LLM. O ano de referência define a fase da
 * transição aplicada. O II permanece inalterado pela reforma.
 *
 * Uso típico: "quanto essa importação custaria em 2027/2033?",
 * "a reforma encarece ou barateia esse produto?", planejamento plurianual.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import {
  simulateReformImpact,
  generateReformTimeline,
  getReformPhase,
  getSelectiveTaxRate,
  getReformSpecialTreatment,
} from "../../services/taxReformService";
import { getNcmTaxRate } from "../../db";

const schema = defineSchema(
  "simular_reforma_tributaria",
  "Simula o custo tributário de uma importação sob a REFORMA TRIBUTÁRIA (IBS/CBS/" +
  "Imposto Seletivo — EC 132/2023, LC 214/2025): compara o regime ATUAL com a " +
  "TRANSIÇÃO (2026-2032) e o regime NOVO pleno (2033+), ano a ano. Use quando " +
  "perguntarem sobre reforma tributária, IBS, CBS, imposto seletivo, ou o custo " +
  "de importar em anos futuros. As alíquotas atuais vêm do banco por NCM. " +
  "Não substitui montar_calculo para o custo vigente completo.",
  {
    type: "object",
    properties: {
      ncm: { type: "string", description: "Código NCM de 8 dígitos do produto" },
      valorCifBrl: {
        type: "number",
        description: "Valor CIF da importação em R$ (FOB + frete + seguro, já convertido pelo câmbio)",
      },
      anoReferencia: {
        type: "number",
        description: "Ano da simulação (ex.: 2027, 2030, 2033). Padrão: ano corrente. Define a fase da transição aplicada.",
      },
      estadoDestino: { type: "string", description: "UF de destino (informativo)" },
      paisOrigem: { type: "string", description: "País de origem (informativo)" },
      incluirLinhaDoTempo: {
        type: "boolean",
        description: "Se true, retorna também o impacto ano a ano 2026→2033 (planejamento plurianual)",
      },
    },
    required: ["ncm", "valorCifBrl"],
  },
);

const brl = (cents: number) =>
  "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const simularReformaTool: AgentTool = {
  name: "simular_reforma_tributaria",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const ncm = typeof args.ncm === "string" ? args.ncm.replace(/\D/g, "") : "";
    const valorCifBrl = typeof args.valorCifBrl === "number" ? args.valorCifBrl : 0;
    if (!ncm || valorCifBrl <= 0) {
      return { ok: false, summary: "Informe a NCM e o valor CIF em R$ para simular a reforma.", error: "args inválidos" };
    }
    const ano = typeof args.anoReferencia === "number" && args.anoReferencia >= 2024
      ? Math.round(args.anoReferencia)
      : new Date().getFullYear();

    // Alíquotas ATUAIS do banco por NCM (guardrail: nunca do LLM).
    const rates = await getNcmTaxRate(ncm);
    const avisoNcm = rates
      ? null
      : `NCM ${ncm} não encontrada na base — simulação com alíquotas médias (II 14%). Confirme a NCM.`;

    let resultado;
    try {
      resultado = await simulateReformImpact({
        cifValueCents: Math.round(valorCifBrl * 100),
        ncmCode: ncm,
        originCountry: typeof args.paisOrigem === "string" ? args.paisOrigem : "",
        destinationState: typeof args.estadoDestino === "string" ? args.estadoDestino : "SC",
        referenceYear: ano,
        currentIiRate: rates?.iiRate,
        currentIpiRate: rates?.ipiRate,
        currentPisRate: rates?.pisRate,
        currentCofinsRate: rates?.cofinsRate,
      });
    } catch (e: any) {
      return { ok: false, summary: "O simulador da reforma retornou um erro.", error: String(e?.message ?? e) };
    }

    const fase = getReformPhase(ano);
    const seletivo = getSelectiveTaxRate(ncm);
    const especial = getReformSpecialTreatment(ncm);

    // ---- Resumo em pt-BR para o LLM apresentar ----
    const partes: string[] = [];
    partes.push(
      `Simulação da reforma tributária (EC 132/2023, LC 214/2025) para NCM ${ncm}, ` +
      `CIF R$ ${valorCifBrl.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}, ano ${ano} ` +
      `(fase: ${fase.description ?? fase.year}).`,
    );

    if (resultado.currentRegime) {
      partes.push(
        `Regime ATUAL: tributos totais ${brl(resultado.currentRegime.totalCents)} ` +
        `(II ${brl(resultado.currentRegime.iiCents)}, IPI ${brl(resultado.currentRegime.ipiCents)}, ` +
        `PIS ${brl(resultado.currentRegime.pisCents)}, COFINS ${brl(resultado.currentRegime.cofinsCents)}, ` +
        `ICMS ${brl(resultado.currentRegime.icmsCents)}).`,
      );
    }
    if (resultado.transitionRegime && resultado.regime === "transition") {
      const t = resultado.transitionRegime;
      partes.push(
        `TRANSIÇÃO ${ano} (sistemas convivendo): total ${brl(t.totalCents)} — ` +
        `CBS ${brl(t.cbsCents)} + IBS ${brl(t.ibsCents)}` +
        (t.selectiveCents > 0 ? ` + Imposto Seletivo ${brl(t.selectiveCents)}` : "") +
        ` convivendo com II ${brl(t.iiCents)}, IPI ${brl(t.ipiCents)}, ` +
        `PIS ${brl(t.pisCents)}, COFINS ${brl(t.cofinsCents)}, ICMS reduzido ${brl(t.icmsReducedCents)}.`,
      );
    }
    if (resultado.newRegime) {
      partes.push(
        `Regime NOVO pleno (2033+): total ${brl(resultado.newRegime.totalCents)} — ` +
        `II ${brl(resultado.newRegime.iiCents)} (permanece), CBS ${brl(resultado.newRegime.cbsCents)}, ` +
        `IBS ${brl(resultado.newRegime.ibsCents)}` +
        (resultado.newRegime.selectiveCents > 0 ? `, Imposto Seletivo ${brl(resultado.newRegime.selectiveCents)}` : "") +
        `. Cálculo "por fora" (sem gross-up por dentro).`,
      );
    }

    const c = resultado.comparison;
    partes.push(
      `COMPARAÇÃO atual × novo: ${c.impact === "cheaper" ? "REDUÇÃO" : c.impact === "more_expensive" ? "AUMENTO" : "NEUTRO"} ` +
      `de ${brl(Math.abs(c.differenceCents))} (${Math.abs(c.differencePercent).toFixed(1)}%).`,
    );

    if (seletivo) {
      partes.push(
        `⚠️ NCM sujeita ao IMPOSTO SELETIVO (${seletivo.description}, ~${(seletivo.rate / 100).toFixed(1)}%).`,
      );
    }
    if (especial?.hasSpecialTreatment) {
      partes.push(`Tratamento especial na reforma: ${especial.description}.`);
    }
    if (resultado.insights?.length) partes.push(resultado.insights.join(" "));
    if (avisoNcm) partes.push(`⚠️ ${avisoNcm}`);
    partes.push(
      "Apresente como PLANEJAMENTO (a regulamentação segue em evolução) e destaque que o II não muda com a reforma.",
    );

    // Linha do tempo plurianual (opcional)
    let timeline;
    if (args.incluirLinhaDoTempo === true) {
      try {
        timeline = generateReformTimeline(Math.round(valorCifBrl * 100), ncm, {
          iiRate: rates?.iiRate ?? 1400,
          ipiRate: rates?.ipiRate ?? 0,
          pisRate: rates?.pisRate ?? 216,
          cofinsRate: rates?.cofinsRate ?? 1000,
          icmsRate: 100,
        });
        const linhas = timeline
          .map((y) => `${y.year}: ${brl(y.totalTaxCents)}`)
          .join(" · ");
        partes.push(`Linha do tempo (tributos totais por ano): ${linhas}.`);
      } catch {
        /* timeline é opcional; segue sem ela */
      }
    }

    return {
      ok: true,
      summary: partes.join(" "),
      data: { resultado, timeline, fase, seletivo, especial },
    };
  },
};
