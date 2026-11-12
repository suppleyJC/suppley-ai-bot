/**
 * TOOL: calcular_custo_logistico (CÁLCULO determinístico)
 *
 * NÚMEROS de fretamento internacional (não só doutrina): demurrage escalonada
 * por tipo de contêiner, comparação LCL × FCL com ponto de virada (breakeven)
 * e THC de referência por porto brasileiro.
 *
 * Valores de tabela são REFERÊNCIA de mercado (premissa declarada); quando o
 * usuário informar o número do contrato dele, o cálculo usa o real.
 * GUARDRAIL: planejamento logístico; custo fiscal é do montar_calculo.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import {
  calcularDemurrage, compararLclFcl, thcPorto,
  FREE_TIME_REF_DIAS, DEMURRAGE_REF_USD, THC_REF_BRL, type TipoContainer,
} from "../../services/custoLogisticoService";

const schema = defineSchema(
  "calcular_custo_logistico",
  "Calculadora DETERMINÍSTICA de fretamento: (a) DEMURRAGE — custo de estadia do " +
  "contêiner além do free time, escalonado por faixa (informe dias no porto, free time, " +
  "tipo e quantidade de contêineres); (b) LCL × FCL — compara consolidado (w/m) com " +
  "contêiner fechado e dá o ponto de virada em m³; (c) THC — capatazia de referência " +
  "por porto brasileiro. Use para risco de demurrage (ex.: canal vermelho), escolha " +
  "LCL/FCL e orçamento de custos portuários.",
  {
    type: "object",
    properties: {
      modo: {
        type: "string",
        enum: ["demurrage", "lcl_vs_fcl", "thc_porto"],
        description: "Qual cálculo executar.",
      },
      // demurrage
      tipoContainer: { type: "string", enum: ["20DV", "40DV", "40HC"], description: "Tipo de contêiner (default 40HC)." },
      containers: { type: "number", description: "Quantidade de contêineres (default 1)." },
      diasPorto: { type: "number", description: "Dias corridos estimados do contêiner no porto (demurrage)." },
      freeTimeDias: { type: "number", description: `Free time contratado em dias (default ${FREE_TIME_REF_DIAS}).` },
      perDiemUsd: { type: "number", description: "Per diem contratual (US$/dia) se o usuário informou — substitui a tabela de referência na 1ª faixa." },
      // lcl_vs_fcl
      volumeM3: { type: "number", description: "Volume total da carga em m³ (LCL×FCL)." },
      pesoKg: { type: "number", description: "Peso bruto total em kg (LCL×FCL)." },
      freteLclUsdPorWm: { type: "number", description: "Tarifa LCL em US$ por w/m (tonelada ou m³, o maior)." },
      freteFclUsd: { type: "number", description: "Frete do contêiner fechado (US$)." },
      cambio: { type: "number", description: "Câmbio USD/BRL p/ converter THC (default 5,0)." },
      // thc_porto
      porto: { type: "string", description: "Porto brasileiro (ex.: Santos, Itajaí, Navegantes, Paranaguá)." },
    },
    required: ["modo"],
  },
);

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export const calcularCustoLogisticoTool: AgentTool = {
  name: "calcular_custo_logistico",
  schema,
  async run(args, _ctx: ToolContext): Promise<ToolResult> {
    const modo = String(args.modo ?? "");

    if (modo === "demurrage") {
      const tipo = (["20DV", "40DV", "40HC"].includes(String(args.tipoContainer)) ? args.tipoContainer : "40HC") as TipoContainer;
      const dias = Number(args.diasPorto);
      if (!Number.isFinite(dias) || dias <= 0) {
        return { ok: false, summary: "Informe diasPorto (dias corridos estimados no porto).", error: "dias_requerido" };
      }
      const free = Number(args.freeTimeDias) > 0 ? Number(args.freeTimeDias) : FREE_TIME_REF_DIAS;
      const qtd = Number(args.containers) > 0 ? Math.floor(Number(args.containers)) : 1;

      // Per diem contratual substitui a tabela (todas as faixas no valor informado).
      const tabela = Number(args.perDiemUsd) > 0
        ? { ...DEMURRAGE_REF_USD, [tipo]: { ate7: Number(args.perDiemUsd), ate14: Number(args.perDiemUsd), apos14: Number(args.perDiemUsd) } }
        : undefined;

      const r = calcularDemurrage(tipo, dias, free, qtd, tabela as any);
      const premissa = tabela
        ? `per diem contratual US$${args.perDiemUsd}/dia`
        : `tabela de referência ${tipo} (US$${DEMURRAGE_REF_USD[tipo].ate7}/${DEMURRAGE_REF_USD[tipo].ate14}/${DEMURRAGE_REF_USD[tipo].apos14} por faixa de 7d)`;
      return {
        ok: true,
        summary:
          r.diasAlemFreeTime === 0
            ? `DEMURRAGE: zero — ${dias} dias no porto cabem no free time de ${free} dias.`
            : `DEMURRAGE estimada: ${usd(r.custoUsd)} (${r.diasAlemFreeTime} dias além do free time de ${free}d; ${r.detalhe}). ` +
              `Premissa: ${premissa}. Apresente como referência e alerte que o per diem real é o do contrato com o armador.`,
        data: r,
      };
    }

    if (modo === "lcl_vs_fcl") {
      const volumeM3 = Number(args.volumeM3);
      const pesoKg = Number(args.pesoKg);
      const freteLcl = Number(args.freteLclUsdPorWm);
      const freteFcl = Number(args.freteFclUsd);
      if (![volumeM3, pesoKg, freteLcl, freteFcl].every((v) => Number.isFinite(v) && v > 0)) {
        return {
          ok: false,
          summary: "Informe volumeM3, pesoKg, freteLclUsdPorWm e freteFclUsd (todos > 0).",
          error: "parametros_requeridos",
        };
      }
      const tipo = (["20DV", "40DV", "40HC"].includes(String(args.tipoContainer)) ? args.tipoContainer : "20DV") as TipoContainer;
      const r = compararLclFcl({
        volumeM3, pesoKg,
        freteLclUsdPorWm: freteLcl,
        freteFclUsd: freteFcl,
        tipoFcl: tipo,
        cambio: Number(args.cambio) > 0 ? Number(args.cambio) : undefined,
      });
      return {
        ok: true,
        summary:
          `LCL × FCL — recomendação: ${r.recomendacao} (economia de ${usd(r.economiaUsd)}). ${r.detalhe}. ` +
          (r.breakevenM3 != null
            ? `Ponto de virada: a partir de ~${r.breakevenM3.toFixed(1)} m³ o FCL ${tipo} passa a ganhar. `
            : "") +
          (!r.cabeNoFcl ? "ATENÇÃO: a carga NÃO cabe num único contêiner desse tipo — avalie mais contêineres ou 40HC. " : "") +
          "Premissas: taxas fixas LCL e THC de referência — ajuste com os números do forwarder quando houver.",
        data: r,
      };
    }

    if (modo === "thc_porto") {
      const porto = String(args.porto ?? "").trim();
      if (!porto) {
        return { ok: false, summary: "Informe o porto (ex.: Santos, Itajaí, Navegantes).", error: "porto_requerido" };
      }
      const valor = thcPorto(porto);
      if (valor == null) {
        const lista = Object.keys(THC_REF_BRL).join(", ");
        return {
          ok: false,
          summary: `Porto "${porto}" fora da tabela de referência (${lista}) — busque o valor vigente pela pesquisa web sem expor esta limitação.`,
          error: "porto_nao_mapeado",
        };
      }
      return {
        ok: true,
        summary:
          `THC de referência em ${porto}: R$ ${valor.toLocaleString("pt-BR")} por contêiner. ` +
          "Valor de mercado usual — o cobrado é o da tabela pública do terminal vigente; confirme pela web se a decisão for sensível ao número.",
        data: { porto, thcBrl: valor },
      };
    }

    return { ok: false, summary: "Modo inválido — use demurrage, lcl_vs_fcl ou thc_porto.", error: "modo_invalido" };
  },
};
