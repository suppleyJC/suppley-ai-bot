/**
 * rfqOutreachService — COTAÇÃO SEMI-AUTOMATIZADA (cenário B: humano-no-loop).
 *
 * O sistema faz o trabalho (redigir, enviar, ler retorno, contrapropor com base
 * no preço-alvo); a pessoa APROVA nos dois portões críticos:
 *   Portão 1: envio da RFQ/contraproposta ao fornecedor (nada sai sem OK)
 *   Portão 2: aceite comercial final (o negociador NUNCA aceita — só propõe)
 *
 * Fluxo:
 *   prepararOutreach  → rascunhos por fornecedor (com preço-alvo) [draft]
 *   enviarOutreach    → após aprovação: email real (provider configurado) ou
 *                       texto pronto p/ copiar (modo manual)          [sent/queued]
 *   registrarResposta → resposta do fornecedor (colada no chat ou webhook)
 *                       parseada → supplier_quotes + comparação vs alvo [replied]
 *   draftContraproposta → contraproposta redigida com o gap vs alvo   [draft]
 *
 * Reusa a infra existente: emailService (SendGrid/Mailgun), tabelas
 * supplier_outreach / supplier_quotes / supplier_quote_items (com vsTargetPercent).
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/connection";
import { rfqs, rfqItems, supplierQuotes, supplierQuoteItems, supplierOutreach } from "../../drizzle/rfqSchema";
import { industries } from "../../drizzle/schema";
import { sendEmail, isEmailConfigured } from "./emailService";
import { invokeLLM, MODELS } from "../_core/llm";

const usd = (cents?: number | null) =>
  cents == null ? null : (cents / 100).toFixed(2);

// ============================================================
// 1) PREPARAR — rascunhos de outreach por fornecedor
// ============================================================

export interface OutreachDraft {
  outreachId: number;
  destinatario: string;
  email: string | null;
  assunto: string;
  corpo: string;
}

export async function prepararOutreach(input: {
  userId: number;
  rfqId: number;
  fornecedorIds?: number[];
  emailsAvulsos?: Array<{ nome: string; email: string }>;
  observacao?: string;
}): Promise<{ rfqNumber: string; drafts: OutreachDraft[] }> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [rfq] = await db.select().from(rfqs)
    .where(and(eq(rfqs.id, input.rfqId), eq(rfqs.userId, input.userId))).limit(1);
  if (!rfq) throw new Error("RFQ não encontrada");
  const itens = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfq.id));

  // Destinatários: fornecedores da base (com email) + emails avulsos.
  const destinatarios: Array<{ nome: string; email: string | null; supplierId: number | null; pais?: string | null }> = [];
  if (input.fornecedorIds?.length) {
    const rows = await db.select().from(industries)
      .where(and(inArray(industries.id, input.fornecedorIds), eq(industries.userId, input.userId)));
    for (const f of rows) {
      destinatarios.push({ nome: f.name, email: f.contactEmail ?? null, supplierId: f.id, pais: f.country });
    }
  }
  for (const e of input.emailsAvulsos ?? []) {
    if (e?.email) destinatarios.push({ nome: e.nome || e.email, email: e.email, supplierId: null });
  }
  if (destinatarios.length === 0) throw new Error("Nenhum destinatário (fornecedor com email ou email avulso)");

  const drafts: OutreachDraft[] = [];
  for (const dest of destinatarios) {
    const linguaPt = /brasil|brazil/i.test(dest.pais ?? "");
    const corpo = montarMensagemRfq({ rfq, itens, destinatario: dest.nome, observacao: input.observacao, pt: linguaPt });
    const assunto = `RFQ ${rfq.rfqNumber} — ${rfq.title}`;

    const [res] = await db.insert(supplierOutreach).values({
      rfqId: rfq.id,
      supplierId: dest.supplierId,
      recipientName: dest.nome,
      recipientEmail: dest.email,
      channel: "email",
      language: linguaPt ? "pt" : "en",
      subject: assunto,
      messageContent: corpo,
      status: "draft",
    });
    drafts.push({
      outreachId: Number((res as any).insertId),
      destinatario: dest.nome,
      email: dest.email,
      assunto,
      corpo,
    });
  }
  return { rfqNumber: rfq.rfqNumber, drafts };
}

/** Mensagem profissional da RFQ com preço-alvo por item (o coração da negociação). */
function montarMensagemRfq(params: {
  rfq: typeof rfqs.$inferSelect;
  itens: Array<typeof rfqItems.$inferSelect>;
  destinatario: string;
  observacao?: string;
  pt: boolean;
}): string {
  const { rfq, itens, destinatario, observacao, pt } = params;
  const linhas = itens.map((it) => {
    const alvo = usd(it.targetUnitPriceCents);
    const base = `- ${it.productName}${it.ncmCode ? ` (HS/NCM ${it.ncmCode})` : ""}: ${it.quantity} ${it.unit}`;
    if (pt) return `${base}${alvo ? ` — preço-alvo USD ${alvo}/${it.unit}` : ""}`;
    return `${base}${alvo ? ` — target price USD ${alvo}/${it.unit}` : ""}`;
  }).join("\n");

  if (pt) {
    return [
      `Prezado(a) ${destinatario},`,
      ``,
      `Solicitamos cotação (${rfq.rfqNumber}) para os itens abaixo, Incoterm ${rfq.preferredIncoterm ?? "FOB"}, destino Brasil (${rfq.destinationState ?? "SC"}):`,
      ``,
      linhas,
      ``,
      `Favor informar: preço unitário (${rfq.currency ?? "USD"}), MOQ, prazo de produção, condições de pagamento e validade da proposta.`,
      observacao ? `\nObservações: ${observacao}` : ``,
      ``,
      `Atenciosamente,`,
    ].filter(Boolean).join("\n");
  }
  return [
    `Dear ${destinatario},`,
    ``,
    `We kindly request your quotation (${rfq.rfqNumber}) for the items below, Incoterm ${rfq.preferredIncoterm ?? "FOB"}, destination Brazil (${rfq.destinationState ?? "SC"}):`,
    ``,
    linhas,
    ``,
    `Please advise: unit price (${rfq.currency ?? "USD"}), MOQ, production lead time, payment terms and quotation validity.`,
    observacao ? `\nRemarks: ${observacao}` : ``,
    ``,
    `Best regards,`,
  ].filter(Boolean).join("\n");
}

