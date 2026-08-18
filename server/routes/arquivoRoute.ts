/**
 * ROTA DE ARQUIVO — link ESTÁVEL para arquivos gerados pela Excambia.
 *
 * O problema que ela resolve: a URL pré-assinada do S3 vale 1 hora, mas o link
 * vai dentro de uma MENSAGEM DE CHAT, que fica no histórico para sempre. Passada
 * a hora, clicar no link devolvia um XML cru de AccessDenied — e o usuário não
 * tem como saber que o arquivo continua lá, íntegro, só com a assinatura velha.
 *
 * Aqui o link entregue no chat aponta para a aplicação, não para o S3. A cada
 * clique a URL do S3 é assinada NA HORA e o navegador é redirecionado. O arquivo
 * é o mesmo; o que deixa de expirar é o caminho até ele.
 *
 * O token é um JWT assinado que carrega a chave do arquivo — sem ele não há como
 * adivinhar ou enumerar chaves alheias. Segue o mesmo modelo de acesso da URL
 * pré-assinada que substitui (quem tem o link, baixa), o que preserva o uso real
 * de mandar a planilha para o cliente ou o contador; a diferença é que agora o
 * link não morre no meio da conversa.
 */
import { Router, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { storageGet } from "../storage";
import { ENV } from "../_core/env";

const router = Router();

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "suppley-calc-secret-key-2024",
);

/** Assinatura curta do S3: o redirect é usado na hora, não precisa durar. */
const TTL_ASSINATURA_S3 = 300;

interface TokenArquivo {
  /** Chave PERMANENTE no storage. */
  k: string;
  /** Nome amigável para o download. */
  n?: string;
  /** Dono — registrado para auditoria e para futuras políticas de acesso. */
  u?: number;
}

/**
 * Cria o token de um arquivo já no storage. Sem expiração: o link vive no
 * histórico do chat, e um link que morre sozinho é justamente o defeito que
 * esta rota existe para corrigir.
 */
export async function assinarTokenArquivo(dados: TokenArquivo): Promise<string> {
  return new SignJWT({ k: dados.k, n: dados.n, u: dados.u })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Monta a URL estável a ser entregue no chat.
 *
 * Sem APP_URL configurada o link sai RELATIVO — clicável dentro do chat, que é
 * o caminho principal. Configure APP_URL para que o link também funcione fora
 * do navegador (email ao cliente ou ao contador).
 */
export async function linkEstavelDeArquivo(dados: TokenArquivo): Promise<string> {
  const token = await assinarTokenArquivo(dados);
  return `${ENV.appUrl}/api/arquivo/${token}`;
}

router.get("/api/arquivo/:token", async (req: Request, res: Response) => {
  try {
    const { payload } = await jwtVerify(req.params.token, JWT_SECRET);
    const chave = typeof payload.k === "string" ? payload.k : "";
    if (!chave) {
      res.status(400).send("Link inválido.");
      return;
    }

    const { url } = await storageGet(chave, TTL_ASSINATURA_S3);
    res.redirect(302, url);
  } catch (err) {
    // Token adulterado/ilegível é 404, não 401: não confirmamos a existência de
    // chave nenhuma para quem chegou com um link forjado.
    console.error("[arquivo] falha ao resolver link:", err);
    res.status(404).send("Arquivo não encontrado ou link inválido.");
  }
});

export { router as arquivoRouter };
