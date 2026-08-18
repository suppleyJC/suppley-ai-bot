/**
 * Trava o LINK ESTÁVEL de arquivo.
 *
 * O defeito que originou esta rota: a planilha gerada pela Excambia era
 * entregue como URL pré-assinada do S3 (1 hora de validade) dentro de uma
 * mensagem de chat, que fica no histórico para sempre. Passada a hora, o clique
 * devolvia um XML cru de AccessDenied — o arquivo continuava lá, íntegro, só o
 * caminho até ele tinha morrido.
 *
 * O que precisa continuar valendo: o link entregue NÃO pode ser a URL do S3, e
 * o token precisa resolver para a chave certa a qualquer momento.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock é içado para o topo do arquivo, então o mock precisa nascer dentro de
// vi.hoisted — uma const comum ainda não existe quando a fábrica roda.
const { storageGetMock } = vi.hoisted(() => ({
  storageGetMock: vi.fn(async (chave: string) => ({
    key: chave,
    url: `https://s3.exemplo/${chave}?X-Amz-Signature=fresca`,
  })),
}));

vi.mock("../storage", () => ({ storageGet: storageGetMock }));

import { assinarTokenArquivo, linkEstavelDeArquivo, arquivoRouter } from "./arquivoRoute";

const CHAVE = "reports/excambia-calc-7-1755000000000.xlsx";

/** Executa o handler da rota isolado, com req/res mínimos. */
async function chamarRota(token: string) {
  const camada = (arquivoRouter as any).stack.find((c: any) => c.route?.path === "/api/arquivo/:token");
  const res: any = {
    statusCode: 0,
    corpo: "",
    destino: "",
    status(c: number) { this.statusCode = c; return this; },
    send(b: string) { this.corpo = b; return this; },
    redirect(c: number, url: string) { this.statusCode = c; this.destino = url; return this; },
  };
  await camada.route.stack[0].handle({ params: { token } }, res, () => {});
  return res;
}

beforeEach(() => {
  process.env.JWT_SECRET = "segredo-de-teste";
  delete process.env.APP_URL;
  storageGetMock.mockClear();
});

afterEach(() => vi.clearAllMocks());

describe("link estável de arquivo", () => {
  it("não entrega a URL do S3 — entrega a rota da aplicação", async () => {
    const link = await linkEstavelDeArquivo({ k: CHAVE, n: "planilha.xlsx", u: 7 });

    expect(link).toContain("/api/arquivo/");
    expect(link).not.toContain("s3");
    expect(link).not.toContain("X-Amz");
    // A chave não pode vazar em claro na URL.
    expect(link).not.toContain(CHAVE);
  });

  it("usa APP_URL para montar link absoluto quando configurada", async () => {
    process.env.APP_URL = "https://calculasuppley.com.br/";
    const link = await linkEstavelDeArquivo({ k: CHAVE });
    expect(link.startsWith("https://calculasuppley.com.br/api/arquivo/")).toBe(true);
  });

  it("resolve o token para a chave certa e redireciona com assinatura fresca", async () => {
    const token = await assinarTokenArquivo({ k: CHAVE, n: "planilha.xlsx", u: 7 });
    const res = await chamarRota(token);

    expect(storageGetMock).toHaveBeenCalledWith(CHAVE, expect.any(Number));
    expect(res.statusCode).toBe(302);
    expect(res.destino).toContain("X-Amz-Signature=fresca");
  });

  it("recusa token forjado sem revelar se a chave existe", async () => {
    const res = await chamarRota("token.completamente.invalido");

    expect(res.statusCode).toBe(404);
    expect(storageGetMock).not.toHaveBeenCalled();
  });

  it("recusa token assinado com outro segredo", async () => {
    const token = await assinarTokenArquivo({ k: CHAVE });
    process.env.JWT_SECRET = "outro-segredo";
    // O módulo já leu o segredo na carga; o teste garante que um token de outra
    // origem (segredo diferente) não passa pela verificação.
    const { SignJWT } = await import("jose");
    const forjado = await new SignJWT({ k: CHAVE })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("segredo-do-atacante"));

    expect(token).not.toBe(forjado);
    const res = await chamarRota(forjado);
    expect(res.statusCode).toBe(404);
  });
});
