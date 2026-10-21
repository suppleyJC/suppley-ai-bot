/**
 * Email Service - Abstração para envio de emails via SendGrid ou SMTP
 * 
 * Configuração via variáveis de ambiente:
 * - EMAIL_PROVIDER: "sendgrid" | "smtp" (default: "sendgrid")
 * - SENDGRID_API_KEY: API key do SendGrid
 * - SMTP_HOST: Host SMTP (ex: smtp.gmail.com)
 * - SMTP_PORT: Porta SMTP (default: 587)
 * - SMTP_USER: Usuário SMTP
 * - SMTP_PASS: Senha SMTP
 * - EMAIL_FROM_ADDRESS: Endereço remetente (default: noreply@suppley.com.br)
 * - EMAIL_FROM_NAME: Nome remetente (default: SUPPLEY Calc)
 */

// No external imports needed - uses process.env directly

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded
  contentType: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
  statusCode?: number;
}

export interface EmailConfig {
  provider: "sendgrid" | "smtp";
  fromAddress: string;
  fromName: string;
  isConfigured: boolean;
}

// ─── Configuration ───────────────────────────────────────────────────────────

function getEmailConfig(): EmailConfig {
  const provider = (process.env.EMAIL_PROVIDER || "sendgrid") as "sendgrid" | "smtp";
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "noreply@suppley.com.br";
  const fromName = process.env.EMAIL_FROM_NAME || "SUPPLEY Calc";

  let isConfigured = false;
  if (provider === "sendgrid") {
    isConfigured = !!process.env.SENDGRID_API_KEY;
  } else {
    isConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  return { provider, fromAddress, fromName, isConfigured };
}

// ─── SendGrid Provider ───────────────────────────────────────────────────────

async function sendViaSendGrid(options: EmailOptions, config: EmailConfig): Promise<EmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return { success: false, provider: "sendgrid", error: "SENDGRID_API_KEY not configured" };
  }

  const toArray = Array.isArray(options.to) ? options.to : [options.to];

  const payload: any = {
    personalizations: [{
      to: toArray.map(email => ({ email })),
      ...(options.cc?.length ? { cc: options.cc.map(email => ({ email })) } : {}),
      ...(options.bcc?.length ? { bcc: options.bcc.map(email => ({ email })) } : {}),
    }],
    from: {
      email: config.fromAddress,
      name: config.fromName,
    },
    subject: options.subject,
    content: [
      ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
      { type: "text/html", value: options.html },
    ],
  };

  if (options.replyTo) {
    payload.reply_to = { email: options.replyTo };
  }

  if (options.attachments?.length) {
    payload.attachments = options.attachments.map(att => ({
      content: att.content,
      filename: att.filename,
      type: att.contentType,
      disposition: "attachment",
    }));
  }

  if (options.tags?.length) {
    payload.categories = options.tags;
  }

  if (options.metadata) {
    payload.custom_args = options.metadata;
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 202 || response.status === 200) {
      const messageId = response.headers.get("x-message-id") || undefined;
      return { success: true, provider: "sendgrid", messageId, statusCode: response.status };
    }

    const errorBody = await response.text();
    return {
      success: false,
      provider: "sendgrid",
      error: `SendGrid API error (${response.status}): ${errorBody}`,
      statusCode: response.status,
    };
  } catch (error: any) {
    return {
      success: false,
      provider: "sendgrid",
      error: `SendGrid request failed: ${error.message}`,
    };
  }
}

// ─── SMTP Provider (via Mailgun/Postmark HTTP API as fallback) ────────────────

async function sendViaSMTP(options: EmailOptions, config: EmailConfig): Promise<EmailResult> {
  // Uses Mailgun-compatible HTTP API for SMTP-like sending without nodemailer dependency
  const smtpHost = process.env.SMTP_HOST || "";
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = process.env.SMTP_PASS || "";
  const smtpPort = process.env.SMTP_PORT || "587";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, provider: "smtp", error: "SMTP credentials not configured" };
  }

  // If it's a Mailgun domain, use their HTTP API
  if (smtpHost.includes("mailgun")) {
    try {
      const domain = smtpHost.replace("smtp.", "").replace("mailgun.org", "mg.suppley.com.br");
      const toArray = Array.isArray(options.to) ? options.to : [options.to];

      const formData = new URLSearchParams();
      formData.append("from", `${config.fromName} <${config.fromAddress}>`);
      formData.append("to", toArray.join(","));
      formData.append("subject", options.subject);
      formData.append("html", options.html);
      if (options.text) formData.append("text", options.text);
      if (options.replyTo) formData.append("h:Reply-To", options.replyTo);

      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`api:${smtpPass}`).toString("base64")}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json() as any;
        return { success: true, provider: "smtp/mailgun", messageId: data.id };
      }

      const errorText = await response.text();
      return { success: false, provider: "smtp/mailgun", error: errorText, statusCode: response.status };
    } catch (error: any) {
      return { success: false, provider: "smtp/mailgun", error: error.message };
    }
  }

  // Generic SMTP fallback - mark as unsupported without nodemailer
  return {
    success: false,
    provider: "smtp",
    error: `Generic SMTP (${smtpHost}:${smtpPort}) requires nodemailer package. Use SendGrid or Mailgun HTTP API instead.`,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Send an email using the configured provider (SendGrid or SMTP)
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const config = getEmailConfig();

  if (!config.isConfigured) {
    console.warn(`[EmailService] Provider "${config.provider}" is not configured. Email not sent.`);
    return {
      success: false,
      provider: config.provider,
      error: `Email provider "${config.provider}" is not configured. Set the required environment variables.`,
    };
  }

  if (config.provider === "sendgrid") {
    return sendViaSendGrid(options, config);
  } else {
    return sendViaSMTP(options, config);
  }
}

