# Multi-stage build para segurança + tamanho mínimo

# Stage 1: Build
FROM node:18-alpine AS builder

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
FROM node:18-alpine

WORKDIR /app

# Instalar dumb-init para gerenciamento de signals
RUN apk add --no-cache dumb-init curl

# Copiar apenas o necessário do builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./

# Variáveis de ambiente padrão
ENV NODE_ENV=production \
    PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# User não-root por segurança
RUN addgroup -g 1000 app && \
    adduser -D -u 1000 -G app app && \
    chown -R app:app /app

USER app

EXPOSE 3000

# Usar dumb-init para gerenciar signals corretamente
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
