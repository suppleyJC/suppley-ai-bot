/**
 * Webhook de EMAIL INBOUND para respostas de RFQ (cotação semi-automatizada).
 *
 * Aponte o inbound-parse do seu provedor (SendGrid Inbound Parse, Mailgun
 * Routes, etc.) para POST /api/rfq/inbound com o header:
 *   Authorization: Bearer <RFQ_INBOUND_TOKEN>
 *
 * Payload aceito (JSON, campos genéricos dos provedores):
 *   { "from": "vendas@fornecedor.com", "subject": "Re: RFQ-2026-0007 ...",
 *     "text": "corpo do email ..." }
 *
 * O número da RFQ é resolvido pelo padrão "RFQ-XXXX" no assunto/corpo. A resposta
 * é parseada e gravada como supplier_quote (comparação vs preço-alvo incluída).
 * Sem RFQ identificável ou token inválido → 4xx, nada é gravado.
 *
 * Segurança: desabilitado quando RFQ_INBOUND_TOKEN não está definido no .env.
 */
import { Router, type Request, type Response } from "express";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "../db/connection";
import { rfqs, supplierOutreach } from "../../drizzle/rfqSchema";
import { registrarRespostaFornecedor } from "../services/rfqOutreachService";

export const rfqInboundRouter = Router();

rfqInboundRouter.post("/api/rfq/inbound", async (req: Request, res: Response) => {
  const token = process.env.RFQ_INBOUND_TOKEN;
  if (!token) return res.status(404).json({ error: "inbound desabilitado" });
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${token}`) return res.status(401).json({ error: "token inválido" });

  const from = String(req.body?.from ?? "").trim();
  const subject = String(req.body?.subject ?? "");
  const text = String(req.body?.text ?? req.body?.body ?? "");
  if (!text) return res.status(400).json({ error: "corpo vazio" });

  // Resolve a RFQ pelo padrão RFQ-... no assunto ou corpo.
  const match = `${subject}\n${text}`.match(/RFQ[-_ ]?([A-Z0-9-]{4,})/i);
  if (!match) return res.status(422).json({ error: "número de RFQ não identificado" });
  const rfqNumberFragment = match[0].replace(/\s/g, "").toUpperCase();

  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "banco indisponível" });

    const [rfq] = await db.select().from(rfqs)
      .where(like(rfqs.rfqNumber, `%${rfqNumberFragment.replace(/^RFQ[-_]?/, "")}%`))
      .limit(1);
    if (!rfq) return res.status(422).json({ error: "RFQ não encontrada" });

    // Tenta casar o outreach original pelo email do remetente (fecha o rastreio).
    let outreachId: number | undefined;
    if (from) {
      const fromEmail = from.match(/<([^>]+)>/)?.[1] ?? from;
      const [o] = await db.select().from(supplierOutreach)
        .where(and(eq(supplierOutreach.rfqId, rfq.id), eq(supplierOutreach.recipientEmail, fromEmail)))
        .limit(1);
      outreachId = o?.id;
    }

    const r = await registrarRespostaFornecedor({
      userId: rfq.userId,
      rfqId: rfq.id,
      textoResposta: text,
      outreachId,
    });
    return res.json({ ok: true, quoteId: r.quoteId, supplierName: r.supplierName });
  } catch (e: any) {
    console.error("[rfqInbound] falha:", e);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
});
