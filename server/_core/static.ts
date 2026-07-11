import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/**
 * Servidor de arquivos estáticos de PRODUÇÃO.
 *
 * Vive em módulo próprio, SEM nenhum import de vite: o vite e seus plugins
 * são devDependencies e não existem na imagem de produção — qualquer import
 * estático deles derruba o app no boot ("Cannot find module 'vite'").
 * O modo dev (setupVite) fica em ./vite.ts, carregado dinamicamente.
 */
export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Cache: assets com hash no nome são imutáveis (cache longo); o index.html
  // NUNCA é cacheado, para que cada deploy seja carregado na hora (sem precisar
  // limpar o cache do navegador). Sem isto, o Safari servia o HTML antigo e
  // mantinha o bundle JS desatualizado mesmo após o deploy.
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
