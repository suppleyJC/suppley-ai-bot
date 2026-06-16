#!/bin/bash

# Script de deploy para DigitalOcean
# Uso: ./scripts/deploy.sh [staging|production]

set -e

ENVIRONMENT="${1:-production}"
REPO_URL="https://github.com/suppleyjc/suppley-ai-bot.git"
BRANCH="claude/manus-migration-independent-1kfrll"
APP_DIR="/opt/suppley/suppley-ai-bot"
PM2_NAME="suppley-app"

echo "🚀 Iniciando deploy para $ENVIRONMENT"

# 1. Preparar diretório
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# 2. Clonar/atualizar repo
if [ -d .git ]; then
    echo "📦 Atualizando repositório..."
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    echo "📦 Clonando repositório..."
    git clone -b "$BRANCH" "$REPO_URL" .
fi

# 3. Build com Docker
echo "🔨 Fazendo build..."
docker build -t suppley-app:latest .

# 4. Carregar .env (deve existir no servidor)
if [ -f .env.production ]; then
    cp .env.production .env
else
    echo "❌ Erro: arquivo .env.production não encontrado"
    exit 1
fi

# 5. Parar container anterior
echo "🛑 Parando container anterior..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

# 6. Iniciar containers
echo "▶️  Iniciando containers..."
docker-compose -f docker-compose.prod.yml up -d

# 7. Aguardar health check
echo "⏳ Aguardando aplicação iniciar..."
for i in {1..30}; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Aplicação online!"
        break
    fi
    echo "Tentativa $i/30..."
    sleep 2
done

# 8. Verificar status
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "🎉 Deploy bem-sucedido!"
    echo "📍 URL: https://calculasuppley.com.br"
    exit 0
else
    echo "❌ Health check falhou"
    docker-compose -f docker-compose.prod.yml logs app
    exit 1
fi
