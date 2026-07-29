#!/bin/bash

# Script de deploy para DigitalOcean
# Uso: ./scripts/deploy.sh [staging|production]

set -e

ENVIRONMENT="${1:-production}"
REPO_URL="https://github.com/suppleyjc/suppley-ai-bot.git"
BRANCH="claude/manus-migration-independent-1kfrll"
APP_DIR="/opt/suppley/suppley-ai-bot"

# Stack única. Já existiu um docker-compose.prod.yml paralelo apontando para
# OUTRO volume de dados (suppley_mysql_data): o deploy subia o app contra um
# banco antigo e a plataforma aparecia vazia. Um compose só, um volume só.
COMPOSE_FILE="docker-compose.yml"

# Serviço de banco e nº mínimo de tabelas esperado — usados na verificação
# pós-deploy que detecta "subiu no banco errado".
DB_CONTAINER="suppley-mysql"
MIN_TABELAS=55

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

# 3. Carregar .env (deve existir no servidor) — antes do build, porque o compose
# lê as variáveis do .env para resolver imagem, senhas e volumes.
if [ ! -f .env.production ]; then
    echo "❌ Erro: arquivo .env.production não encontrado"
    exit 1
fi

# O cp sobrescreve o .env. Variáveis que existam SÓ no .env (credencial posta à
# mão no servidor) sumiriam em silêncio e a funcionalidade quebraria no deploy
# seguinte — foi assim que as chaves do S3 se perderam. Vira erro, listando
# apenas os NOMES das variáveis.
if [ -f .env ]; then
    PERDIDAS=$(comm -23 \
        <(grep -oE '^[A-Z0-9_]+=.+' .env            | cut -d= -f1 | sort -u) \
        <(grep -oE '^[A-Z0-9_]+=.+' .env.production | cut -d= -f1 | sort -u))
    if [ -n "$PERDIDAS" ]; then
        echo "❌ Estas variáveis estão no .env e seriam perdidas ao copiar o .env.production:"
        echo "$PERDIDAS" | sed 's/^/   - /'
        echo "   Leve-as para o .env.production (com valor preenchido) e rode de novo."
        exit 1
    fi
fi

cp .env.production .env

# 4. Build com Docker (pelo compose, para não subir imagem antiga em cache)
echo "🔨 Fazendo build..."
docker-compose -f "$COMPOSE_FILE" build app

# 5. Parar apenas o app — o banco continua de pé, com os dados
echo "🛑 Parando app anterior..."
docker-compose -f "$COMPOSE_FILE" stop app 2>/dev/null || true

# 6. Iniciar containers (NUNCA use "down -v": apaga o volume de dados)
echo "▶️  Iniciando containers..."
docker-compose -f "$COMPOSE_FILE" up -d

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
if ! curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "❌ Health check falhou"
    docker-compose -f "$COMPOSE_FILE" logs app
    exit 1
fi

# 9. Verificar que o app subiu contra o banco COM DADOS.
# O /health não consulta o banco: já houve deploy "verde" com a plataforma
# vazia porque o app foi apontado para outro volume MySQL. Aqui isso aparece.
echo "🔎 Verificando o banco..."
TABELAS=$(docker exec "$DB_CONTAINER" sh -c \
    'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\"$MYSQL_DATABASE\";"' \
    2>/dev/null | tr -d '[:space:]')

if [ -z "$TABELAS" ]; then
    echo "⚠️  Não consegui consultar o banco em '$DB_CONTAINER' — verifique manualmente antes de considerar o deploy concluído."
elif [ "$TABELAS" -lt "$MIN_TABELAS" ]; then
    echo "❌ Banco com apenas $TABELAS tabelas (esperado ≥ $MIN_TABELAS)."
    echo "   Provável volume errado. Confira: docker inspect $DB_CONTAINER --format '{{range .Mounts}}{{.Name}}{{end}}'"
    echo "   O volume de produção é suppley-ai-bot_db-data. NÃO rode 'down -v'."
    exit 1
else
    echo "✅ Banco ok: $TABELAS tabelas"
fi

echo "🎉 Deploy bem-sucedido!"
echo "📍 URL: https://calculasuppley.com.br"
exit 0
