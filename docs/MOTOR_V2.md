# Motor V2 — Advanced Import Cost Engine

Motor V2 is a precision-grade import cost calculation engine designed for Brazilian import operations with complex tax regimes and legislative compliance requirements.

## Status

✅ **Fully integrated** in the codebase and registered in tRPC as `trpc.estimativa.*`

## Key Improvements Over Legacy Engine

### Brazilian Tax Legislation Compliance
- **TTD 409/SC Benefits**: Precise ICMS antecipado calculation (1.0% ou 2.6% depending on phase)
- **LC 224/2025 COFINS**: Optional 0.6% adicional COFINS per recent legislation
- **Multiple Tax Regimes**: Full support for:
  - Lucro Real (1.65% PIS, 7.6% COFINS)
  - Lucro Presumido (0.65% PIS, 3.0% COFINS)
  - Simples Nacional (DAS consolidated)

### Accounting Precision
- **Per-item tax calculation**: Each product's taxes calculated independently with rateio by value
- **Recoverable credit tracking**: ICMS, PIS, COFINS credits per regime rules
- **TTD benefit modeling**: Exact simulation of ICMS benefit spread (cliente vs trading)
- **NF-e ready**: Output compatible with official invoicing requirements

### Advanced Options
- Override individual tax rates (II, IPI, PIS, COFINS, ICMS)
- Configure desired profit margin (default 5%)
- Adjust ICMS negotiated rate for client billing
- Set TTD phase (primeiros 36m @ 2.6% or após 36m @ 1.0%)
- Apply royalties with margin uplift

## API Routes

### `POST /trpc/estimativa.calculate`
Returns full calculation in JSON format.

**Input:**
```json
{
  "products": [
    {
      "productName": "Componente Eletrônico",
      "ncmCode": "84733090",
      "quantity": 1000,
      "unit": "UN",
      "unitPrice": 15.50,
      "sku": "COMP-001",
      "iiRateOverride": 0.126,
      "ipiRateOverride": 0.10
    }
  ],
  "exchangeRate": 5.25,
  "currency": "USD",
  "freight": 2500,
  "insurance": 500,
  
  "customsBrokerBrl": 1500,
  "armazenagemBrl": 800,
  "despachoAduaneiroBrl": 300,
  "afrmmBrl": 625,
  "siscomexBrl": 154.23,
  
  "taxRegime": "lucro_real",
  "ttdPhase": "primeiros_36m",
  "applyCofinsLc224": true,
  "lucroDesejado": 0.05,
  "icmsVendaRate": 0.04
}
```

**Output:**
```json
{
  "items": [
    {
      "description": "Componente Eletrônico",
      "ncm": "84733090",
      "quantity": 1000,
      "unitPriceFob": 15.50,
      "totalFob": 15500.00,
      "fobBrl": 81375.00,
      "freightBrl": 2500,
      "insuranceBrl": 500,
      "iiValue": 13500.55,
      "ipiValue": 10340.25,
      "pisValue": 1707.19,
      "cofinsValue": 7835.45,
      "icmsValue": 3456.78,
      "totalCost": 121715.22,
      "unitCost": 121.72,
      "salePrice": 145000.00,
      "saleUnitPrice": 145.00,
      "icmsVendaValue": 5800.00,
      "totalInvoiceValue": 151235.00
    }
  ],
  "summary": {
    "fobTotalBrl": 81375.00,
    "cifTotalBrl": 84375.00,
    "iiTotal": 13500.55,
    "ipiTotal": 10340.25,
    "pisTotal": 1707.19,
    "cofinsTotal": 7835.45,
    "icmsTotal": 3456.78,
    "taxesTotal": 37440.22
  },
  "warnings": [
    "ICMS efetivo (1.0%) aplicado — benefício TTD primeiros 36 meses"
  ]
}
```

### `POST /trpc/estimativa.exportExcel`
Generates Excel report in accountant-friendly format (dois layouts: internal, client).

**Additional Input:**
```json
{
  "quotationName": "EST-001-2026",
  "supplierName": "Supplier Ltd.",
  "originCountry": "China",
  "clientName": "SUPPLEY Trading",
  "mode": "internal"  // or "client"
}
```

**Output:**
```json
{
  "url": "https://s3.amazonaws.com/.../reports/estimativa-internal-1708...xlsx",
  "fileName": "reports/estimativa-internal-1708...xlsx",
  "warnings": [...],
  "summary": {...}
}
```

