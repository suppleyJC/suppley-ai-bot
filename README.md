# SUPPLEY AI Bot — Independent Supply Chain Optimization

An AI-powered supply chain optimization system for import/export trading calculations, pricing intelligence, and automated supplier analysis. **Now fully independent from the Manus platform.**

## Features

- 📊 **Advanced Cost Calculation** — Tax regime-aware pricing with TTD (drawback) benefit calculations
- 🤖 **AI Agents** — LangGraph-powered analysis for quotations, market data, and supplier recommendations
- 💰 **Real-time Exchange Rates** — Automatic FX updates with multiple data sources
- 📋 **NCM/HSCode Management** — Complete Brazilian tax classification database
- 📑 **Report Generation** — PDF and Excel exports with professional formatting
- 🔐 **Secure Authentication** — JWT-based auth with optional OAuth support
- 📱 **REST API** — tRPC-powered type-safe API endpoints

## Tech Stack

- **Frontend:** React 19 + Vite + TailwindCSS + Radix UI
- **Backend:** Node.js + Express + tRPC
- **Database:** MySQL (via Drizzle ORM)
- **AI/ML:** LangChain + LangGraph
- **Authentication:** JWT + bcryptjs
- **Real-time:** WebSocket support for live updates

## Quick Start

### Prerequisites

- **Node.js** 18+ with pnpm
- **MySQL** 8.0+ (local or PlanetScale)
- **Git**

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/suppleyjc/suppley-ai-bot.git
cd suppley-ai-bot
```

2. **Install dependencies:**
```bash
pnpm install
```

3. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your database credentials and JWT_SECRET
```

4. **Initialize database:**
```bash
pnpm db:push
```

5. **Start development server:**
```bash
pnpm dev
```

The application will be available at `http://localhost:3000`

## Development

### Available Commands

```bash
# Development mode with hot reload
pnpm dev

# Type checking
pnpm check

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test

# Format code
pnpm format

# Database migrations
pnpm db:push
```

## Database Setup

### Option 1: Local MySQL (Recommended for Development)

```bash
# Using Docker
docker run -d \
  --name suppley-mysql \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=suppley_calc \
  -p 3306:3306 \
  mysql:8.0

# Then set DATABASE_URL in .env:
# DATABASE_URL=mysql://root:your_password@localhost:3306/suppley_calc

pnpm db:push
```

### Option 2: PlanetScale (Cloud MySQL)

1. Create account at [planetscale.com](https://planetscale.com)
2. Create a database
3. Get connection string and add to `.env`:
```
DATABASE_URL=mysql://user:password@aws.connect.psdb.cloud/database?sslaccept=strict
```
4. Run `pnpm db:push`

### Option 3: Supabase (PostgreSQL)

Note: Currently configured for MySQL. To use PostgreSQL:
1. Update `drizzle.config.ts`
2. Update imports in `server/db/config.ts`
3. Reinstall dependencies

## Authentication

The system supports multiple authentication methods:

### Email/Password
- User registration and login
- Secure password hashing with bcryptjs
- JWT token-based sessions

### OAuth (Optional)
- Manus platform OAuth (if `OAUTH_SERVER_URL` configured)
- Can be completely disabled for standalone deployments

### JWT Configuration
Make sure `JWT_SECRET` is set in `.env`:
```bash
# Generate a strong secret
openssl rand -base64 32
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on:
- Docker containerization
- GitHub Actions CI/CD
- Production environment setup
- Security hardening

## Cost Calculation Engine V2

This version includes the advanced Motor de Cálculo V2 with:

- **Paridade com contabilidade** — Validated against real accounting spreadsheets
- **TTD Negociável** — Flexible drawback benefit repayment
- **Excel vivo** — Live calculation spreadsheets for auditing
- **Endpoints paralelos** — Load-balanced calculation routes
- **Importador NCM** — Batch import of tax classification tables

For detailed documentation, see [docs/MOTOR_V2.md](./docs/MOTOR_V2.md)

## API Documentation

The API is fully type-safe via tRPC. Key routers include:

- `auth` — Authentication and user management
- `calculations` — Import/export cost calculations
- `quotations` — RFQ management and tracking
- `estimativa` — V2 cost estimation engine
- `ncm` — HSCode/NCM lookup and management
- `exchange` — Real-time FX rates
- And many more...

For full API reference: [docs/API.md](./docs/API.md)

## Migration from Manus

This codebase was successfully migrated from the Manus platform. What was removed:

- ❌ `vite-plugin-manus-runtime` dependency
- ❌ Manus database integration (`.manus/` folder)
- ❌ Manus domain whitelist in development mode
- ✅ Retained full OAuth compatibility (optional)
- ✅ Retained all business logic and calculations

See [docs/MIGRATION.md](./docs/MIGRATION.md) for technical details.

## Security

⚠️ **Before deploying to production:**

1. ✅ Set strong `JWT_SECRET` in `.env`
2. ✅ Use environment-specific credentials for database
3. ✅ Enable HTTPS in reverse proxy (nginx/Cloudflare)
4. ✅ Set secure database connection (require SSL)
5. ✅ Implement rate limiting on authentication endpoints
6. ✅ Regular dependency updates: `pnpm outdated` and `pnpm update`

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Commit with clear messages
4. Push to GitHub and create a Pull Request

## License

**UNLICENSED** — Proprietary software. All rights reserved.

## Support

For issues and feature requests, use GitHub Issues:
https://github.com/suppleyjc/suppley-ai-bot/issues

## Roadmap

- [ ] Advanced analytics dashboard
- [ ] Supplier performance scoring
- [ ] Automated RFQ generation
- [ ] Multi-currency operations
- [ ] Mobile app (React Native)
- [ ] Kubernetes deployment templates

---

**Status:** ✅ Migrated to independent deployment | 📦 Production Ready
