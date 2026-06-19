/**
 * TOOL: enviar_rfq
 *
 * Envia Solicitação de Cotação (RFQ) para fornecedores.
 * Cria registro de RFQ, dispara para rede de fornecedores e registra na timeline.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import * as rfqService from "../../services/rfqService";
import * as operacaoService from "../../services/operacaoService";
import { operacoes } from "../../../drizzle/schema";
import { rfqs, rfqItems } from "../../../drizzle/rfqSchema";

const schema = defineSchema(
  "enviar_rfq",
  "Envia uma Solicitação de Cotação (RFQ) para fornecedores. Especifique o produto, " +
  "quantidade, destino, prazo e preferências. A Excambia busca fornecedores e consolida ofertas.",
  {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título/descrição do produto ou lote (ex: 'Pregos 17x27 para revenda')" },
      descricaoProduto: { type: "string", description: "Descrição detalhada do produto" },
      ncm: { type: "string", description: "NCM de 8 dígitos (ex: 7317.00.90). Se não sabe, deixe vazio." },
      quantidade: { type: "number", description: "Quantidade desejada" },
      unidade: { type: "string", description: "Unidade (UN, KG, M, etc.). Default: UN" },
      paises_preferidos: {
        type: "array",
        items: { type: "string" },
        description: "Países preferidos (ex: [China, Índia]). Vazio = qualquer um.",
      },
      paises_excluidos: {
        type: "array",
        items: { type: "string" },
        description: "Países a excluir (ex: [Irã, Síria])",
      },
      prazo: {
        type: "string",
        enum: ["padrao", "rapido", "urgente"],
        description: "Prazo desejado: padrao (60-90d), rapido (30-45d), urgente (ASAP)",
      },
      uf_destino: { type: "string", description: "UF de destino da importação (ex: SC, SP). Default: SC" },
      incoterm: {
        type: "string",
        enum: ["EXW", "FCA", "FOB", "CIF", "CPT", "CIP", "DAP", "DDP"],
        description: "Incoterm preferido (default: FOB)",
      },
      notas: { type: "string", description: "Notas adicionais para os fornecedores" },
    },
    required: ["titulo", "quantidade"],
  },
);

export const enviarRfqTool: AgentTool = {
  name: "enviar_rfq",
  schema,
  estagios: ["demand", "source"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.operacaoId) {
      return { ok: false, summary: "Esta ferramenta requer uma operação ativa.", error: "sem_operacao" };
    }

    try {
      const db = await getDb();
      if (!db) return { ok: false, summary: "Sem conexão com banco.", error: "db_unavailable" };

      // Valida operação
      const [op] = await db.select().from(operacoes)
        .where(eq(operacoes.id, ctx.operacaoId));
      if (!op) return { ok: false, summary: "Operação não encontrada.", error: "operacao_nao_encontrada" };

      // Mapeia enums de português para enum do banco
      const urgencyMap: Record<string, "standard" | "fast" | "urgent"> = {
        "padrao": "standard",
        "rapido": "fast",
        "urgente": "urgent",
      };
      const urgency = urgencyMap[args.prazo as string] ?? "standard";
      const incoterm = (args.incoterm ?? "FOB") as any;
      const unitStr = (typeof args.unidade === "string" ? args.unidade : "UN").toUpperCase();

      // Cria RFQ
      const rfqNumber = rfqService.generateRfqNumber();
      const [rfqRes] = await db.insert(rfqs).values({
        userId: ctx.userId,
        rfqNumber,
        title: String(args.titulo),
        importPurpose: "resale",
        requesterType: "self",
        preferredCountries: args.paises_preferidos ? JSON.stringify(args.paises_preferidos) : null,
        excludedCountries: args.paises_excluidos ? JSON.stringify(args.paises_excluidos) : null,
        preferredIncoterm: incoterm,
        destinationState: (typeof args.uf_destino === "string" ? args.uf_destino : "SC").toUpperCase().slice(0, 2),
        urgency,
        currency: "USD",
        status: "sourcing",
        notes: typeof args.notas === "string" ? args.notas : null,
      });
      const rfqId = (rfqRes as any).insertId as number;

      // Cria item da RFQ
      const ncmCode = typeof args.ncm === "string" ? args.ncm : null;
      await db.insert(rfqItems).values({
        rfqId,
        productName: String(args.titulo),
        description: typeof args.descricaoProduto === "string" ? args.descricaoProduto : null,
        ncmCode,
        quantity: Number(args.quantidade),
        unit: unitStr,
        ncmConfirmed: !!ncmCode,
      });

      // Registra evento na timeline da operação
      await operacaoService.addEvento({
        operacaoId: ctx.operacaoId,
        tipo: "rfq_enviada",
        estagio: (op.estagioAtual as any) ?? "source",
        refTipo: "rfqs",
        refId: rfqId,
        autor: "excambia",
        titulo: `RFQ ${rfqNumber} enviada para fornecedores`,
        payload: {
          rfqNumber,
          produto: args.titulo,
          quantidade: args.quantidade,
          unidade: unitStr,
        },
      });

      const qtd_fmt = `${Number(args.quantidade).toLocaleString("pt-BR")} ${unitStr}`;
      return {
        ok: true,
        summary: `RFQ ${rfqNumber} enviada com sucesso! Solicitação: ${args.titulo} (${qtd_fmt}). ` +
          `A Excambia está buscando fornecedores. Respostas devem chegar em breve.`,
        data: { rfqNumber, rfqId },
      };
    } catch (e: any) {
      return {
        ok: false,
        summary: "Erro ao enviar RFQ.",
        error: String(e?.message ?? e),
      };
    }
  },
};