## Usage Examples

### TypeScript Frontend Integration

```typescript
// Call Motor V2 from React
import { trpc } from "@/lib/trpc";

const estimativaMutation = trpc.estimativa.calculate.useMutation({
  onSuccess: (result) => {
    console.log("Total cost:", result.summary.cifTotalBrl);
    console.log("Taxes:", result.summary.taxesTotal);
  }
});

// Trigger calculation
estimativaMutation.mutate({
  products: [{
    productName: "Teste",
    ncmCode: "84733090",
    quantity: 100,
    unit: "UN",
    unitPrice: 50,
  }],
  exchangeRate: 5.25,
  currency: "USD",
  freight: 500,
  insurance: 100,
  taxRegime: "lucro_real",
});
```

### cURL Request Example

```bash
curl -X POST https://calculasuppley.com.br/api/trpc/estimativa.calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "products": [{
      "productName": "Eletrônicos",
      "ncmCode": "84733090",
      "quantity": 1000,
      "unit": "UN",
      "unitPrice": 15.50
    }],
    "exchangeRate": 5.25,
    "currency": "USD",
    "freight": 2500,
    "insurance": 500,
    "taxRegime": "lucro_real"
  }'
```

## Comparison: Legacy vs Motor V2

| Aspect | Legacy Engine | Motor V2 |
|--------|---|---|
| **ICMS TTD Benefit** | Fixed approximation | Precise phase-aware (1.0% ou 2.6%) |
| **COFINS LC 224** | Not implemented | ✅ Optional 0.6% addon |
| **Per-item taxes** | Simplified | ✅ Rateio by FOB value |
| **Tax regime support** | Presumido only | ✅ Real, Presumido, Simples |
| **Recoverable credits** | Basic | ✅ Regime-specific rules |
| **Output format** | Legacy compatibility | ✅ Accounting-ready |
| **NF-e integration** | Not optimized | ✅ Value fields for invoicing |

## When to Use Each Engine

### ✅ Use **Legacy Engine** (trpc.calculations.*)
- Quick preliminary estimates
- Simple import scenarios
- Display in UI (well-tested UI integration)

### ✅ Use **Motor V2** (trpc.estimativa.*)
- Exact cost calculation for purchase decisions
- Final pricing for sales
- Excel reports for accountants
- TTD benefit scenarios
- Multi-regime comparisons
- Complex custom tax configurations

## Integration Roadmap

**Current:**
- Motor V2 available via `trpc.estimativa.*` routes
- Can be called from frontend or backend
- Full legislative compliance (2026 standards)

**Future:**
- UI page dedicated to Motor V2 with form
- Side-by-side comparison (Motor V1 vs V2)
- Batch processing for quotations
- API documentation portal

## Testing Motor V2

### Run a quick test:

```bash
# From terminal in the project
pnpm dev

# From browser console:
const result = await fetch('http://localhost:3000/api/trpc/estimativa.calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    products: [{
      productName: "Test",
      ncmCode: "84733090",
      quantity: 100,
      unit: "UN",
      unitPrice: 50
    }],
    exchangeRate: 5.25,
    currency: "USD",
    freight: 500,
    insurance: 100,
    taxRegime: "lucro_real"
  })
}).then(r => r.json());
console.log(result);
```

## Configuration Reference

### Tax Regime Defaults
```typescript
const SALE_TAX_DEFAULTS = {
  lucro_real: { pis: 0.0165, cofins: 0.076 },
  lucro_presumido: { pis: 0.0065, cofins: 0.03 },
  simples_nacional: { pis: 0, cofins: 0 }, // DAS consolidated
};
```

### TTD Phase Rates
- **Primeiros 36 meses** (0–3 anos): ICMS antecipado 2.6%
- **Após 36 meses** (3+ anos): ICMS antecipado 1.0%

### Default Costs
- AFRMM: 25% of freight (maritime only; 0 for air/land)
- Siscomex: R$ 154.23 per addition/item
- ICMS Gross-up: 4% (Resolução Senado 13/2012)

## Support & Documentation

- **Code:** `/server/services/importCostEngine.ts`
- **Router:** `/server/routers/estimativaRouter.ts`
- **Service:** `/server/services/estimativaService.ts`
- **Excel Templates:** `/server/services/excelEstimativaService.ts`

---

**Last Updated:** June 2026  
**Version:** Motor V2 (Production-Ready)
