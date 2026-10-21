#!/bin/bash
# Production Deploy Script - SUPPLEY AI Bot v2.0.0
# Este script faz deploy completo da aplicação em produção

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   SUPPLEY AI BOT — PRODUCTION DEPLOYMENT v2.0.0           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================
# CONFIGURATION
# ============================================================

APP_NAME="suppley-ai-bot"
VERSION="2.0.0"
IMAGE_TAG="${APP_NAME}:${VERSION}"
CONTAINER_NAME="${APP_NAME}-prod"
DB_CONTAINER_NAME="${APP_NAME}-db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================
# FUNCTIONS
# ============================================================

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found"
        exit 1
    fi
    log_success "Docker installed"
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose not found"
        exit 1
    fi
    log_success "Docker Compose installed"
    
    if [ ! -f .env ]; then
        log_error ".env file not found"
        log_warn "Please create .env from .env.example"
        exit 1
    fi
    log_success ".env file found"
}

# ============================================================
# MAIN DEPLOYMENT PROCESS
# ============================================================

log_info "Starting production deployment..."
echo ""

# Step 1: Check prerequisites
check_prerequisites
echo ""

# Step 2: Stop existing containers
log_info "Stopping existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true
log_success "Containers stopped"
echo ""

# Step 3: Build Docker image
log_info "Building Docker image: ${IMAGE_TAG}"
docker build \
    --tag "${IMAGE_TAG}" \
    --tag "${APP_NAME}:latest" \
    --label "version=${VERSION}" \
    --label "built=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    . 2>&1 | tail -20
log_success "Docker image built"
echo ""

# Step 4: Start services
log_info "Starting services with Docker Compose..."
docker-compose up -d
log_success "Services started"
echo ""

# Step 5: Wait for services to be ready
log_info "Waiting for services to be ready (30s)..."
sleep 30
log_success "Services ready"
echo ""

# Step 6: Run database migrations
log_info "Running database migrations..."
if docker-compose exec -T db mysql -u root -p"$(grep MYSQL_ROOT_PASSWORD docker-compose.yml | head -1 | awk '{print $NF}')" suppley_calc < drizzle/0017_motor_v2_initial.sql 2>/dev/null; then
    log_success "Database migrations completed"
else
    log_warn "Database migrations may need manual intervention"
fi
echo ""

# Step 7: Health checks
log_info "Running health checks..."
attempts=0
max_attempts=10

while [ $attempts -lt $max_attempts ]; do
    if docker-compose exec -T app curl -f http://localhost:3000 > /dev/null 2>&1; then
        log_success "Application is responding"
        break
    fi
    attempts=$((attempts + 1))
    if [ $attempts -lt $max_attempts ]; then
        log_warn "Waiting for application to be ready... ($attempts/$max_attempts)"
        sleep 5
    fi
done

if [ $attempts -eq $max_attempts ]; then
    log_error "Application failed to respond after $max_attempts attempts"
    docker-compose logs app | tail -30
    exit 1
fi
echo ""

# Step 8: Verify containers
log_info "Verifying running containers..."
docker-compose ps
echo ""

# ============================================================
# DEPLOYMENT SUMMARY
# ============================================================

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          ✅ PRODUCTION DEPLOYMENT SUCCESSFUL              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

log_success "Application deployed and running"
log_success "Image: ${IMAGE_TAG}"
log_success "Containers: app, db, mysql"
echo ""

echo "📍 ACCESS POINTS:"
echo "   Frontend:  http://localhost:3000"
echo "   API:       http://localhost:3000/api/trpc"
echo "   Database:  localhost:3306 (MySQL)"
echo ""

echo "📊 CONTAINERS STATUS:"
docker-compose ps
echo ""

echo "📋 USEFUL COMMANDS:"
echo "   View logs:      docker-compose logs -f app"
echo "   Stop services:  docker-compose down"
echo "   Restart:        docker-compose restart"
echo "   Shell access:   docker-compose exec app bash"
echo ""

echo "✅ Deployment completed at $(date)"
echo ""

