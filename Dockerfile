# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy dependency files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN pnpm build

# Production stage
FROM node:18-alpine

WORKDIR /app

LABEL maintainer="SUPPLEY AI Bot"
LABEL description="Independent AI-powered supply chain optimization system"

# Install pnpm in production image
RUN npm install -g pnpm@10

# Copy package.json for production dependencies
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Health check to monitor container health
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Set default environment
ENV NODE_ENV=production
ENV PORT=3000

# Start application
CMD ["node", "dist/index.js"]
