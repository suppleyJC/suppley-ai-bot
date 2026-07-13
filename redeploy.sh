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
DB_CONTAINER="suppley-mysql"

# Migrações IDEMPOTENTES (seguras para re-rodar a cada deploy).
# NÃO inclua migrações com ALTER ... ADD INDEX/COLUMN sem guarda
# (ex.: 0026) — elas quebram na segunda execução.
IDEMPOTENT_MIGRATIONS=(
  "drizzle/0025_sprint1_proformas.sql"
  "drizzle/0027_add_quotation_date_to_proformas.sql"
  "drizzle/0028_widen_product_name_columns.sql"
  "drizzle/0029_add_description_to_proforma_items.sql"
  "drizzle/0030_add_classification_to_products.sql"
  "drizzle/0036_admin_role.sql"
  "drizzle/0037_proforma_supplier_sector.sql"
  "drizzle/0038_supplier_ratings.sql"
  "drizzle/0039_rfq_outreach_quotes.sql"
  "drizzle/0040_proforma_file_key_optional_price.sql"
  "drizzle/0041_widen_proforma_file_url.sql"
  "drizzle/0042_decimal_quantity.sql"
  "drizzle/0043_marco_responsavel_vencimento.sql"
)

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

# Passo 3b — aplicar migrações idempotentes (evita "Data too long" / tabela ausente)
log "Aplicando migrações idempotentes..."
# Credenciais reais do app: lê do .env (mesmos defaults do docker-compose.yml).
DB_USER="$(grep -E '^DB_USER=' .env 2>/dev/null | cut -d= -f2-)"; DB_USER="${DB_USER:-suppley}"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' .env 2>/dev/null | cut -d= -f2-)"; DB_PASSWORD="${DB_PASSWORD:-changeme}"
DB_NAME="$(grep -E '^DB_NAME=' .env 2>/dev/null | cut -d= -f2-)"; DB_NAME="${DB_NAME:-suppley_calc}"

MIG_FALHOU=0
for mig in "${IDEMPOTENT_MIGRATIONS[@]}"; do
  if [ -f "$mig" ]; then
    # NÃO engolir o stderr: sem o motivo, uma migração que falha passa
    # despercebida e o app novo sobe contra um banco velho (schema drift).
    mig_out="$(docker exec -i "${DB_CONTAINER}" mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "$mig" 2>&1)"
    if [ $? -eq 0 ]; then
      ok "  aplicada: $mig"
    else
      MIG_FALHOU=1
      err "  FALHOU: $mig"
      err "  motivo: $(echo "$mig_out" | grep -v 'Using a password' | head -3)"
    fi
  else
    warn "  ausente: $mig"
  fi
done
echo ""

# Passo 3c — verificação de SCHEMA: colunas críticas que o código atual exige.
# Se faltar alguma, o deploy é interrompido ANTES de parecer saudável.
log "Verificando colunas críticas do schema..."
CRITICAL_COLUMNS=(
  "proformas fileKey"
  "operacoes modo"
)
SCHEMA_OK=1
for par in "${CRITICAL_COLUMNS[@]}"; do
  tbl="${par%% *}"; col="${par##* }"
  found="$(docker exec -i "${DB_CONTAINER}" mysql -N -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" \
    -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='${tbl}' AND COLUMN_NAME='${col}';" 2>/dev/null | tail -1)"
  if [ "${found}" = "1" ]; then
    ok "  ${tbl}.${col} OK"
  else
    SCHEMA_OK=0
    err "  AUSENTE: ${tbl}.${col} — o app vai falhar ao gravar nessa tabela"
  fi
done
if [ "${SCHEMA_OK}" -ne 1 ] || [ "${MIG_FALHOU}" -ne 0 ]; then
  err "Schema desatualizado ou migração com falha — corrija antes de usar o app."
  err "Reaplique manualmente, ex.: docker exec -i ${DB_CONTAINER} mysql -u ${DB_USER} -p'<senha>' ${DB_NAME} < drizzle/0040_proforma_file_key_optional_price.sql"
  exit 1
fi
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

# Passo 5 — limpeza de imagens órfãs (evita o disco encher a cada rebuild)
# Só roda APÓS o health check passar: se o deploy falhasse, preservaríamos a
# imagem anterior para rollback. Remove só imagens SEM container (o -a); NÃO
# toca em volumes (o banco fica intacto).
log "Limpando imagens Docker não utilizadas (libera disco)..."
BEFORE="$(docker system df --format '{{.Type}} {{.Reclaimable}}' 2>/dev/null | grep -i '^Images' || true)"
docker image prune -af >/dev/null 2>&1 || warn "prune de imagens falhou (siga mesmo assim)"
docker builder prune -f >/dev/null 2>&1 || true
ok "Imagens antigas removidas"
df -h / | awk 'NR==1 || /\/$/ {print "  " $0}'
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ RE-DEPLOY CONCLUÍDO                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
docker-compose ps
echo ""
warn "Lembrete: se houver migração de banco pendente, aplique manualmente."
warn "Ver DEPLOYMENT_GUIDE.md (esta atualização do câmbio NÃO precisa de migração)."
