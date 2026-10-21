/**
 * TOOL: ler_itens_proforma — LEITURA DE VOLTA estruturada dos itens de
 * proformas já catalogadas na base.
 *
 * POR QUÊ (o buraco que esta tool fecha): o conteúdo de um anexo só vive no
 * turno em que foi enviado — nos turnos seguintes o modelo não tem mais os
 * itens no contexto. Os dados, porém, FORAM persistidos (proformas + itens).
 * Sem uma leitura de volta linha a linha, a Excambia "esquecia" uma cotação
 * de 27 itens e pedia para a pessoa colar tudo de novo.
 *
 * Devolve TODOS os itens (nome, NCM, quantidade, unidade, preço, moeda) das
 * proformas selecionadas — no formato que alimenta montar_calculo direto.
 * Nunca inventa: o que volta aqui é exatamente o que está no banco.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { getProformasByUser, getProformaItems } from "../../db/proformaDb";
import type { Proforma } from "../../../drizzle/schema";

const schema = defineSchema(
  "ler_itens_proforma",
  "LÊ DE VOLTA os itens estruturados (nome, NCM, quantidade, unidade, preço FOB, moeda) de " +
  "proformas JÁ CATALOGADAS na base. Use SEMPRE que precisar dos itens reais de uma cotação " +
  "que já foi catalogada — para montar_calculo, comparar preços ou listar para a pessoa — " +
  "em vez de pedir que ela cole os dados de novo ou (PIOR) inventar itens/preços. " +
  "Filtre por número (ex.: 'PF-2026-0011'), por fornecedor, ou chame sem filtro para as " +
  "proformas mais recentes. Preços em CENTAVOS da moeda da proforma.",
  {
    type: "object",
    properties: {
      numeros: {
        type: "array",
        items: { type: "string" },
        description: "Números das proformas (ex.: ['PF-2026-0011','PF-2026-0012']). Aceita intervalo implícito listando cada número.",
      },
      fornecedor: { type: "string", description: "Filtra por nome (parcial) do fornecedor" },
      maisRecentes: {
        type: "number",
        description: "Sem outros filtros: devolve as N proformas mais recentes (padrão 5, máx. 20)",
      },
    },
  },
);

function fmtPreco(cents: number | null, currency: string): string {
  if (cents == null) return "SEM PREÇO";
  return `${currency} ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const lerItensProformaTool: AgentTool = {
  name: "ler_itens_proforma",
  schema,
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    const numeros = Array.isArray(args.numeros)
      ? (args.numeros as unknown[]).map((n) => String(n).trim().toUpperCase()).filter(Boolean)
      : [];
    const fornecedor = typeof args.fornecedor === "string" ? args.fornecedor.trim().toLowerCase() : "";
    const maisRecentes = Math.min(
      Math.max(typeof args.maisRecentes === "number" ? Math.floor(args.maisRecentes) : 5, 1),
      20,
    );

    const todas = await getProformasByUser(ctx.userId);
    if (todas.length === 0) {
      return { ok: true, summary: "Não há proformas catalogadas na base.", data: { proformas: [] } };
    }

    let selecionadas: Proforma[];
    if (numeros.length > 0) {
      const set = new Set(numeros);
      selecionadas = todas.filter((p) => p.numero && set.has(p.numero.toUpperCase()));
      const achados = new Set(selecionadas.map((p) => p.numero?.toUpperCase()));
      const faltando = numeros.filter((n) => !achados.has(n));
      if (selecionadas.length === 0) {
        return {
          ok: false,
          summary: `Nenhuma proforma encontrada com os números ${numeros.join(", ")}.`,
          error: "proformas_nao_encontradas",
        };
      }
      if (faltando.length > 0) {
        // segue com as achadas; o aviso volta no summary abaixo
        (selecionadas as Proforma[] & { _faltando?: string[] })._faltando = faltando;
      }
    } else if (fornecedor) {
      selecionadas = todas.filter((p) =>
        (p.supplierName ?? "").toLowerCase().includes(fornecedor),
      );
      if (selecionadas.length === 0) {
        return {
          ok: false,
          summary: `Nenhuma proforma do fornecedor "${args.fornecedor}" na base.`,
          error: "fornecedor_sem_proformas",
        };
      }
    } else {
      selecionadas = todas.slice(0, maisRecentes);
    }

    // Carrega os itens de cada proforma selecionada (limite defensivo de 25
    // proformas por chamada para não estourar o contexto do modelo).
    const LIMITE = 25;
    const cortadas = selecionadas.length > LIMITE ? selecionadas.length - LIMITE : 0;
    selecionadas = selecionadas.slice(0, LIMITE);

    const resultado = [] as Array<{
      proformaId: number;
      numero: string | null;
      fornecedor: string | null;
      pais: string | null;
      moeda: string;
      incoterm: string | null;
      dataCotacao: string | null;
      arquivo: string | null;
      itens: Array<{
        productName: string;
        ncmCode: string | null;
        quantity: number;
        unit: string;
        unitPriceCents: number | null;
        totalPriceCents: number | null;
      }>;
    }>;

    let totalItens = 0;
    let itensSemPreco = 0;
    const linhas: string[] = [];

    for (const p of selecionadas) {
      const itens = await getProformaItems(p.id);
      totalItens += itens.length;
      resultado.push({
        proformaId: p.id,
        numero: p.numero ?? null,
        fornecedor: p.supplierName ?? null,
        pais: p.supplierCountry ?? null,
        moeda: p.currency,
        incoterm: p.incoterm ?? null,
        dataCotacao: p.quotationDate ? new Date(p.quotationDate).toISOString().slice(0, 10) : null,
        arquivo: p.fileName ?? null,
        itens: itens.map((it) => {
          if (it.unitPriceCents == null) itensSemPreco++;
          return {
            productName: it.productName,
            ncmCode: it.ncmCode ?? null,
            quantity: it.quantity,
            unit: it.unit,
            unitPriceCents: it.unitPriceCents ?? null,
            totalPriceCents: it.totalPriceCents ?? null,
          };
        }),
      });

      linhas.push(
        `${p.numero ?? `#${p.id}`} — ${p.supplierName ?? "fornecedor n/d"} (${p.supplierCountry ?? "país n/d"}, ${p.currency}${p.quotationDate ? `, ${new Date(p.quotationDate).toISOString().slice(0, 10)}` : ""}):`,
      );
      for (const it of itens) {
        linhas.push(
          `  • ${it.productName} — ${it.quantity} ${it.unit} × ${fmtPreco(it.unitPriceCents ?? null, p.currency)}` +
          `${it.ncmCode ? ` (NCM ${it.ncmCode})` : " (NCM n/d)"}`,
        );
      }
    }

    const faltando = (selecionadas as Proforma[] & { _faltando?: string[] })._faltando ?? [];

    return {
      ok: true,
      summary:
        `${selecionadas.length} proforma(s), ${totalItens} item(ns) no total` +
        `${itensSemPreco > 0 ? ` — ATENÇÃO: ${itensSemPreco} item(ns) SEM preço na base (peça o preço ou dispare RFQ; NÃO invente)` : ""}` +
        `${faltando.length ? ` — não encontradas: ${faltando.join(", ")}` : ""}` +
        `${cortadas > 0 ? ` — ${cortadas} proforma(s) excedentes não carregadas (refine o filtro)` : ""}.\n` +
        linhas.join("\n") +
        `\n\nEstes são os dados REAIS da base — use exatamente estes nomes e preços no montar_calculo (um item por linha).`,
      data: { proformas: resultado, totalItens, itensSemPreco },
    };
  },
};
