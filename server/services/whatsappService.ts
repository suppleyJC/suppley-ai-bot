/**
 * WhatsApp Service - Abstração para envio de mensagens via Twilio WhatsApp Business API
 * 
 * Configuração via variáveis de ambiente:
 * - TWILIO_ACCOUNT_SID: Account SID do Twilio
 * - TWILIO_AUTH_TOKEN: Auth Token do Twilio
 * - TWILIO_WHATSAPP_FROM: Número WhatsApp remetente (formato: whatsapp:+5548XXXXXXXXX)
 * 
 * Para configurar:
 * 1. Criar conta em https://www.twilio.com
 * 2. Ativar WhatsApp Sandbox ou Business API
 * 3. Configurar as variáveis acima
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhatsAppMessage {
  to: string; // Número do destinatário (formato: +5511999999999)
  body: string;
  mediaUrl?: string; // URL pública de mídia (PDF, imagem)
  templateSid?: string; // Para mensagens template aprovadas
  templateVariables?: Record<string, string>;
}

export interface WhatsAppResult {
  success: boolean;
  messageSid?: string;
  status?: string;
  error?: string;
  errorCode?: number;
}

export interface WhatsAppConfig {
  isConfigured: boolean;
  fromNumber: string;
  accountSid: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

function getWhatsAppConfig(): WhatsAppConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || "";

  return {
    isConfigured: !!(accountSid && process.env.TWILIO_AUTH_TOKEN && fromNumber),
    fromNumber,
    accountSid,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format phone number to WhatsApp format
 * Accepts: +5511999999999, 5511999999999, 11999999999
 * Returns: whatsapp:+5511999999999
 */
function formatWhatsAppNumber(phone: string): string {
  // Remove all non-numeric except +
  let cleaned = phone.replace(/[^\d+]/g, "");
  
  // Add country code if missing
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("55")) {
      cleaned = "+" + cleaned;
    } else {
      cleaned = "+55" + cleaned;
    }
  }

  return `whatsapp:${cleaned}`;
}

// ─── Send Message ────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp message via Twilio API
 */
export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<WhatsAppResult> {
  const config = getWhatsAppConfig();

  if (!config.isConfigured) {
    console.warn("[WhatsAppService] Twilio WhatsApp not configured. Message not sent.");
    return {
      success: false,
      error: "Twilio WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.",
    };
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const toNumber = formatWhatsAppNumber(message.to);
  const fromNumber = config.fromNumber.startsWith("whatsapp:")
    ? config.fromNumber
    : `whatsapp:${config.fromNumber}`;

  try {
    const formData = new URLSearchParams();
    formData.append("From", fromNumber);
    formData.append("To", toNumber);
    formData.append("Body", message.body);

    if (message.mediaUrl) {
      formData.append("MediaUrl", message.mediaUrl);
    }

    // If using a template
    if (message.templateSid) {
      formData.append("ContentSid", message.templateSid);
      if (message.templateVariables) {
        formData.append("ContentVariables", JSON.stringify(message.templateVariables));
      }
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    const credentials = Buffer.from(`${config.accountSid}:${authToken}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await response.json() as any;

    if (response.ok && data.sid) {
      return {
        success: true,
        messageSid: data.sid,
        status: data.status,
      };
    }

    return {
      success: false,
      error: data.message || `Twilio API error (${response.status})`,
      errorCode: data.code,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `WhatsApp send failed: ${error.message}`,
    };
  }
}

/**
 * Send a bulk WhatsApp message to multiple recipients
 */
export async function sendBulkWhatsApp(
  recipients: string[],
  body: string,
  mediaUrl?: string
): Promise<{ sent: number; failed: number; results: WhatsAppResult[] }> {
  const results: WhatsAppResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const to of recipients) {
    // Twilio rate limit: ~1 message per second
    const result = await sendWhatsAppMessage({ to, body, mediaUrl });
    results.push(result);

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay to respect rate limits
    if (recipients.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }

  return { sent, failed, results };
}

/**
 * Check if WhatsApp service is properly configured
 */
export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig().isConfigured;
}

/**
 * Get current WhatsApp configuration (without secrets)
 */
export function getWhatsAppStatus(): WhatsAppConfig {
  return getWhatsAppConfig();
}

// ─── Message Templates ───────────────────────────────────────────────────────

/**
 * Build a quotation request message for WhatsApp
 */
export function buildWhatsAppQuotationRequest(params: {
  supplierName: string;
  companyName: string;
  products: Array<{ name: string; quantity: string }>;
  responseUrl: string;
  language: string;
}): string {
  const { supplierName, companyName, products, responseUrl, language } = params;

  const isPortuguese = language === "pt";
  const isSpanish = language === "es";

  const greeting = isPortuguese ? "Olá" : isSpanish ? "Hola" : "Hello";
  const intro = isPortuguese
    ? "Gostaríamos de solicitar cotação para:"
    : isSpanish
    ? "Nos gustaría solicitar cotización para:"
    : "We would like to request a quotation for:";
  const responseText = isPortuguese
    ? "Responder online"
    : isSpanish
    ? "Responder en línea"
    : "Respond online";
  const regards = isPortuguese ? "Atenciosamente" : isSpanish ? "Atentamente" : "Best regards";

  const productList = products
    .map(p => `• ${p.name} — ${p.quantity}`)
    .join("\n");

  return `${greeting} ${supplierName}! 👋

${intro}

${productList}

${responseText}: ${responseUrl}

${regards},
*${companyName}*
_via SUPPLEY Calc_`;
}
