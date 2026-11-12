/**
 * Trava a AUTENTICAÇÃO no Portal Único por par de chaves.
 *
 * Contrato oficial (`/api/plat/` → plat-auth.json):
 *   POST /api/autenticar/chave-acesso
 *     Client-Id, Client-Secret, Role-Type  (obrigatórios)
 *     → 200 com os cabeçalhos Set-Token e X-CSRF-Token
 *
 * O que precisa continuar valendo:
 *   1. sem credencial, não há chamada de rede nem sessão fingida;
 *   2. o token volta em CABEÇALHO, não no corpo;
 *   3. a chave secreta NUNCA aparece em log;
 *   4. 401 em serviço do portal invalida e força nova autenticação;
 *   5. rajada de consultas compartilha UMA autenticação.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cabecalhosPortal,
  obterSessao,
  invalidarToken,
  portalUnicoConfigurado,
  resetPortalUnicoAuth,
} from "./portalUnicoAuth";

const ENV_ORIGINAL = { ...process.env };

function configurar() {
  process.env.PORTAL_UNICO_CLIENT_ID = "id-de-teste";
  process.env.PORTAL_UNICO_CLIENT_SECRET = "segredo-ultra-sensivel";
  process.env.PORTAL_UNICO_ROLE_TYPE = "IMPORTADOR";
}

function limparCredenciais() {
  delete process.env.PORTAL_UNICO_CLIENT_ID;
  delete process.env.PORTAL_UNICO_CLIENT_SECRET;
  delete process.env.PORTAL_UNICO_ROLE_TYPE;
}

/** Resposta mínima com os cabeçalhos do contrato. */
function resposta(status: number, headers: Record<string, string> = {}): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers) } as Response;
}

const OK = () => resposta(200, { "Set-Token": "tok-123", "X-CSRF-Token": "csrf-456" });

beforeEach(() => {
  resetPortalUnicoAuth();
  limparCredenciais();
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

describe("configuração", () => {
  it("não está configurado sem as três variáveis", () => {
    expect(portalUnicoConfigurado()).toBe(false);
    process.env.PORTAL_UNICO_CLIENT_ID = "x";
    expect(portalUnicoConfigurado()).toBe(false);
    process.env.PORTAL_UNICO_CLIENT_SECRET = "y";
    expect(portalUnicoConfigurado()).toBe(false);
    process.env.PORTAL_UNICO_ROLE_TYPE = "IMPORTADOR";
    expect(portalUnicoConfigurado()).toBe(true);
  });

  it("ignora variável só com espaços", () => {
    configurar();
    process.env.PORTAL_UNICO_CLIENT_SECRET = "   ";
    expect(portalUnicoConfigurado()).toBe(false);
  });

  it("sem credencial NÃO faz chamada de rede", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect(await cabecalhosPortal()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("autenticação", () => {
  it("envia os três cabeçalhos obrigatórios do contrato", async () => {
    configurar();
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(OK());

    await obterSessao();

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/autenticar/chave-acesso");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h["Client-Id"]).toBe("id-de-teste");
    expect(h["Client-Secret"]).toBe("segredo-ultra-sensivel");
    expect(h["Role-Type"]).toBe("IMPORTADOR");
  });

  it("lê o token dos CABEÇALHOS e monta Authorization", async () => {
    configurar();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(OK());

    expect(await cabecalhosPortal()).toEqual({
      Authorization: "tok-123",
      "X-CSRF-Token": "csrf-456",
    });
  });

  it("200 sem os cabeçalhos do contrato devolve null — não finge sessão", async () => {
    configurar();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(200));
    expect(await cabecalhosPortal()).toBeNull();
  });

  it("recusa devolve null em vez de lançar", async () => {
    configurar();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(403));
    expect(await cabecalhosPortal()).toBeNull();
  });

  it("falha de rede devolve null em vez de derrubar quem chamou", async () => {
    configurar();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    expect(await cabecalhosPortal()).toBeNull();
  });
});

describe("segredo nunca vaza", () => {
  it("não registra a chave secreta nem o token em log", async () => {
    configurar();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(401));

    await cabecalhosPortal();

    const registrado = warn.mock.calls.flat().map(String).join(" ");
    expect(registrado).not.toContain("segredo-ultra-sensivel");
    expect(registrado).not.toContain("id-de-teste");
    expect(registrado).toContain("401"); // o diagnóstico útil continua lá
  });
});

describe("reuso e invalidação", () => {
  it("reaproveita a sessão em vez de autenticar a cada consulta", async () => {
    configurar();
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(OK());

    await cabecalhosPortal();
    await cabecalhosPortal();
    await cabecalhosPortal();

    expect(f).toHaveBeenCalledTimes(1);
  });

  it("invalidarToken força nova autenticação — é a resposta ao 401", async () => {
    configurar();
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(OK());

    await cabecalhosPortal();
    invalidarToken();
    await cabecalhosPortal();

    expect(f).toHaveBeenCalledTimes(2);
  });

  it("forçar explicitamente também reautentica", async () => {
    configurar();
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(OK());

    await cabecalhosPortal();
    await cabecalhosPortal(true);

    expect(f).toHaveBeenCalledTimes(2);
  });

  it("rajada concorrente compartilha UMA autenticação", async () => {
    configurar();
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise((r) => setTimeout(() => r(OK()), 10)),
    );

    const todos = await Promise.all([
      cabecalhosPortal(), cabecalhosPortal(), cabecalhosPortal(), cabecalhosPortal(),
    ]);

    expect(f).toHaveBeenCalledTimes(1);
    for (const h of todos) expect(h).toEqual({ Authorization: "tok-123", "X-CSRF-Token": "csrf-456" });
  });

  it("depois de uma falha, a próxima chamada tenta de novo", async () => {
    configurar();
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(resposta(500))
      .mockResolvedValueOnce(OK());

    expect(await cabecalhosPortal()).toBeNull();
    expect(await cabecalhosPortal()).not.toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
