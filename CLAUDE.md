# Claude Development Guide

This file documents how Claude Code (and other AI assistants) should work with this codebase.

## Quick Context

**Project:** SUPPLEY AI Bot — Independent supply chain optimization system  
**Stack:** React 19 + Node.js/Express + MySQL + LangChain  
**Status:** Production-ready, recently migrated from Manus platform  
**Repo:** https://github.com/suppleyjc/suppley-ai-bot

## Critical Information for AI Assistants

### 1. Do NOT Create These Files Without Asking

- `package.json` — Only edit with explicit user request (modify, don't replace)
- `.env` — NEVER commit (always .gitignore'd)
- `docker-compose.yml` — Breaking changes → ask first
- `drizzle.config.ts` — Database schema changes → ask first

### 2. Key Project Files

```
Authentication:
  - server/_core/auth.ts       (Core auth logic)
  - server/_core/context.ts    (tRPC context setup)
  - server/services/authService.ts

Database:
  - drizzle/schema.ts          (Core tables)
  - drizzle/rfqSchema.ts       (RFQ tables)
  - server/db/               (Database operations)

API Routes (tRPC):
  - server/routers.ts          (Router registration)
  - server/routers/            (Individual routers)

Business Logic:
  - server/services/           (Service layer)

Frontend:
  - client/src/pages/          (Page components)
  - client/src/components/     (Reusable components)
  - client/src/lib/            (Utilities, tRPC client)
```

### 3. Development Workflow

```bash
# Before making changes:
git status
git log --oneline -5

# During development:
pnpm dev          # Start dev server
pnpm check        # Type check only
pnpm test         # Run tests

# After changes:
git diff          # Review changes
git add .
git commit -m "..."
git push
```

### 4. Common Tasks & Patterns

#### Adding a New API Endpoint

1. Create method in service (`server/services/newService.ts`)
2. Create router (`server/routers/newRouter.ts`)
3. Register in `server/routers.ts`
4. Call from client via `client/src/lib/trpc.ts`

#### Modifying Database Schema

1. Edit `drizzle/schema.ts` or `drizzle/rfqSchema.ts`
2. Generate migration: `pnpm db:push`
3. Test with `pnpm test`

#### Adding Authentication Check

Use `context.user` in tRPC procedures:
```typescript
export const protectedProcedure = baseProcedure.use(async (opts) => {
  const user = opts.ctx.user;
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return opts.next({ ctx: { ...opts.ctx, user } });
});
```

### 5. Testing

All tests must pass before committing:
```bash
pnpm check   # TypeScript
pnpm test    # Vitest
pnpm build   # Full production build
```

### 6. Code Style

- **TypeScript:** Strict mode enabled
- **Formatting:** Prettier (auto on save recommended)
- **Naming:** camelCase for vars/functions, PascalCase for components/types
- **Comments:** Only when WHY is non-obvious (not WHAT)

### 7. Breaking Changes

If considering breaking changes:
1. Ask user first via AskUserQuestion
2. Update CHANGELOG.md
3. Create migration guide if needed
4. Update documentation

### 8. Deployment

The branch structure:
- `main` — production ready
- `development` — staging/feature work
- `claude/*` — AI-assisted feature branches

Never force-push unless explicitly authorized.

## Important Constraints

### Database

- ✅ MySQL 8.0+ only (currently configured)
- ❌ Do NOT change to PostgreSQL without asking
- ❌ Do NOT use non-standard schemas
- Schema changes require migration files

### Dependencies

- ✅ Update patch versions freely (1.2.3 → 1.2.4)
- ⚠️ Minor updates (1.2.0 → 1.3.0) → test first
- ❌ Major updates (1.0.0 → 2.0.0) → ask user first
- ❌ Never remove dependencies without asking

### Deployment

- Current: Independent GitHub + Docker
- ❌ Do NOT add back Manus dependencies
- ❌ Do NOT create vendor lock-in
- OAuth is optional; JWT local-auth is default

## Useful Commands

```bash
# Development
pnpm dev                # Start dev server with HMR
pnpm dev:client        # Frontend only
pnpm dev:server        # Backend only

# Quality checks
pnpm check             # Type check
pnpm format            # Auto-format code
pnpm test              # Run test suite
pnpm build             # Production build

# Database
pnpm db:push           # Generate and run migrations
pnpm db:studio         # Interactive database browser

# Debugging
pnpm dev:debug         # With Node debugger
# Then open: chrome://inspect
```

## Common Issues & Solutions

### "Cannot find module" Error
```bash
# Usually means missing pnpm install
pnpm install

# Or outdated lockfile
rm pnpm-lock.yaml
pnpm install
```

### TypeScript Errors After Changes
```bash
pnpm check     # See what's wrong
# Fix issues, then:
pnpm test      # Validate
```

### Port 3000 Already in Use
```bash
# Change in .env:
PORT=3001
pnpm dev
```

### Database Connection Fails
1. Check `.env` has `DATABASE_URL`
2. Check MySQL is running (if local)
3. Test connection: `mysql -u root -p`

## Commit Message Style

Use conventional commits:
```
feat(auth): add OAuth fallback
fix(db): handle null exchange rates
docs(setup): add PlanetScale option
refactor(services): split tax calculation
test(calcs): add regime parity tests
```

Template:
```
<type>(<scope>): <description>

<body - optional>

<footer - optional>
```

## Code Review Checklist

Before pushing, ensure:
- [ ] `pnpm check` passes (no TypeScript errors)
- [ ] `pnpm test` passes (all tests green)
- [ ] `pnpm build` succeeds (production build works)
- [ ] `.env` is NOT in git
- [ ] Commit messages are clear
- [ ] No console.log() left behind (except logging utility)
- [ ] No hardcoded secrets
- [ ] Database changes include migrations
- [ ] New API endpoints are documented

## Security Notes

⚠️ **Critical:**
- NEVER log JWT tokens
- NEVER expose `JWT_SECRET` in code
- NEVER hardcode database credentials
- NEVER use password fallback in production
- ALWAYS validate user input

Sensitive files (gitignore'd):
- `.env`
- `*.key`
- `node_modules/`
- `dist/`
- `.manus/`

## Documentation Standards

When creating docs:
1. Put in `/docs` folder
2. Use markdown
3. Include examples
4. Include diagrams where helpful
5. Link from main README.md if public-facing

For inline code:
- Use JSDoc for exported functions
- Explain WHY in comments, not WHAT
- Link to docs for complex logic

## Version Control

**Current branch:** `claude/manus-migration-independent-1kfrll`

**Branches you might work on:**
- `main` — production (NEVER commit here directly)
- `development` — staging work
- `claude/*` — AI-assisted features

**Rules:**
- ✅ Create PR for review before merging to `main`
- ✅ All tests must pass before merge
- ❌ No force-push to `main` or `development`
- ❌ No committing to `main` directly

## When in Doubt

1. Ask the user (use AskUserQuestion)
2. Check existing code for patterns
3. Look in `/docs` for architecture decisions
4. Run tests to validate
5. Read commit history (git log) for context

## Helpful Resources

- **API Structure:** See `server/routers/` for tRPC patterns
- **Database:** See `drizzle/schema.ts` for table definitions
- **Auth:** See `server/_core/context.ts` for permission logic
- **Styling:** See `client/src/components/ui/` for component library

---

**Last Updated:** June 14, 2026  
**Maintained By:** Suppley Development Team
