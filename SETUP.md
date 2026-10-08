# SETUP — Configuração Completa do SUPPLEY AI Bot

## Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Instalação Local](#instalação-local)
3. [Configuração do Banco de Dados](#configuração-do-banco-de-dados)
4. [Configuração de Autenticação](#configuração-de-autenticação)
5. [Desenvolvimento](#desenvolvimento)
6. [Testes](#testes)
7. [Troubleshooting](#troubleshooting)

---

## Pré-requisitos

### Obrigatório

- **Node.js 18+** — [Download](https://nodejs.org/)
- **pnpm 10+** — `npm install -g pnpm`
- **Git** — [Download](https://git-scm.com/)

### Para Desenvolvimento

- **MySQL 8.0+** ou acesso a PlanetScale/Supabase
- **Visual Studio Code** (recomendado) com extensão TypeScript
- **Docker Desktop** (opcional, para MySQL local)

### Conhecimento

- Noções básicas de Node.js/TypeScript
- Familiaridade com Git
- Básico de HTTP/REST APIs

---

## Instalação Local

### 1. Clonar o Repositório

```bash
git clone https://github.com/suppleyjc/suppley-ai-bot.git
cd suppley-ai-bot
```

### 2. Instalar Dependências

```bash
pnpm install
```

Isso vai:
- Baixar todos os pacotes npm
- Instalar ferramentas de desenvolvimento
- Preparar o ambiente

Tempo esperado: 3-5 minutos (primeira execução)

### 3. Configurar Variáveis de Ambiente

```bash
cp .env.example .env
```

Abra `.env` e configure:
- `DATABASE_URL` — string de conexão com MySQL
- `JWT_SECRET` — chave secreta para tokens JWT
- `NODE_ENV` — deixar como `development`
- `PORT` — porta local (padrão: 3000)

Exemplo para MySQL local:
```env
DATABASE_URL=mysql://root:password@localhost:3306/suppley_calc
JWT_SECRET=dev-secret-change-in-production
NODE_ENV=development
PORT=3000
```

### 4. Validação Pré-Setup

```bash
pnpm check
```

Isso valida se o TypeScript compila sem erros.

---

## Configuração do Banco de Dados

### Opção A: MySQL Local com Docker (⭐ Recomendado)

**Passo 1:** Iniciar container MySQL

```bash
docker run -d \
  --name suppley-mysql \
  -e MYSQL_ROOT_PASSWORD=suppley123 \
  -e MYSQL_DATABASE=suppley_calc \
  -p 3306:3306 \
  mysql:8.0 \
  --default-authentication-plugin=mysql_native_password
```

**Passo 2:** Aguardar inicialização (10-20 segundos)

```bash
# Verificar se está rodando
docker logs suppley-mysql | grep "ready for connections"
```

**Passo 3:** Configurar `.env`

```env
DATABASE_URL=mysql://root:suppley123@localhost:3306/suppley_calc
```

**Passo 4:** Criar schema

```bash
pnpm db:push
```

Esperado:
```
✓ Generated migration
✓ Running migrations
✓ All migrations completed successfully
```

**Parar o container:**
```bash
docker stop suppley-mysql
docker rm suppley-mysql
```

### Opção B: PlanetScale (Nuvem MySQL)

**Passo 1:** Criar conta grátis em [planetscale.com](https://planetscale.com)

**Passo 2:** Criar um novo database
- Nome sugerido: `suppley-calc`
- Region: Escolher próxima ao seu local

**Passo 3:** Obter connection string
- Dashboard → Seu database → Connect
- Copiar URL do tipo: `mysql://user:password@aws.connect.psdb.cloud/suppley_calc?sslaccept=strict`

**Passo 4:** Configurar `.env`

```env
DATABASE_URL=mysql://user:password@aws.connect.psdb.cloud/suppley_calc?sslaccept=strict
```

**Passo 5:** Criar schema

```bash
pnpm db:push
```

### Opção C: Supabase (PostgreSQL)

⚠️ **Nota:** Requer alterações no código, pois projeto está configurado para MySQL.

Para usar PostgreSQL:

1. Editar `drizzle.config.ts`:
```typescript
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  driver: "pg", // Mudar para PostgreSQL
  dbCredentials: {
    connectionString: env.DATABASE_URL,
  },
});
```

2. Editar `server/db/config.ts`:
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
// ... resto do setup para PostgreSQL
```

3. Reinstalar dependências:
```bash
pnpm install
pnpm db:push
```

---

## Configuração de Autenticação

### Modo 1: Autenticação Local (Padrão)

Funciona out-of-the-box. Usuários fazem login com email/password.

**Usuário teste (após `pnpm db:push`):**
```
Email: test@example.com
Password: TestPassword123!
```

Para criar novo usuário:
1. Clique em "Sign Up" na tela de login
2. Digite email e crie uma senha
3. Sistema valida email e cria conta

**Segurança:**
- Senhas são hasheadas com bcryptjs
- JWT tokens têm validade limitada
- Tokens armazenados em cookies seguros (HttpOnly)

### Modo 2: OAuth Manus (Opcional)

Se quer manter integração com Manus OAuth:

**Passo 1:** Configurar `.env`

```env
OAUTH_SERVER_URL=https://seu-manus-server.com
VITE_APP_ID=seu-app-id
OWNER_OPEN_ID=seu-open-id
```

**Passo 2:** Testar

1. Abrir app em `http://localhost:3000`
2. Clicar em "Login with Manus" (se OAuth estiver configurado)
3. Se não estiver configurado, apenas auth local será disponível

**Fallback automático:**
- Se `OAUTH_SERVER_URL` estiver vazio, apenas email/password funciona
- Se OAuth falhar, sistema tenta JWT local
- Modo híbrido é seguro e testado

### Passo 3: Gerar JWT_SECRET Forte

```bash
# Opção 1: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Opção 2: OpenSSL (recomendado)
openssl rand -base64 32

# Opção 3: Online (⚠️ use com cuidado em produção)
# https://1password.com/password-generator/
```

Copiar output e configurar em `.env`:
```env
JWT_SECRET=O0ZvpZ3s9K...copie-aqui...8L9xmQ==
```

---

## Desenvolvimento

### Iniciar Servidor de Desenvolvimento

```bash
pnpm dev
```

Esperado:
```
Server running on http://localhost:3000/
```

### Estrutura do Projeto

```
suppley-ai-bot/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom hooks
│   │   ├── pages/       # Rotas/páginas
│   │   ├── lib/         # Utilities
│   │   └── contexts/    # React Context
│   └── index.html       # Entry point
│
├── server/              # Node.js backend
│   ├── _core/           # Core setup (tRPC, auth, DB)
│   ├── routers/         # API routes (tRPC)
│   ├── services/        # Business logic
│   ├── db/              # Database config
│   └── index.ts         # Server entry
│
├── shared/              # Código compartilhado cliente/servidor
│   ├── types/           # TypeScript types
│   └── _core/           # Helpers compartilhados
│
├── drizzle/             # Migrações e schemas
│   ├── schema.ts        # Definição de tabelas
│   └── migrations/      # Histórico de migrations
│
├── docs/                # Documentação
├── .env.example         # Template de variáveis
├── package.json         # Dependências
├── vite.config.ts       # Configuração do build
└── tsconfig.json        # Configuração TypeScript
```

### Hot Module Replacement (HMR)

Durante `pnpm dev`:
- Alterações em arquivos React: reload automático (< 1s)
- Alterações em TypeScript: compila automaticamente
- Erros aparecem no navegador

### Debugging

**VS Code + TypeScript:**

1. Instalar extensão "Debugger for Chrome"
2. Criar `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}/client"
    }
  ]
}
```

3. Pressionar F5 para iniciar debugging

---

## Testes

### Rodar Suite de Testes

```bash
pnpm test
```

Testa:
- Cálculos de impostos
- Autenticação
- Validações NCM
- Services críticos

### Cobertura de Testes

```bash
pnpm test -- --coverage
```

Gera relatório em `coverage/`

### Testes E2E (opcional)

```bash
pnpm exec playwright test
```

Testa fluxos completos no navegador.

---

## Troubleshooting

### ❌ "Cannot find module 'vite-plugin-manus-runtime'"

**Causa:** Versão antiga de node_modules

**Solução:**
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

---

### ❌ "Error: connect ECONNREFUSED 127.0.0.1:3306"

**Causa:** MySQL não está rodando

**Solução (Docker):**
```bash
docker ps
# Se suppley-mysql não aparecer:
docker run -d \
  --name suppley-mysql \
  -e MYSQL_ROOT_PASSWORD=suppley123 \
  -e MYSQL_DATABASE=suppley_calc \
  -p 3306:3306 \
  mysql:8.0
```

**Solução (PlanetScale):**
- Verificar se `.env` tem `DATABASE_URL` correto
- Testar conexão: `mysql --user=root --password=... -h aws.connect.psdb.cloud`

---

### ❌ "EADDRINUSE :::3000"

**Causa:** Porta 3000 já em uso

**Solução:**
```bash
# Opção 1: Mudar porta em .env
PORT=3001
pnpm dev

# Opção 2: Matar processo na porta 3000 (macOS/Linux)
lsof -ti:3000 | xargs kill -9

# Opção 3: (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

### ❌ "TypeScript compilation error"

**Solução:**
```bash
pnpm check
# Mostra erro exato

# Depois corrigir arquivo indicado
```

---

### ❌ Database migrations falharam

```bash
# Rollback manual (⚠️ cuidado em produção)
pnpm exec drizzle-kit drop

# Depois recriar:
pnpm db:push
```

---

### ❌ "Cannot read property 'findUnique' of undefined"

**Causa:** Banco de dados não inicializado

**Solução:**
```bash
pnpm db:push
```

---

## Próximos Passos

1. ✅ Ambiente local funcionando? Parabéns!
2. 📖 Ler [docs/API.md](./docs/API.md) para entender endpoints
3. 🚀 Quando pronto para deploy: ler [DEPLOYMENT.md](./DEPLOYMENT.md)
4. 🤖 Explorar AI agents: [docs/AGENTS.md](./docs/AGENTS.md)

---

## Suporte

- 📚 Documentação: `docs/` folder
- 🐛 Issues: [GitHub Issues](https://github.com/suppleyjc/suppley-ai-bot/issues)
- 💬 Discussões: [GitHub Discussions](https://github.com/suppleyjc/suppley-ai-bot/discussions)
