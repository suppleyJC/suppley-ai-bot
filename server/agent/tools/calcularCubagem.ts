/**
 * calcular_cubagem — quantas unidades/caixas cabem em 20'GP, 40'GP e 40'HC,
 * a partir das dimensões (C×L×A em cm) e do peso unitário (kg). Considera volume
 * útil e payload, apontando o fator limitante. Estimativa por volume/peso.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { calcularCubagem } from "../../services/cubagemService";

export const calcularCubagemTool: AgentTool = {
  name: "calcular_cubagem",
  schema: defineSchema(
    "calcular_cubagem",
    "Calcula a cubagem: quantas unidades/caixas de um item cabem em contêineres " +
      "20' GP, 40' GP e 40' HC, a partir das dimensões (comprimento × largura × " +
      "altura em cm) e do peso unitário (kg). Considera volume útil e peso máximo " +
      "(payload) e indica o fator limitante. Use quando perguntarem quanto cabe num " +
      "contêiner ou quantos contêineres uma quantidade exige. As medidas costumam " +
      "estar na ficha técnica/proforma do item.",
    {
      type: "object",
      properties: {
        comprimentoCm: { type: "number", description: "Comprimento da unidade/caixa em cm" },
        larguraCm: { type: "number", description: "Largura em cm" },
        alturaCm: { type: "number", description: "Altura em cm" },
        pesoKg: { type: "number", description: "Peso unitário em kg" },
        quantidade: { type: "number", description: "Total de unidades a embarcar (opcional) — calcula quantos contêineres são necessários" },
      },
      required: ["comprimentoCm", "larguraCm", "alturaCm", "pesoKg"],
    },
  ),
  async run(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
    const c = num(args.comprimentoCm), l = num(args.larguraCm), a = num(args.alturaCm), p = num(args.pesoKg);
    if ([c, l, a].some((d) => !(d > 0)) || !(p > 0)) {
      return { ok: false, summary: "Informe dimensões (C×L×A em cm) e peso (kg) positivos.", error: "entrada inválida" };
    }
    const quantidade = num(args.quantidade);

    try {
      const r = calcularCubagem({
        comprimentoCm: c, larguraCm: l, alturaCm: a, pesoKg: p,
        quantidade: quantidade > 0 ? quantidade : undefined,
      });
      const partes = r.containers.map((f) =>
        `${f.label}: ${f.cabe} un. (limite: ${f.limitadoPor}` +
        (f.containeresNecessarios ? `; ${f.containeresNecessarios} contêiner(es) p/ a quantidade` : "") + ")",
      );
      const summary =
        `Volume unitário ${r.volumeUnitarioCbm} m³, ${r.pesoUnitarioKg} kg. ` +
        partes.join(" · ") + ". Estimativa por volume/peso.";
      return { ok: true, summary, data: r };
    } catch (e: any) {
      return { ok: false, summary: e?.message ?? "Falha no cálculo de cubagem.", error: String(e?.message ?? e) };
    }
  },
};
