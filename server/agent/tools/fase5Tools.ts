/**
 * FASE 5 — Tools de leitura da Excambia (consultas em linguagem natural).
 *
 * Expõem as buscas da Fase 5 ao orquestrador, fechando o ciclo:
 * documentos ingeridos → bases → a Excambia responde perguntas sobre elas.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { buscarCatalogo, compararNacionalImportado } from "./agentesFase5";
import { analiseBenchmark } from "./inteligenciaMercado";

const fmt = (cents?: number | null) =>
  cents == null ? "n/d" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const fmtData = (d?: Date | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "s/data";

/** Dias desde a data (null se não houver data). */
const idadeDias = (d?: Date | null): number | null =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : null;

/**
 * Validade temporal de uma cotação: até 90 dias é ATUAL (pode virar operação
 * de cotação); acima disso é REFERÊNCIA (apenas cálculo/estudo — revalidar preço).
 */
export const COTACAO_VALIDADE_DIAS = 90;

const marcaValidade = (d?: Date | null): string => {
  const dias = idadeDias(d);
  if (dias == null) return " [sem data — confirmar validade]";
  if (dias > COTACAO_VALIDADE_DIAS) {
    const meses = Math.floor(dias / 30);
    return ` [COTAÇÃO ANTIGA: ${meses} ${meses === 1 ? "mês" : "meses"} — usar só como referência; revalidar preço]`;
  }
  return " [cotação atual]";
};

export const buscarAtivoTool: AgentTool = {
  name: "buscar_ativo",
  schema: defineSchema(
    "buscar_ativo",
    "Consulta a BASE da empresa por um produto: Ativos & Insumos cadastrados, Proformas/cotações " +
    "E o PORTFÓLIO declarado dos fornecedores (catálogo cadastrado no card de cada fornecedor). " +
    "Retorna NCM, preço de referência e fornecedor. O casamento é inteligente — acha o item mesmo " +
    "que escrito de forma diferente (ordem das palavras, '×' vs 'x', acentos). " +
    "Use SEMPRE antes de afirmar que um produto não está cadastrado e no início de um cálculo, " +
    "para reaproveitar NCM e preço já registrados. Também use para DIRECIONAR demandas: se um " +
    "fornecedor tem o item no portfólio mas nunca foi cotado, sugira pedir cotação a ele. " +
    "Ex.: 'tenho prego 17x27?', 'preço da escora 4m', 'quem fornece fita adesiva?'.",
    {
      type: "object",
      properties: { termo: { type: "string", description: "Nome ou descrição do produto como a pessoa falou" } },
      required: ["termo"],
    },
  ),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const termo = typeof args.termo === "string" ? args.termo.trim() : "";
    if (!termo) return { ok: false, summary: "Informe o termo de busca.", error: "termo vazio" };

    const { ativos, proformas, portfolio } = await buscarCatalogo({ termo, userId: ctx.userId });

    if (ativos.length === 0 && proformas.length === 0 && portfolio.length === 0) {
      return {
        ok: true,
        summary: `Nada encontrado na base (Ativos & Insumos, Proformas ou portfólio dos fornecedores) para "${termo}". ` +
          `Pode ser um item novo — dá para montar o cálculo do zero.`,
        data: { ativos: [], proformas: [], portfolio: [] },
      };
    }

    const partes: string[] = [];
    if (ativos.length) {
      const linhas = ativos.slice(0, 5).map((a) =>
        `- ${a.nome} (NCM ${a.ncm || "n/d"}): médio ${fmt(a.precoMedioCents)}, menor ${fmt(a.menorPrecoCents)} [${a.totalRegistros} preço(s)]`,
      );
      partes.push(`Ativos & Insumos cadastrados:\n${linhas.join("\n")}`);
    }
    if (proformas.length) {
      const linhas = proformas.slice(0, 5).map((p) =>
        `- ${p.productName} — ${p.supplierName || "fornecedor n/d"}: ${p.currency} ${fmt(p.unitPriceCents)}/${p.unit} ` +
        `(NCM ${p.ncm || "n/d"}, ${fmtData(p.quotationDate)}, proforma ${p.numero || "s/nº"})${marcaValidade(p.quotationDate)}`,
      );
      partes.push(`Proformas/cotações na base:\n${linhas.join("\n")}`);
    }
    if (portfolio.length) {
      const linhas = portfolio.slice(0, 5).map((h) => {
        const preco = h.priceFobCents != null
          ? `FOB ${h.currency} ${fmt(h.priceFobCents)}/${h.unit}`
          : h.priceExwCents != null
            ? `EXW ${h.currency} ${fmt(h.priceExwCents)}/${h.unit}`
            : "sem preço declarado";
        return `- ${h.productName}${h.sku ? ` (${h.sku})` : ""} — ${h.supplierName} (${h.supplierCountry}): ${preco}` +
          `${h.moq ? `, MOQ ${h.moq}` : ""}${h.ncm ? `, NCM ${h.ncm}` : ""}` +
          `${h.supplierRating != null ? `, rating do fornecedor ${h.supplierRating.toFixed(1)}/5` : ""}`;
      });
      partes.push(
        `Portfólio declarado dos fornecedores (catálogo do card — o fornecedor TEM o item; ` +
        `se não houver cotação recente, vale direcionar a demanda e pedir preço):\n${linhas.join("\n")}`,
      );
    }

    return {
      ok: true,
      summary: `Encontrei na base para "${termo}":\n\n${partes.join("\n\n")}`,
      data: { ativos, proformas, portfolio },
    };
  },
};