/**
 * Check if email service is properly configured
 */
export function isEmailConfigured(): boolean {
  return getEmailConfig().isConfigured;
}

/**
 * Get current email configuration (without secrets)
 */
export function getEmailStatus(): EmailConfig {
  return getEmailConfig();
}

// ─── Email Templates ─────────────────────────────────────────────────────────

/**
 * Generate HTML email for supplier quotation request
 */
export function buildQuotationRequestEmail(params: {
  supplierName: string;
  companyName: string;
  products: Array<{ name: string; quantity: string; specs?: string }>;
  deadline?: string;
  responseUrl: string;
  language: string;
}): { html: string; text: string } {
  const { supplierName, companyName, products, deadline, responseUrl, language } = params;

  const isPortuguese = language === "pt";
  const isSpanish = language === "es";

  const greeting = isPortuguese ? "Prezado(a)" : isSpanish ? "Estimado(a)" : "Dear";
  const intro = isPortuguese
    ? `Gostaríamos de solicitar uma cotação para os seguintes itens:`
    : isSpanish
    ? `Nos gustaría solicitar una cotización para los siguientes artículos:`
    : `We would like to request a quotation for the following items:`;
  const deadlineText = deadline
    ? isPortuguese
      ? `Prazo para resposta: ${deadline}`
      : isSpanish
      ? `Plazo de respuesta: ${deadline}`
      : `Response deadline: ${deadline}`
    : "";
  const responseText = isPortuguese
    ? "Responder Cotação"
    : isSpanish
    ? "Responder Cotización"
    : "Respond to Quotation";
  const regards = isPortuguese ? "Atenciosamente" : isSpanish ? "Atentamente" : "Best regards";

  const productRows = products
    .map(p => `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${p.name}</td><td style="padding:8px;border-bottom:1px solid #eee;">${p.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;">${p.specs || "-"}</td></tr>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:linear-gradient(135deg,#311260,#682ABA);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:white;margin:0;font-size:20px;">SUPPLEY Calc</h1>
    <p style="color:#c4b5fd;margin:4px 0 0;font-size:13px;">${companyName}</p>
  </div>
  <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p>${greeting} ${supplierName},</p>
    <p>${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">${isPortuguese ? "Produto" : isSpanish ? "Producto" : "Product"}</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">${isPortuguese ? "Quantidade" : isSpanish ? "Cantidad" : "Quantity"}</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">${isPortuguese ? "Especificações" : isSpanish ? "Especificaciones" : "Specifications"}</th>
        </tr>
      </thead>
      <tbody>${productRows}</tbody>
    </table>
    ${deadlineText ? `<p style="color:#6b7280;font-size:14px;">${deadlineText}</p>` : ""}
    <div style="text-align:center;margin:24px 0;">
      <a href="${responseUrl}" style="display:inline-block;background:linear-gradient(135deg,#311260,#682ABA);color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">${responseText}</a>
    </div>
    <p>${regards},<br/><strong>${companyName}</strong></p>
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px;">
    Powered by SUPPLEY Calc — calculasuppley.com.br
  </p>
</body>
</html>`;

  const text = `${greeting} ${supplierName},\n\n${intro}\n\n${products.map(p => `- ${p.name} (${p.quantity})${p.specs ? ` - ${p.specs}` : ""}`).join("\n")}\n\n${deadlineText}\n\n${responseText}: ${responseUrl}\n\n${regards},\n${companyName}`;

  return { html, text };
}

/**
 * Generate HTML email for general notification
 */
export function buildNotificationEmail(params: {
  title: string;
  message: string;
  ctaText?: string;
  ctaUrl?: string;
}): { html: string; text: string } {
  const { title, message, ctaText, ctaUrl } = params;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:linear-gradient(135deg,#311260,#682ABA);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:white;margin:0;font-size:20px;">SUPPLEY Calc</h1>
  </div>
  <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="color:#311260;margin:0 0 12px;">${title}</h2>
    <p style="line-height:1.6;">${message}</p>
    ${ctaText && ctaUrl ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#311260,#682ABA);color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">${ctaText}</a>
    </div>` : ""}
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px;">
    Powered by SUPPLEY Calc — calculasuppley.com.br
  </p>
</body>
</html>`;

  const text = `${title}\n\n${message}${ctaText && ctaUrl ? `\n\n${ctaText}: ${ctaUrl}` : ""}`;

  return { html, text };
}
