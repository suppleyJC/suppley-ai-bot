# Multi-stage build para segurança + tamanho mínimo

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY pnpm-lock.yaml package.json ./

# Instalar pnpm + dependências
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod

# Copiar código
COPY . .

# Build (incluindo frontend Vite)
RUN pnpm build

# Stage 2: Runtime (mínimo)
FROM node:20-alpine

WORKDIR /app

# Instalar dumb-init para gerenciamento de signals
RUN apk add --no-cache dumb-init curl

# User não-root por segurança (criado antes das cópias para usar COPY --chown)
RUN addgroup -g 1337 app && \
    adduser -D -u 1337 -G app app

# Copiar apenas o necessário do builder, já com o dono correto
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/package.json ./

# Variáveis de ambiente padrão
ENV NODE_ENV=production \
    PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

USER app

EXPOSE 3000

# Usar dumb-init para gerenciar signals corretamente
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
