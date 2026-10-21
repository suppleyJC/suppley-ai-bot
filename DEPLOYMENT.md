# DEPLOYMENT — Guia de Produção

## Índice

1. [Checklist Pré-Deploy](#checklist-pré-deploy)
2. [Build para Produção](#build-para-produção)
3. [Docker (Containerização)](#docker-containerização)
4. [GitHub Actions (CI/CD)](#github-actions-cicd)
5. [Configuração de Servidor](#configuração-de-servidor)
6. [Monitoring & Logs](#monitoring--logs)

---

## Checklist Pré-Deploy

### Segurança ✅

- [ ] `JWT_SECRET` é uma string aleatória forte (não valor padrão)
  ```bash
  openssl rand -base64 32  # Gerar novo
  ```
- [ ] `DATABASE_URL` não contém credenciais padrão/fracas
- [ ] OAuth `OWNER_OPEN_ID` está documentado ou removido
- [ ] HTTPS está habilitado (reverse proxy com SSL)
- [ ] CORS está configurado para origem correta:
  ```typescript
  // server/_core/index.ts
  app.use(cors({
    origin: "https://seu-dominio.com"
  }));
  ```

### Performance ✅

- [ ] `NODE_ENV=production` em `.env`
- [ ] Database tem índices em chaves estrangeiras:
  ```bash
  pnpm db:push --force
  ```
- [ ] Build otimizado rodou: `pnpm build`
  - Arquivo `dist/` contém client + server minificados

### Testes ✅

- [ ] Todos os testes passam:
  ```bash
  pnpm test
  pnpm check
  ```
- [ ] Build local testado:
  ```bash
  pnpm build
  NODE_ENV=production node dist/index.js
  # Deve abrir em http://localhost:3000
  ```
- [ ] Login funciona com email/password
- [ ] Pelo menos um RFQ completo foi criado e testado

### Versionamento ✅

- [ ] Tag git criada:
  ```bash
  git tag -a v2.0.0 -m "Migrate from Manus to independent"
  git push origin v2.0.0
  ```
- [ ] CHANGELOG.md atualizado com mudanças

---

## Build para Produção

### Local Build Test

```bash
# Limpar build anterior
rm -rf dist/

# Compilar tudo
pnpm build

# Testar localmente
NODE_ENV=production node dist/index.js
```

Esperado:
```
Server running on http://localhost:3000/
```

### Arquivos Gerados

```
dist/
├── public/              # Assets estáticos (React, CSS)
├── index.js             # Servidor Node.js bundled
└── index.js.map         # Source maps (opcional)
```

### Otimizações

**vite.config.ts** já inclui:
- Minificação automática
- Tree-shaking de código não usado
- Splitting de chunks
- Asset inlining para pequenos arquivos

**server build** (esbuild) já inclui:
- Bundling de módulos
- Sourcemaps para debugging
- Otimização ESM

---

## Docker (Containerização)

### Dockerfile (Criar na raiz)

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy source
COPY . .

# Install dependencies (lock file is committed)
RUN pnpm install --frozen-lockfile

# Build application
RUN pnpm build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create .env in production (will be overridden)
RUN echo "NODE_ENV=production" > .env

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "dist/index.js"]
```

### docker-compose.yml (Orquestração)

```yaml
version: '3.9'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: mysql://suppley:${DB_PASSWORD}@db:3306/suppley_calc
      JWT_SECRET: ${JWT_SECRET}
      PORT: 3000
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - suppley-network

  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: suppley_calc
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_USER: suppley
      MYSQL_PASSWORD: ${DB_PASSWORD}
    ports:
      - "3306:3306"
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - suppley-network

volumes:
  db-data:

networks:
  suppley-network:
```

### Build & Test Local

```bash
# Build image
docker build -t suppley-ai-bot:latest .

# Test container
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://root:pass@host.docker.internal:3306/suppley_calc" \
  -e JWT_SECRET="test-secret" \
  suppley-ai-bot:latest

# Ou usar docker-compose
docker-compose up
```

### Push para Registry

```bash
# GitHub Container Registry (ghcr.io)
docker tag suppley-ai-bot:latest ghcr.io/suppleyjc/suppley-ai-bot:latest
docker login ghcr.io
docker push ghcr.io/suppleyjc/suppley-ai-bot:latest

# DockerHub
docker tag suppley-ai-bot:latest suppleyjc/suppley-ai-bot:latest
docker push suppleyjc/suppley-ai-bot:latest
```

---

## GitHub Actions (CI/CD)

### Arquivo: `.github/workflows/deploy.yml`

```yaml
name: Build & Deploy

on:
  push:
    branches: [main, production]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_DATABASE: suppley_calc
          MYSQL_ROOT_PASSWORD: testpass
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 10

      - name: Get pnpm store directory
        id: pnpm-cache
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v3
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm check

      - name: Run tests
        run: pnpm test
        env:
          DATABASE_URL: mysql://root:testpass@localhost:3306/suppley_calc

      - name: Build
        run: pnpm build

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/production'

    steps:
      - uses: actions/checkout@v4

      - name: Download artifacts
        uses: actions/download-artifact@v3
        with:
          name: dist

      - name: Deploy to production
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        run: |
          mkdir -p ~/.ssh
          echo "$DEPLOY_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H $DEPLOY_HOST >> ~/.ssh/known_hosts
          
          scp -i ~/.ssh/deploy_key -r dist/ \
            $DEPLOY_USER@$DEPLOY_HOST:/opt/suppley-ai-bot/
          
          ssh -i ~/.ssh/deploy_key $DEPLOY_USER@$DEPLOY_HOST \
            'cd /opt/suppley-ai-bot && \
             docker-compose down && \
             docker-compose up -d'
```

### Configurar Secrets no GitHub

Em: `Settings → Secrets and variables → Actions`

```
DEPLOY_KEY          → Chave SSH privada (cat ~/.ssh/id_rsa)
DEPLOY_HOST         → IP ou domínio do servidor
DEPLOY_USER         → Usuário SSH
```

---

## Configuração de Servidor

### Exemplo: DigitalOcean Droplet / Linode / AWS EC2

#### 1. Provisionar Servidor (Ubuntu 22.04)

```bash
# SSH para servidor
ssh root@seu-ip

# Atualizar pacotes
apt update && apt upgrade -y

# Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

# Instalar pnpm
npm install -g pnpm

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Instalar Docker Compose
apt install -y docker-compose

# Criar usuário não-root
useradd -m -s /bin/bash suppley
usermod -aG docker suppley
su - suppley
```

#### 2. Clonar Repositório

```bash
cd /opt
git clone https://github.com/suppleyjc/suppley-ai-bot.git
cd suppley-ai-bot
```

#### 3. Configurar Variáveis de Produção

```bash
# Criar .env com valores reais
cat > .env << EOF
NODE_ENV=production
DATABASE_URL=mysql://suppley:${SECURE_PASSWORD}@localhost:3306/suppley_calc
JWT_SECRET=$(openssl rand -base64 32)
PORT=3000
EOF

chmod 600 .env
```

#### 4. Iniciar com Docker Compose

```bash
docker-compose up -d

# Verificar status
docker-compose logs app

# Testar
curl http://localhost:3000
```

#### 5. Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/suppley

server {
    listen 80;
    server_name seu-dominio.com;

    # Redirecionar HTTP para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    # SSL (usando Let's Encrypt / Certbot)
    ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Uploads de proforma/anexo (o padrão de 1MB devolve 413 em HTML)
    client_max_body_size 25m;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Extração por IA de arquivos grandes pode passar de 60s (padrão → 504)
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
# Habilitar site
sudo ln -s /etc/nginx/sites-available/suppley /etc/nginx/sites-enabled/

# SSL com Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d seu-dominio.com

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## Monitoring & Logs

### Logs da Aplicação

```bash
# Tempo real
docker-compose logs -f app

# Últimas 100 linhas
docker-compose logs --tail 100 app

# Logs do banco
docker-compose logs db
```

### Health Checks

```bash
# API is up
curl https://seu-dominio.com/api/health

# Database connected
curl https://seu-dominio.com/api/db-status
```

### Monitoring com PM2 (Alternativa ao Docker)

```bash
# Instalar PM2
npm install -g pm2

# Configurar app (ecosystem.config.js)
module.exports = {
  apps: [{
    name: "suppley-api",
    script: "./dist/index.js",
    instances: "max",
    exec_mode: "cluster",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "mysql://...",
      JWT_SECRET: "..."
    },
    error_file: "./logs/error.log",
    out_file: "./logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
};

# Iniciar
pm2 start ecosystem.config.js
pm2 startup
pm2 save

# Monitorar
pm2 monit
pm2 logs
```

### Alertas (Recomendado)

Use serviços como:
- **Sentry** — Erro tracking
- **DataDog** — Full monitoring
- **Uptime Robot** — Health checks
- **New Relic** — Performance APM

---

## Troubleshooting Produção

### App não inicia após deploy

```bash
# Verificar logs
docker-compose logs app

# Verificar variáveis
cat .env

# Testar banco localmente
mysql -h localhost -u suppley -p suppley_calc
```

### Database connection timeout

```bash
# Reiniciar MySQL
docker-compose restart db

# Verificar credenciais .env
docker-compose exec db mysql -u root -p -e "SHOW DATABASES;"
```

### Memória insuficiente

```bash
# Aumentar swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Limitar Docker
# docker-compose.yml → add "mem_limit: 1gb"
```

---

## Rollback

```bash
# Ver histórico de tags
git tag -l

# Fazer checkout de versão anterior
git checkout v1.9.0

# Rebuildar e deploy
docker-compose down
docker-compose up -d
```

---

## Maintenance

### Backup Diário

```bash
#!/bin/bash
# backup.sh
mysqldump -h localhost -u suppley -p suppley_calc | \
  gzip > /backups/suppley_$(date +%Y%m%d).sql.gz

# Agendar com cron (crontab -e)
0 2 * * * /opt/suppley-ai-bot/backup.sh
```

### Updates de Dependências

```bash
# Verificar updates
pnpm outdated

# Update seguro
pnpm update

# Rebuild e test
pnpm build
pnpm test

# Commit e deploy
git add .
git commit -m "chore: dependency updates"
git push
```

---

## Dashboard de Produção

Recomendado implementar:
- ✅ Real-time database metrics
- ✅ Request latency tracking
- ✅ Error rate monitoring
- ✅ User activity logs
- ✅ API rate limiting stats

Serviços: Grafana + Prometheus, DataDog, New Relic, etc.

---

**Status:** ✅ Pronto para produção
