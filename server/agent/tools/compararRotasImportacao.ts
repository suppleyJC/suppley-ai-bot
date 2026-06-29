/**
 * comparar_rotas_importacao — compara importar DIRETO no estado de destino vs.
 * importar por um estado-HUB com benefício (ex.: SC/TTD 409) e levar ao destino.
 *
 * Destaque defensável: a diferença no ICMS DE IMPORTAÇÃO (antecipado vs. cheio).
 * Eventos a jusante (interestadual 4%, DIFAL) vêm rotulados. É estimativa
 * estratégica — sempre orientar a validar com o contador.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { compareImportRoutes } from "../../services/interstateStrategyService";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const compararRotasImportacaoTool: AgentTool = {
  name: "comparar_rotas_importacao",
  schema: defineSchema(
    "comparar_rotas_importacao",
    "Compara o ICMS de importar DIRETO no estado de destino vs. importar por um " +
      "estado-HUB com benefício (ex.: SC com TTD 409) e depois levar ao destino " +
      "(transferência/revenda interestadual + DIFAL se consumidor final). Use quando " +
      "perguntarem se vale a pena importar por outro estado para aproveitar benefício. " +
      "Informe a base do ICMS de importação (CIF + II + IPI + PIS + COFINS + despesas).",
    {
      type: "object",
      properties: {
        estadoHub: { type: "string", description: "UF do estado-hub com benefício (ex: SC)" },
        estadoDestino: { type: "string", description: "UF de destino da mercadoria (ex: SP)" },
        baseImportacaoBrl: { type: "number", description: "Base do ICMS importação em R$ (CIF+II+IPI+PIS+COFINS+despesas)" },
        valorSaidaBrl: { type: "number", description: "Valor da operação de saída do hub p/ destino em R$ (opcional)" },
        modelo: { type: "string", enum: ["trading_revenda", "transferencia_filial"], description: "trading revende a cliente ou mesma empresa transfere p/ filial" },
        destinatarioCreditaIcms: { type: "boolean", description: "Destinatário aproveita crédito de ICMS (Lucro Real/Presumido=true; Simples/consumo=false)" },
        etapaFinal: { type: "string", enum: ["consumidor_final", "revenda_contribuinte"], description: "consumidor final (gera DIFAL) ou revenda a contribuinte" },
        antecipadoHubPercent: { type: "number", description: "Opcional: alíquota antecipada do hub em % (ex: 1 ou 2.6 para TTD 409)" },
      },
      required: ["estadoHub", "estadoDestino", "baseImportacaoBrl"],
    },
  ),
  async run(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const hub = String(args.estadoHub ?? "").trim();
    const dest = String(args.estadoDestino ?? "").trim();
    const baseBrl = Number(args.baseImportacaoBrl);
    if (hub.length !== 2 || dest.length !== 2) {
      return { ok: false, summary: "Informe as UFs do hub e do destino (2 letras).", error: "uf inválida" };
    }
    if (!Number.isFinite(baseBrl) || baseBrl <= 0) {
      return { ok: false, summary: "Informe a base do ICMS de importação em R$.", error: "base inválida" };
    }

    const result = await compareImportRoutes({
      hubState: hub,
      destinationState: dest,
      baseIcmsCents: Math.round(baseBrl * 100),
      valorSaidaCents: typeof args.valorSaidaBrl === "number" ? Math.round(args.valorSaidaBrl * 100) : undefined,
      modelo: (args.modelo as any) === "transferencia_filial" ? "transferencia_filial" : "trading_revenda",
      destinatarioCreditaIcms: args.destinatarioCreditaIcms !== false,
      etapaFinal: (args.etapaFinal as any) === "consumidor_final" ? "consumidor_final" : "revenda_contribuinte",
      hubAntecipadoBpOverride: typeof args.antecipadoHubPercent === "number"
        ? Math.round(args.antecipadoHubPercent * 100)
        : undefined,
    });

    const econ = result.economiaImportacaoCents;
    const sinal = econ > 0 ? "economia" : "custo adicional";
    const summary =
      `ICMS importação — direta (${result.direta.estado}): ${brl(result.direta.icmsImportacaoCents)} · ` +
      `via ${result.viaHub.estado}: ${brl(result.viaHub.icmsImportacaoCents)}. ` +
      `${econ !== 0 ? `Diferença na importação: ${brl(Math.abs(econ))} de ${sinal} pela rota via hub.` : "Sem diferença na importação."} ` +
      `Eventos a jusante e ressalvas no detalhamento. Estimativa — validar com contador.`;

    return { ok: true, summary, data: result };
  },
};
