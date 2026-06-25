# Deployment Guide — Price History + Translation Features

## Current State

### Recent Commits (claude/manus-migration-independent-1kfrll branch)

```
a47e4ba db(migration): add quotationDate column to proformas table
f555cc0 feat(price-history): add price evolution visualizations (supplier + product)
cdebcc0 feat(price-history): derive chronological price metrics from proformas
5eac6d3 feat(proforma): add quotation date extraction and storage
5f41daf feat(proforma): traduzir nomes de produtos e sugerir NCM automaticamente ← HAD ERROR
```

### Two Feature Sets Ready

1. **Price History & Visualization** (✅ Tested & Ready)
   - Commits: `5eac6d3`, `cdebcc0`, `f555cc0`, `a47e4ba`
   - Features:
     - LLM-based quotation date extraction from PDFs
     - Chronological price evolution per product
     - Supplier catalog with per-product price timelines
     - Chart visualization with FOB (BRL) + estimated nationalized cost
     - Historical exchange rate integration
     - Estimated import cost calculation (custo nacionalizado)

2. **Product Translation + NCM Suggestions** (⚠️ Requires Review)
   - Commit: `5f41daf`
   - Status: Had an error during earlier deployment
   - Action: Review error logs from docker-compose deployment before reapplying

---

## Deployment Path — Step by Step

### Phase 1: Deploy Price History Features (Recommended First)

This is independent of the translation feature and has been validated.

#### 1.1 Ensure Docker Container is Running

```bash
# Remove old container if stuck (due to docker-compose 1.29.2 bug)
docker rm -f suppley-ai-bot

# Start fresh container
docker-compose up -d
```

#### 1.2 Apply Migration 0027

Once the MySQL container is ready, run:

```bash
# Via docker-compose (preferred)
docker-compose exec -T mysql mysql -u suppley -p suppley_calc < drizzle/0027_add_quotation_date_to_proformas.sql

# Or directly
docker exec -i suppley-mysql mysql -u suppley -p suppley_calc < drizzle/0027_add_quotation_date_to_proformas.sql
```

**What this does:**
- Adds `quotationDate TIMESTAMP NULL` column to proformas table
- Creates index `idx_proformas_quotation_date` for chronological queries
- Idempotent: safe to run multiple times

#### 1.3 Verify Migration Success

```bash
docker-compose exec mysql mysql -u suppley -p suppley_calc -e "DESCRIBE proformas LIKE '%quotation%';"
```

Expected output:
```
+-----------------+-----------+------+-----+---------+-------+
| Field           | Type      | Null | Key | Default | Extra |
+-----------------+-----------+------+-----+---------+-------+
| quotationDate   | timestamp | YES  |     | NULL    |       |
+-----------------+-----------+------+-----+---------+-------+
```

#### 1.4 Rebuild and Deploy Application

```bash
# Build new image with price history code
docker-compose up --build -d

# Verify services are healthy
docker-compose ps
```

---

### Phase 2: Review & Deploy Translation Features (After Phase 1)

The translation + NCM suggestion feature (commit `5f41daf`) needs review before redeployment.

#### 2.1 What Was Added

- Product name translation via LLM (e.g., "Tubo de Cobre" → normalized "tubo de cobre")
- Automatic NCM code suggestion based on product name
- Integration into proforma extraction workflow

#### 2.2 Identify the Error

The previous deployment encountered an error. To diagnose:

```bash
# Check docker logs from previous attempt
docker logs suppley-ai-bot 2>&1 | grep -i "ncm\|translat\|error" | tail -30

# Or check migration logs if applicable
docker-compose logs mysql | grep -i "error"
```

#### 2.3 Remediation

**Option A: If the error is in the LLM extraction**
- Review the extraction prompt in `server/services/proformaService.ts`
- Verify the LLM response schema includes the new fields
- Test with `pnpm test` before redeployment

**Option B: If the error is in database migration**
- Check that no conflicting columns exist
- Verify the migration is idempotent
- Run migration manually first, then rebuild

**Option C: If the error is in business logic**
- Check TypeScript compilation: `pnpm check`
- Review recent changes to the extraction service
- Validate the NCM suggestion engine integration

#### 2.4 Re-deploy After Fix

```bash
# Rebuild with fixed code
docker-compose down
docker-compose up --build -d

# Verify startup logs
docker-compose logs --tail=50 -f
```

---

## Architecture: Price History Flow

### Data Pipeline

```
PDF Upload
   ↓
Extract quotationDate + prices (LLM)
   ↓
Create proforma with quotationDate
   ↓
Store in proformas + proformaItems
   ↓
Distribute to industries (supplier base)
```

### Derived Metrics

1. **Product Price History** (`/api/proforma/productPriceHistory`)
   - Query: all proformas for a product (normalized name)
   - Output: evolution over time + statistics

2. **Supplier Catalog** (`/api/proforma/supplierCatalog`)
   - Query: all products + prices from one supplier
   - Output: catalog with per-product timelines (branching)

3. **Enriched Points**
   - For each quote: calculate FOB (BRL) using historical FX
   - Estimate nationalized cost using certified import cost engine
   - Calculate +% markup (nationalized vs FOB in BRL)

### Frontend Components

- **PriceHistoryView.tsx**: Reusable chart + table component
- **IndustryDetail.tsx**: New "Histórico de Preços" tab (supplier catalog)
- **Products.tsx**: New "Histórico" action button (product timeline)

---

## Testing Checklist

### Unit & Integration Tests

```bash
pnpm check    # TypeScript validation
pnpm test     # Vitest suite
pnpm build    # Production build
```

### Manual Testing (In Browser)

After deployment:

1. Upload a proforma PDF with a visible date
2. Extract and create proforma (verify date is captured)
3. Go to supplier detail → "Histórico de Preços" tab
   - Should show product list with price charts
4. Go to Products page → "Histórico" button
   - Should show price evolution across all suppliers

---

## Rollback Plan

If deployment fails at any stage:

```bash
# Revert to last stable commit
git reset --hard f555cc0  # Last price-history commit before migration

# Or revert application only (keep migration)
docker-compose down
git checkout production   # or main
docker-compose up --build -d
```

---

## Known Issues & Workarounds

### Docker-Compose 1.29.2 Bug

**Problem:** `ContainerConfig` KeyError when recreating container  
**Solution:** Delete the old container before recreating:

```bash
docker rm -f suppley-ai-bot
docker-compose up -d
```

### MySQL Connection Timeout

If migration fails to connect:

```bash
# Wait for MySQL to fully start
docker-compose exec mysql mysqladmin -u suppley -p suppley_calc ping

# Then run migration
docker-compose exec -T mysql mysql -u suppley -p suppley_calc < drizzle/0027_add_quotation_date_to_proformas.sql
```

---

## Next Steps

1. ✅ **Price History Ready**: Deploy migrations + features (Phase 1)
2. 📋 **Translation Review**: Debug previous error (Phase 2)
3. 📊 **Monitor**: Check application logs for any issues post-deployment
4. 🧪 **Test**: Validate price history features in browser

---

**Branch:** `claude/manus-migration-independent-1kfrll`  
**Last Updated:** 2026-06-25  
**Status:** Phase 1 Ready for Deployment
