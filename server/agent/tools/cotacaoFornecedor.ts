/**
 * TOOLS: cotação semi-automatizada com fornecedores (cenário B — humano-no-loop).
 *
 *   preparar_cotacao_fornecedor  → rascunhos com preço-alvo (NÃO envia)
 *   enviar_cotacao_fornecedor    → envia SÓ após aprovação explícita da pessoa
 *   registrar_resposta_fornecedor→ parseia a resposta colada no chat → base + vs alvo
 *   contraproposta_fornecedor    → redige contraproposta (rascunho; envio via aprovação)
 *
 * REGRA DE OURO (reforçada no prompt): nada é enviado ao fornecedor e nenhuma
 * oferta é aceita sem o OK explícito do usuário. O negociador só propõe.
 */
import { defineSchema, type AgentTool, type ToolContext, type ToolResult } from "./types";
import * as outreach from "../../services/rfqOutreachService";

// ---------------------------------------------------------------- preparar
const prepararSchema = defineSchema(
  "preparar_cotacao_fornecedor",
  "PREPARA (sem enviar) os emails de cotação de uma RFQ para fornecedores — um rascunho " +
  "por destinatário, já com o preço-alvo por item. Use depois de enviar_rfq, quando a " +
  "pessoa quiser acionar fornecedores. Depois de preparar, MOSTRE o rascunho e PEÇA " +
  "APROVAÇÃO explícita antes de chamar enviar_cotacao_fornecedor.",
  {
    type: "object",
    properties: {
      rfqId: { type: "number", description: "ID da RFQ (retornado por enviar_rfq)" },
      fornecedorIds: {
        type: "array", items: { type: "number" },
        description: "IDs de fornecedores da base (cards) que receberão a cotação",
      },
      emailsAvulsos: {
        type: "array",
        items: {
          type: "object",
          properties: { nome: { type: "string" }, email: { type: "string" } },
          required: ["email"],
        },
        description: "Destinatários fora da base (nome + email)",
      },
      observacao: { type: "string", description: "Observação extra para incluir na mensagem" },
    },
    required: ["rfqId"],
  },
);

export const prepararCotacaoFornecedorTool: AgentTool = {
  name: "preparar_cotacao_fornecedor",
  schema: prepararSchema,
  estagios: ["demand", "source"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    try {
      const r = await outreach.prepararOutreach({
        userId: ctx.userId,
        rfqId: Number(args.rfqId),
        fornecedorIds: Array.isArray(args.fornecedorIds) ? args.fornecedorIds.map(Number) : undefined,
        emailsAvulsos: Array.isArray(args.emailsAvulsos) ? (args.emailsAvulsos as any) : undefined,
        observacao: typeof args.observacao === "string" ? args.observacao : undefined,
      });
      const lista = r.drafts.map((d) =>
        `• #${d.outreachId} → ${d.destinatario}${d.email ? ` <${d.email}>` : " (SEM EMAIL cadastrado)"}`,
      ).join("\n");
      return {
        ok: true,
        summary:
          `Rascunhos da ${r.rfqNumber} preparados (NADA foi enviado):\n${lista}\n\n` +
          `PRÉVIA do primeiro rascunho:\n---\n${r.drafts[0]?.corpo}\n---\n` +
          `MOSTRE a prévia à pessoa e PERGUNTE se aprova o envio. Só chame enviar_cotacao_fornecedor após um SIM explícito.`,
        data: r,
      };
    } catch (e: any) {
      return { ok: false, summary: "Não consegui preparar os rascunhos.", error: String(e?.message ?? e) };
    }
  },
};

// ---------------------------------------------------------------- enviar
const enviarSchema = defineSchema(
  "enviar_cotacao_fornecedor",
  "ENVIA rascunhos de cotação/contraproposta aos fornecedores. PORTÃO DE APROVAÇÃO: " +
  "só chame esta ferramenta DEPOIS de a pessoa aprovar explicitamente o envio ('pode " +
  "enviar', 'aprovado'). Sem provedor de email configurado, devolve o texto pronto " +
  "para a pessoa copiar e enviar por conta própria.",
  {
    type: "object",
    properties: {
      outreachIds: {
        type: "array", items: { type: "number" },
        description: "IDs dos rascunhos aprovados (de preparar_cotacao_fornecedor ou contraproposta_fornecedor)",
      },
    },
    required: ["outreachIds"],
  },
);

export const enviarCotacaoFornecedorTool: AgentTool = {
  name: "enviar_cotacao_fornecedor",
  schema: enviarSchema,
  estagios: ["demand", "source"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    try {
      const ids = Array.isArray(args.outreachIds) ? args.outreachIds.map(Number) : [];
      if (!ids.length) return { ok: false, summary: "Informe os IDs dos rascunhos aprovados.", error: "sem_ids" };
      const r = await outreach.enviarOutreach({ userId: ctx.userId, outreachIds: ids });
      const enviados = r.filter((x) => x.enviado);
      const manuais = r.filter((x) => x.manual);
      const falhas = r.filter((x) => !x.enviado && !x.manual);
      let resumo = "";
      if (enviados.length) resumo += `Enviados por email: ${enviados.map((x) => x.destinatario).join(", ")}.\n`;
      if (manuais.length) {
        resumo += `Sem provedor de email configurado — ENTREGUE o texto abaixo para a pessoa copiar e enviar:\n` +
          manuais.map((x) => `\n=== ${x.destinatario} ===\n${x.conteudo}`).join("\n");
      }
      if (falhas.length) resumo += `\nFalharam: ${falhas.map((x) => `${x.destinatario} (${x.erro})`).join("; ")}.`;
      return { ok: true, summary: resumo || "Nada para enviar.", data: r };
    } catch (e: any) {
      return { ok: false, summary: "Erro ao enviar.", error: String(e?.message ?? e) };
    }
  },
};