export const compararOrigemTool: AgentTool = {
  name: "comparar_origem",
  schema: defineSchema(
    "comparar_origem",
    "Compara custo nacional × importado de um ativo (por id) e dá uma recomendação. " +
    "Use para 'vale importar ou comprar nacional?'. O custo nacionalizado final sai do montar_calculo.",
    {
      type: "object",
      properties: { ativoId: { type: "number", description: "ID do ativo a comparar" } },
      required: ["ativoId"],
    },
  ),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const ativoId = typeof args.ativoId === "number" ? args.ativoId : Number(args.ativoId);
    if (!ativoId) return { ok: false, summary: "Informe o ID do ativo.", error: "ativoId inválido" };

    const r = await compararNacionalImportado({ ativoId, userId: ctx.userId });
    return {
      ok: true,
      summary: `Nacional: ${fmt(r.nacionalCents)} · Importado: ${fmt(r.importadoCents)}. ${r.recomendacao}`,
      data: r,
    };
  },
};

export const benchmarkMercadoTool: AgentTool = {
  name: "benchmark_mercado",
  schema: defineSchema(
    "benchmark_mercado",
    "Gera benchmark de um ativo cruzando preços internos (nacional × importado) com sinais " +
    "externos de mercado (câmbio etc.). Use para uma visão de mercado do item.",
    {
      type: "object",
      properties: { ativoId: { type: "number", description: "ID do ativo" } },
      required: ["ativoId"],
    },
  ),
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const ativoId = typeof args.ativoId === "number" ? args.ativoId : Number(args.ativoId);
    if (!ativoId) return { ok: false, summary: "Informe o ID do ativo.", error: "ativoId inválido" };

    const r = await analiseBenchmark({ ativoId, userId: ctx.userId });
    const sinais = r.sinais.map((s) => `${s.fonte}: ${s.detalhe ?? s.tendencia}`).join(" · ");
    return {
      ok: true,
      summary: `Nacional ${fmt(r.custoNacionalCents)} × Importado ${fmt(r.custoImportadoCents)}. ${r.recomendacao}` +
        (sinais ? `\nSinais: ${sinais}` : ""),
      data: r,
    };
  },
};