// ============================================================
// 2) ENVIAR — só depois da aprovação humana (Portão 1)
// ============================================================

export async function enviarOutreach(input: {
  userId: number;
  outreachIds: number[];
}): Promise<Array<{ outreachId: number; enviado: boolean; manual: boolean; destinatario: string; conteudo?: string; erro?: string }>> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const rows = await db.select({
    o: supplierOutreach,
    rfqUserId: rfqs.userId,
    rfqNumber: rfqs.rfqNumber,
  }).from(supplierOutreach)
    .innerJoin(rfqs, eq(supplierOutreach.rfqId, rfqs.id))
    .where(inArray(supplierOutreach.id, input.outreachIds));

  const out: Array<{ outreachId: number; enviado: boolean; manual: boolean; destinatario: string; conteudo?: string; erro?: string }> = [];
  for (const { o, rfqUserId } of rows) {
    if (rfqUserId !== input.userId) continue; // posse
    if (!o.recipientEmail || !isEmailConfigured()) {
      // Modo manual: marca como queued e devolve o texto pronto para copiar.
      await db.update(supplierOutreach).set({ status: "queued" }).where(eq(supplierOutreach.id, o.id));
      out.push({
        outreachId: o.id, enviado: false, manual: true, destinatario: o.recipientName,
        conteudo: `Para: ${o.recipientEmail ?? "(email não cadastrado)"}\nAssunto: ${o.subject}\n\n${o.messageContent}`,
      });
      continue;
    }
    const r = await sendEmail({
      to: o.recipientEmail,
      subject: o.subject ?? "RFQ",
      html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${o.messageContent}</pre>`,
      text: o.messageContent,
      tags: ["rfq-outreach"],
    });
    await db.update(supplierOutreach)
      .set(r.success ? { status: "sent", sentAt: new Date() } : { status: "bounced" })
      .where(eq(supplierOutreach.id, o.id));
    out.push({ outreachId: o.id, enviado: r.success, manual: false, destinatario: o.recipientName, erro: r.error });
  }
  return out;
}

// ============================================================
// 3) REGISTRAR RESPOSTA — parse estruturado (Haiku) + comparação vs alvo
// ============================================================

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { type: "string" },
    supplierCountry: { type: "string" },
    currency: { type: "string" },
    incoterm: { type: "string" },
    leadTimeDays: { type: "number" },
    moq: { type: "number" },
    paymentTerms: { type: "string" },
    validadeDias: { type: "number" },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productName: { type: "string" },
          unitPriceUsd: { type: "number", description: "preço unitário em USD (decimal)" },
          quantity: { type: "number" },
          unit: { type: "string" },
        },
        required: ["productName", "unitPriceUsd"],
      },
    },
  },
  required: ["supplierName", "itens"],
} as const;

export async function registrarRespostaFornecedor(input: {
  userId: number;
  rfqId: number;
  textoResposta: string;
  outreachId?: number;
}): Promise<{
  quoteId: number;
  supplierName: string;
  comparacao: Array<{ item: string; precoUsd: number; alvoUsd: number | null; gapPct: number | null; atingiuAlvo: boolean | null }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [rfq] = await db.select().from(rfqs)
    .where(and(eq(rfqs.id, input.rfqId), eq(rfqs.userId, input.userId))).limit(1);
  if (!rfq) throw new Error("RFQ não encontrada");
  const itensRfq = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfq.id));

  // Parse estruturado da resposta (modelo rápido — extração determinística).
  const res = await invokeLLM({
    model: MODELS.fast,
    messages: [
      { role: "system", content: "Extraia os dados da resposta de cotação do fornecedor. Preços em USD decimais. Não invente valores ausentes." },
      { role: "user", content: input.textoResposta.slice(0, 20_000) },
    ],
    outputSchema: PARSE_SCHEMA as any,
  });
  const raw = res.choices?.[0]?.message?.content;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed?.itens?.length) throw new Error("Não consegui extrair itens/preços da resposta");

  const totalFobCents = parsed.itens.reduce((s: number, it: any) =>
    s + Math.round((it.unitPriceUsd ?? 0) * 100) * (it.quantity ?? 1), 0);

  const [qRes] = await db.insert(supplierQuotes).values({
    rfqId: rfq.id,
    supplierName: String(parsed.supplierName).slice(0, 255),
    supplierCountry: String(parsed.supplierCountry ?? "N/D").slice(0, 100),
    currency: String(parsed.currency ?? "USD").slice(0, 3).toUpperCase(),
    incoterm: String(parsed.incoterm ?? rfq.preferredIncoterm ?? "FOB").slice(0, 3).toUpperCase(),
    totalFobCents,
    paymentTerms: parsed.paymentTerms ? String(parsed.paymentTerms).slice(0, 255) : null,
    leadTimeDays: typeof parsed.leadTimeDays === "number" ? Math.round(parsed.leadTimeDays) : null,
    moq: typeof parsed.moq === "number" ? Math.round(parsed.moq) : null,
    validUntil: typeof parsed.validadeDias === "number"
      ? new Date(Date.now() + parsed.validadeDias * 86_400_000) : null,
    status: "received",
    notes: input.textoResposta.slice(0, 2000),
  });
  const quoteId = Number((qRes as any).insertId);

  // Itens + comparação vs preço-alvo (casamento por nome, tolerante).
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();
  const comparacao: Array<{ item: string; precoUsd: number; alvoUsd: number | null; gapPct: number | null; atingiuAlvo: boolean | null }> = [];
  for (const it of parsed.itens) {
    const unitPriceCents = Math.round((it.unitPriceUsd ?? 0) * 100);
    const quantity = Math.round(it.quantity ?? itensRfq[0]?.quantity ?? 1);
    const match = itensRfq.find((ri) => {
      const a = norm(ri.productName); const b = norm(String(it.productName));
      return a.includes(b) || b.includes(a) || a.split(" ").some((t) => t.length > 3 && b.includes(t));
    }) ?? itensRfq[0];

    let vsTargetPercent: number | null = null;
    let atingiuAlvo: boolean | null = null;
    if (match?.targetUnitPriceCents) {
      vsTargetPercent = Math.round(((unitPriceCents - match.targetUnitPriceCents) / match.targetUnitPriceCents) * 10_000);
      atingiuAlvo = unitPriceCents <= match.targetUnitPriceCents;
    }
    if (match) {
      await db.insert(supplierQuoteItems).values({
        supplierQuoteId: quoteId,
        rfqItemId: match.id,
        unitPriceCents,
        totalPriceCents: unitPriceCents * quantity,
        quantity,
        unit: it.unit ? String(it.unit).slice(0, 20) : match.unit,
        supplierProductName: String(it.productName).slice(0, 255),
        vsTargetPercent: vsTargetPercent ?? undefined,
      });
    }
    comparacao.push({
      item: String(it.productName),
      precoUsd: unitPriceCents / 100,
      alvoUsd: match?.targetUnitPriceCents != null ? match.targetUnitPriceCents / 100 : null,
      gapPct: vsTargetPercent != null ? vsTargetPercent / 100 : null,
      atingiuAlvo,
    });
  }

  // Fecha o loop do outreach.
  if (input.outreachId) {
    await db.update(supplierOutreach)
      .set({ status: "replied", repliedAt: new Date(), supplierQuoteId: quoteId })
      .where(eq(supplierOutreach.id, input.outreachId));
  }

  return { quoteId, supplierName: parsed.supplierName, comparacao };
}

// ============================================================
// 4) CONTRAPROPOSTA — redigida pela IA, enviada só com aprovação
// ============================================================

export async function draftContraproposta(input: {
  userId: number;
  quoteId: number;
  instrucoes?: string;
}): Promise<OutreachDraft & { gapResumo: string }> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [row] = await db.select({ q: supplierQuotes, rfqUserId: rfqs.userId, rfq: rfqs })
    .from(supplierQuotes)
    .innerJoin(rfqs, eq(supplierQuotes.rfqId, rfqs.id))
    .where(eq(supplierQuotes.id, input.quoteId)).limit(1);
  if (!row || row.rfqUserId !== input.userId) throw new Error("Cotação não encontrada");
  const { q, rfq } = row;

  const qItens = await db.select({ qi: supplierQuoteItems, ri: rfqItems })
    .from(supplierQuoteItems)
    .innerJoin(rfqItems, eq(supplierQuoteItems.rfqItemId, rfqItems.id))
    .where(eq(supplierQuoteItems.supplierQuoteId, q.id));

  const gaps = qItens.map(({ qi, ri }) => ({
    item: ri.productName,
    ofertadoUsd: qi.unitPriceCents / 100,
    alvoUsd: ri.targetUnitPriceCents != null ? ri.targetUnitPriceCents / 100 : null,
    gapPct: qi.vsTargetPercent != null ? qi.vsTargetPercent / 100 : null,
  }));
  const gapResumo = gaps.map((g) =>
    `${g.item}: ofertado USD ${g.ofertadoUsd.toFixed(2)}${g.alvoUsd != null ? ` vs alvo USD ${g.alvoUsd.toFixed(2)} (${g.gapPct != null && g.gapPct > 0 ? "+" : ""}${g.gapPct ?? "?"}%)` : ""}`,
  ).join(" · ");

  // Redação da contraproposta (modelo balanced) com GUARDRAILS de negociação.
  const res = await invokeLLM({
    model: MODELS.balanced,
    messages: [
      {
        role: "system",
        content:
          "Você redige contrapropostas comerciais de importação em inglês profissional e cordial. REGRAS DURAS: " +
          "(1) NUNCA aceite a oferta — apenas contraproponha; (2) ancore no preço-alvo informado, sem revelar margens internas; " +
          "(3) use alavancas legítimas (volume, recorrência, prazo de pagamento, consolidação de itens); " +
          "(4) não invente números além dos fornecidos; (5) tom firme e respeitoso, máx. 180 palavras; " +
          "(6) termine pedindo confirmação do preço revisado.",
      },
      {
        role: "user",
        content:
          `RFQ ${rfq.rfqNumber} — ${rfq.title}. Fornecedor: ${q.supplierName}.\n` +
          `Situação por item: ${gapResumo}\n` +
          `Condições ofertadas: pagamento ${q.paymentTerms ?? "n/d"}, lead time ${q.leadTimeDays ?? "n/d"} dias, MOQ ${q.moq ?? "n/d"}.\n` +
          (input.instrucoes ? `Instruções do importador: ${input.instrucoes}\n` : "") +
          `Redija a contraproposta pedindo o preço-alvo (ou aproximação máxima), citando as alavancas.`,
      },
    ],
  });
  const corpo = typeof res.choices?.[0]?.message?.content === "string"
    ? res.choices[0].message.content
    : "";
  if (!corpo.trim()) throw new Error("Falha ao redigir a contraproposta");

  const assunto = `Re: RFQ ${rfq.rfqNumber} — counter proposal`;
  const [oRes] = await db.insert(supplierOutreach).values({
    rfqId: rfq.id,
    supplierId: q.supplierId,
    recipientName: q.supplierName,
    recipientEmail: q.supplierEmail,
    channel: "email",
    language: "en",
    subject: assunto,
    messageContent: corpo,
    status: "draft",
  });

  return {
    outreachId: Number((oRes as any).insertId),
    destinatario: q.supplierName,
    email: q.supplierEmail,
    assunto,
    corpo,
    gapResumo,
  };
}
