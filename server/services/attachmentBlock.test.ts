import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../storage", () => ({
  storageGet: vi.fn(),
}));

import { storageGet } from "../storage";
import { applyAttachmentToMessages, buildAttachmentBlock } from "./attachmentBlock";

const mockedStorageGet = vi.mocked(storageGet);

describe("attachmentBlock security", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignora a URL enviada pelo cliente e baixa somente a URL re-assinada pelo servidor", async () => {
    mockedStorageGet.mockResolvedValue({
      key: "quotations/42/file.txt",
      url: "https://suppley-test.s3.amazonaws.com/quotations/42/file.txt?signed=1",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("conteudo seguro", {
        status: 200,
        headers: { "content-length": "15" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildAttachmentBlock(
      {
        url: "http://169.254.169.254/latest/meta-data/",
        fileKey: "quotations/42/file.txt",
        mimeType: "text/plain",
        name: "file.txt",
      },
      42,
    );

    expect(mockedStorageGet).toHaveBeenCalledWith("quotations/42/file.txt");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://suppley-test.s3.amazonaws.com/quotations/42/file.txt?signed=1",
      { redirect: "error" },
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://169.254.169.254/latest/meta-data/",
      expect.anything(),
    );
    expect(result).toMatchObject({ type: "text" });
  });

  it("rejeita fileKey pertencente a outro usuário antes de acessar o storage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildAttachmentBlock(
      {
        url: "https://example.com/file.txt",
        fileKey: "quotations/99/secret.txt",
        mimeType: "text/plain",
        name: "secret.txt",
      },
      42,
    );

    expect(result).toBeNull();
    expect(mockedStorageGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha de forma segura quando fileKey não é informado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildAttachmentBlock(
      {
        url: "https://example.com/legacy.txt",
        mimeType: "text/plain",
        name: "legacy.txt",
      },
      42,
    );

    expect(result).toBeNull();
    expect(mockedStorageGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("anexo que não pôde ser lido", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("avisa o modelo em vez de seguir como se o arquivo tivesse vindo", async () => {
    // chave de OUTRO usuário: rejeitada antes de qualquer download
    const out = await applyAttachmentToMessages(
      [{ role: "user", content: "calcula essa cotação" }],
      { url: "", fileKey: "quotations/99/x.png", mimeType: "image/png", name: "print.png" },
      42,
    );
    expect(out[0].content).toContain("calcula essa cotação");
    expect(out[0].content).toContain('"print.png" NÃO pôde ser lido');
  });
});
