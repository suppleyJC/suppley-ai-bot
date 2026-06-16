# 🚀 Deploy SUPPLEY AI Bot — Stack Completa

**Status:** ✅ Pronto para deploy  
**Data:** 16 de junho de 2026  
**Ambiente:** DigitalOcean (165.245.234.254)  
**URL:** https://calculasuppley.com.br

---

## 📋 Checklist Pré-Deploy

### Servidor (DigitalOcean)
- [ ] SSH access confirmado: `ssh root@165.245.234.254`
- [ ] Docker instalado: `docker --version`
- [ ] Docker Compose instalado: `docker-compose --version`
- [ ] MySQL não está rodando em porta 3306 (vamos usar Docker)
- [ ] Ports 3000 e 3306 livres

### Secrets & Credenciais
- [ ] `.env.production` pronto no servidor com:
  - `JWT_SECRET` (secret strong, min 32 chars)
  - `ANTHROPIC_API_KEY` (válida e com quota)
  - `DATABASE_URL` (MySQL connection string)
  - `VITE_APP_ID` (pode ser "suppley")
- [ ] Nginx proxy configurado apontando para `localhost:3000`
- [ ] SSL/TLS certificado (Let's Encrypt) para `calculasuppley.com.br`

### Repositório
- [ ] Branch `claude/manus-migration-independent-1kfrll` possui todos os commits
- [ ] Build local passou: `pnpm check && pnpm build`
- [ ] Imagem Docker criada: `docker build -t suppley-app:latest .`

---

## 🔧 Passo a Passo: Deploy Rápido (30 min)

### 1️⃣ SSH no servidor
```bash
ssh root@165.245.234.254
cd /opt/suppley/suppley-ai-bot
```

### 2️⃣ Preparar repositório (primeira vez)
```bash
git clone -b claude/manus-migration-independent-1kfrll \
  https://github.com/suppleyjc/suppley-ai-bot.git .

# Ou atualizar (se já existe)
git fetch origin claude/manus-migration-independent-1kfrll
git checkout claude/manus-migration-independent-1kfrll
git pull
```

### 3️⃣ Preparar .env
```bash
# Criar a partir do exemplo
cp .env.example .env.production

# Editar com credenciais reais
nano .env.production

# Variáveis OBRIGATÓRIAS:
# - DATABASE_URL (MySQL connection)
# - JWT_SECRET (secret forte)
# - ANTHROPIC_API_KEY (API key válida)
```

### 4️⃣ Build Docker
```bash
docker build -t suppley-app:latest .

# Verificar
docker images suppley-app
```

### 5️⃣ Deploy com Docker Compose
```bash
# Carregar .env
export $(cat .env.production | xargs)

# Iniciar serviços
docker-compose -f docker-compose.prod.yml up -d

# Verificar logs
docker-compose -f docker-compose.prod.yml logs -f app

# Aguardar ~30s para app iniciar
sleep 10
curl http://localhost:3000/health
```

### 6️⃣ Testar aplicação
```bash
# Health check
curl https://calculasuppley.com.br/health

# Tentar login (via web ou curl)
# Se ver login page → sucesso!
```

### 7️⃣ (Opcional) Automatizar com script
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh production

# Ou manual:
./scripts/deploy.sh
```

---

## 📊 O que foi implementado (Etapas A-D)

### ✅ Etapa A: Motor V2 (Cálculo Certificado)
- `server/services/motor-v2-adapter.ts`: converte entrada legada → Motor V2
- Endpoint `calculations.calculate` usa Motor V2 (fallback ao legado se falhar)
- Certificado: paridade ao centavo com planilha do contador
- TTD 409, LC 224/2025, multi-regime support

**Commit:** `14459bd`

### ✅ Etapa B: Entidade Operações (Espinha Dorsal)
- Tabelas: `operacoes`, `operacao_eventos`, `operacao_estagios`
- Service: `server/services/operacaoService.ts` (pronto)
- Router: `server/routers/operationsRouter.ts` (pronto)
- Endpoints: list, get, create, advanceStage, linkQuotation, decideGoNoGo, addEvento

**Status:** Já implementada no código base

### ✅ Etapa C: IA Anthropic (Independência de Infraestrutura)
- De Forge/Manus → Anthropic Claude
- Mesma assinatura (`invokeLLM`) — compatível com:
  - Excambia (IA chat)
  - PDF extraction
  - Análise preditiva
  - Agentes

**Commit:** `dc9ac00`

### ✅ Etapa D: CI/CD + Docker + Observabilidade
- `.github/workflows/test-build.yml`: type check + build automático
- `Dockerfile`: multi-stage, seguro, user não-root
- `docker-compose.prod.yml`: MySQL + app com health checks
- `scripts/deploy.sh`: automação de deploy
- `server/_core/logger.ts`: logs estruturados (JSON em prod)

**Commit:** `e6eb9be`

---

## 🛠️ Troubleshooting

### Erro: "ANTHROPIC_API_KEY not configured"
```bash
# Verificar se está em .env.production
grep ANTHROPIC_API_KEY .env.production

# Se não estiver, adicionar:
echo "ANTHROPIC_API_KEY=sk-ant-xxx" >> .env.production
```

### Erro: "Cannot connect to database"
```bash
# Verificar MySQL container
docker-compose -f docker-compose.prod.yml ps

# Verificar logs MySQL
docker-compose -f docker-compose.prod.yml logs mysql

# Reconectar
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

### App inicia mas não responde
```bash
# Verificar logs
docker-compose -f docker-compose.prod.yml logs app

# Health check manual
curl -v http://localhost:3000/health

# Se MySQL não está pronto, aguardar 30s
sleep 30
curl http://localhost:3000/health
```

### Build Docker falha
```bash
# Limpar cache
docker builder prune

# Rebuild sem cache
docker build --no-cache -t suppley-app:latest .

# Verificar logs de build
docker build -t suppley-app:latest . 2>&1 | tail -50
```

---

## 📈 Próximas Etapas (Opcional)

1. **Dados de Mercado** — integrar Comex Stat
2. **Ciclo de Aprendizado** — registrar cálculos + confirmação
3. **Inteligência de Mercado** — análise preditiva ligada a dados
4. **Captação de Eventos** — tracking de embarque, DI, etc.

---

## 📞 Support

- **Logs locais:** `docker-compose -f docker-compose.prod.yml logs -f`
- **Verificar health:** `curl https://calculasuppley.com.br/health`
- **Parar tudo:** `docker-compose -f docker-compose.prod.yml down`
- **Remover dados:** `docker-compose -f docker-compose.prod.yml down -v`

---

**Deploy bem-sucedido quando:**
✅ `docker-compose ps` mostra 2 containers (mysql, app) com status "Up"  
✅ `curl https://calculasuppley.com.br` retorna HTML da página de login  
✅ Conseguir fazer login com credenciais de teste

Boa sorte! 🚀
