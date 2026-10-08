/**
 * Variáveis de ambiente lidas de forma PREGUIÇOSA (lazy).
 *
 * Cada propriedade lê `process.env` no momento do acesso, não na carga do
 * módulo. Isso é essencial porque o bundle do esbuild pode inicializar este
 * módulo ANTES de `import "dotenv/config"` ter populado `process.env`. Com
 * getters, a leitura acontece em tempo de uso (request), quando o `.env` já
 * foi carregado.
 */
export const ENV = {
  get appId() { return process.env.VITE_APP_ID ?? ""; },
  get cookieSecret() { return process.env.JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.OAUTH_SERVER_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY ?? ""; },
  /**
   * URL pública da aplicação (ex.: https://calculasuppley.com.br), sem barra
   * final. Usada para montar links ABSOLUTOS de arquivo — necessários quando o
   * link sai do navegador (email ao cliente/contador). Vazia, os links saem
   * relativos, que funcionam normalmente dentro do próprio chat.
   */
  get appUrl() { return (process.env.APP_URL ?? "").replace(/\/+$/, ""); },
  // AWS S3 Storage
  get awsS3Bucket() { return process.env.AWS_S3_BUCKET ?? ""; },
  get awsRegion() { return process.env.AWS_REGION ?? "us-east-1"; },
  get awsAccessKeyId() { return process.env.AWS_ACCESS_KEY_ID ?? ""; },
  get awsSecretAccessKey() { return process.env.AWS_SECRET_ACCESS_KEY ?? ""; },
};
