import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock env
vi.mock("../_core/env", () => ({
  default: {
    DATABASE_URL: "mysql://test:test@localhost/test",
  }
}));

describe("Email Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SMTP_HOST;
  });

  it("should export sendEmail function", async () => {
    const emailService = await import("./emailService");
    expect(emailService.sendEmail).toBeDefined();
    expect(typeof emailService.sendEmail).toBe("function");
  });

  it("should export isEmailConfigured function", async () => {
    const emailService = await import("./emailService");
    expect(emailService.isEmailConfigured).toBeDefined();
    expect(typeof emailService.isEmailConfigured).toBe("function");
  });

  it("should return false when no provider is configured", async () => {
    const emailService = await import("./emailService");
    const configured = emailService.isEmailConfigured();
    expect(configured).toBe(false);
  });

  it("should fail gracefully when sending without configuration", async () => {
    const emailService = await import("./emailService");
    const result = await emailService.sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("WhatsApp Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_WHATSAPP_FROM;
  });

  it("should export sendWhatsAppMessage function", async () => {
    const whatsappService = await import("./whatsappService");
    expect(whatsappService.sendWhatsAppMessage).toBeDefined();
    expect(typeof whatsappService.sendWhatsAppMessage).toBe("function");
  });

  it("should export isWhatsAppConfigured function", async () => {
    const whatsappService = await import("./whatsappService");
    expect(whatsappService.isWhatsAppConfigured).toBeDefined();
    expect(typeof whatsappService.isWhatsAppConfigured).toBe("function");
  });

  it("should return false when Twilio is not configured", async () => {
    const whatsappService = await import("./whatsappService");
    const configured = whatsappService.isWhatsAppConfigured();
    expect(configured).toBe(false);
  });

  it("should fail gracefully when sending without configuration", async () => {
    const whatsappService = await import("./whatsappService");
    const result = await whatsappService.sendWhatsAppMessage({
      to: "+5548999999999",
      body: "Test message",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Integration Status Service", () => {
  it("should export getIntegrationStatus function", async () => {
    const statusService = await import("./integrationStatusService");
    expect(statusService.getIntegrationStatus).toBeDefined();
    expect(typeof statusService.getIntegrationStatus).toBe("function");
  });

  it("should return status for all integrations", async () => {
    const statusService = await import("./integrationStatusService");
    const status = statusService.getIntegrationStatus();
    
    expect(status).toBeDefined();
    expect(status.email).toBeDefined();
    expect(status.whatsapp).toBeDefined();
    expect(status.email.configured).toBe(false);
    expect(status.whatsapp.configured).toBe(false);
  });
});
