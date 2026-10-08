/**
 * Integration Status Service - Verifica status de todas as integrações externas
 */

import { getEmailStatus } from "./emailService";
import { getWhatsAppStatus } from "./whatsappService";

export interface IntegrationStatus {
  email: {
    configured: boolean;
    provider: string;
    fromAddress: string;
  };
  whatsapp: {
    configured: boolean;
    fromNumber: string;
  };
}

export function getIntegrationStatus(): IntegrationStatus {
  const emailStatus = getEmailStatus();
  const waStatus = getWhatsAppStatus();

  return {
    email: {
      configured: emailStatus.isConfigured,
      provider: emailStatus.provider,
      fromAddress: emailStatus.fromAddress,
    },
    whatsapp: {
      configured: waStatus.isConfigured,
      fromNumber: waStatus.fromNumber ? waStatus.fromNumber.replace(/\d{4}$/, "****") : "",
    },
  };
}
