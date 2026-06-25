#!/bin/bash
# ============================================================
# redeploy.sh — Re-deploy idempotente da SUPPLEY AI Bot
# ============================================================
# Atualiza o código da branch atual e reconstrói os containers
# com SEGURANÇA, contornando o bug do docker-compose 1.29.2
# (ContainerConfig KeyError / container órfão que causa 502).
#
# Uso no SERVIDOR de produção:
#   ./redeploy.sh
#
# O que faz:
#   1) git pull da branch atualmente em checkout
#   2) remove containers órfãos (workaround do bug 1.29.2)
#   3) docker-compose up -d --build (reconstrói app + db)
#   4) health check do app
#
# NÃO aplica migrações automaticamente: migrações de banco
# devem ser revisadas e aplicadas manualmente (ver DEPLOYMENT_GUIDE.md).
# ============================================================

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}ℹ${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

APP_CONTAINER="suppley-ai-bot"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        SUPPLEY AI BOT — RE-DEPLOY IDEMPOTENTE             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Pré-requisitos
command -v docker &> /dev/null || { err "Docker não encontrado"; exit 1; }
command -v docker-compose &> /dev/null || { err "docker-compose não encontrado"; exit 1; }
[ -f .env ] || { err ".env não encontrado — crie a partir de .env.example"; exit 1; }
ok "Pré-requisitos OK"
echo ""

# Passo 1 — atualizar o código da branch atual
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Atualizando código da branch: ${BRANCH}"
git pull origin "${BRANCH}"
ok "Código atualizado"
echo ""

# Passo 2 — workaround do bug docker-compose 1.29.2 (container órfão -> 502)
log "Removendo container órfão (workaround bug 1.29.2)..."
docker rm -f "${APP_CONTAINER}" 2>/dev/null || true
# remove também eventuais órfãos com prefixo de hash (ex.: 52b30be09bbb_suppley-ai-bot)
docker ps -a --format '{{.Names}}' | grep -E "_${APP_CONTAINER}\$" | xargs -r docker rm -f 2>/dev/null || true
ok "Órfãos removidos"
echo ""

# Passo 3 — rebuild + up
log "Reconstruindo e subindo os serviços..."
docker-compose up -d --build --remove-orphans
ok "Serviços no ar"
echo ""

# Passo 4 — health check
log "Verificando saúde do app (até 60s)..."
attempts=0; max=12
while [ $attempts -lt $max ]; do
  if docker exec "${APP_CONTAINER}" node -e "require('http').get('http://localhost:3000',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" 2>/dev/null; then
    ok "App respondendo (HTTP 200)"
    break
  fi
  attempts=$((attempts+1))
  warn "Aguardando o app... ($attempts/$max)"
  sleep 5
done

if [ $attempts -eq $max ]; then
  err "App não respondeu a tempo. Últimos logs:"
  docker-compose logs --tail 40 app
  exit 1
fi
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ RE-DEPLOY CONCLUÍDO                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
docker-compose ps
echo ""
warn "Lembrete: se houver migração de banco pendente, aplique manualmente."
warn "Ver DEPLOYMENT_GUIDE.md (esta atualização do câmbio NÃO precisa de migração)."