// ---------------------------------------------------------------- registrar resposta
const respostaSchema = defineSchema(
  "registrar_resposta_fornecedor",
  "Registra a RESPOSTA de um fornecedor a uma RFQ (a pessoa cola o email/mensagem no " +
  "chat). Extrai preços/condições, grava a cotação na base e COMPARA com o preço-alvo " +
  "(atingiu ou não, gap %). Use sempre que chegar retorno de fornecedor.",
  {
    type: "object",
    properties: {
      rfqId: { type: "number", description: "ID da RFQ correspondente" },
      textoResposta: { type: "string", description: "Texto integral da resposta do fornecedor" },
      outreachId: { type: "number", description: "ID do outreach original, se souber (fecha o rastreio)" },
    },
    required: ["rfqId", "textoResposta"],
  },
);

export const registrarRespostaFornecedorTool: AgentTool = {
  name: "registrar_resposta_fornecedor",
  schema: respostaSchema,
  estagios: ["demand", "source", "analyze"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    try {
      const r = await outreach.registrarRespostaFornecedor({
        userId: ctx.userId,
        rfqId: Number(args.rfqId),
        textoResposta: String(args.textoResposta ?? ""),
        outreachId: typeof args.outreachId === "number" ? args.outreachId : undefined,
      });
      const linhas = r.comparacao.map((c) =>
        `• ${c.item}: USD ${c.precoUsd.toFixed(2)}` +
        (c.alvoUsd != null
          ? ` vs alvo USD ${c.alvoUsd.toFixed(2)} → ${c.atingiuAlvo ? "ATINGIU o alvo ✓" : `${c.gapPct != null && c.gapPct > 0 ? "+" : ""}${c.gapPct}% acima`}`
          : " (sem alvo definido)"),
      ).join("\n");
      const acima = r.comparacao.some((c) => c.atingiuAlvo === false);
      return {
        ok: true,
        summary:
          `Cotação de ${r.supplierName} registrada (quote #${r.quoteId}):\n${linhas}\n` +
          (acima
            ? `Há itens ACIMA do alvo — ofereça redigir uma CONTRAPROPOSTA (contraproposta_fornecedor). A decisão de aceitar é sempre da pessoa.`
            : `Preços dentro do alvo — ofereça seguir para o cálculo/planilha ou fechar com o fornecedor (decisão da pessoa).`),
        data: r,
      };
    } catch (e: any) {
      return { ok: false, summary: "Não consegui extrair a cotação da resposta.", error: String(e?.message ?? e) };
    }
  },
};

// ---------------------------------------------------------------- contraproposta
const contraSchema = defineSchema(
  "contraproposta_fornecedor",
  "REDIGE uma contraproposta ao fornecedor com base no gap vs preço-alvo (rascunho em " +
  "inglês profissional; NUNCA aceita a oferta — só propõe). Depois MOSTRE o texto e peça " +
  "APROVAÇÃO; o envio é via enviar_cotacao_fornecedor. Use quando a cotação vier acima do alvo.",
  {
    type: "object",
    properties: {
      quoteId: { type: "number", description: "ID da cotação registrada (de registrar_resposta_fornecedor)" },
      instrucoes: { type: "string", description: "Instruções da pessoa (ex.: 'aceito até 12.80', 'ofereça pedido trimestral')" },
    },
    required: ["quoteId"],
  },
);

export const contrapropostaFornecedorTool: AgentTool = {
  name: "contraproposta_fornecedor",
  schema: contraSchema,
  estagios: ["demand", "source", "analyze"],
  async run(args, ctx: ToolContext): Promise<ToolResult> {
    try {
      const r = await outreach.draftContraproposta({
        userId: ctx.userId,
        quoteId: Number(args.quoteId),
        instrucoes: typeof args.instrucoes === "string" ? args.instrucoes : undefined,
      });
      return {
        ok: true,
        summary:
          `Contraproposta redigida (rascunho #${r.outreachId} para ${r.destinatario}). Contexto: ${r.gapResumo}\n---\n${r.corpo}\n---\n` +
          `MOSTRE o texto à pessoa e PEÇA APROVAÇÃO. Só envie (enviar_cotacao_fornecedor) após um SIM explícito. Nunca aceite a oferta em nome da pessoa.`,
        data: r,
      };
    } catch (e: any) {
      return { ok: false, summary: "Não consegui redigir a contraproposta.", error: String(e?.message ?? e) };
    }
  },
};
