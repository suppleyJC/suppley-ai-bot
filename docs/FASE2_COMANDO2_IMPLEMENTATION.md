# Fase 2 (COMANDO 2) — Implementation Guide

**Status:** Schema prepared, next: services/routers + frontend

---

## Overview

Add operational metadata fields to the `operacoes` table to support:
- Chat-first demand capture with user-specified priorities and deadlines
- Team responsibility assignment
- Preferred product origin tracking

### New Schema Fields

```sql
ALTER TABLE operacoes ADD (
  origemDesejada varchar(60),           -- Preferred product origin (China, Vietnam, India, etc.)
  prioridade enum('baixa', 'media', 'alta', 'critica') DEFAULT 'media',  -- Operation priority
  prazoDesejado timestamp,              -- User-specified deadline for delivery
  responsavelId int                     -- Assigned responsible user (FK to users.id)
);
```

### TypeScript Types (Auto-inferred)

The following types in `drizzle/schema.ts` are automatically updated via `inferSelect`/`inferInsert`:

```typescript
export type Operacao = typeof operacoes.$inferSelect;
export type InsertOperacao = typeof operacoes.$inferInsert;
```

Both types now include:
```typescript
{
  // ... existing fields ...
  origemDesejada?: string | null;
  prioridade?: 'baixa' | 'media' | 'alta' | 'critica' | null;
  prazoDesejado?: Date | null;
  responsavelId?: number | null;
}
```

---

## Implementation Checklist

### 1. **Apply Database Migration** (DevOps/DBA)

On the production server:

```bash
# Assuming running in the app container
mysql -u root -p$DB_PASSWORD suppley_db < drizzle/0020_operacoes_fase2_fields.sql

# Verify
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'operacoes'
ORDER BY ORDINAL_POSITION;
```

Expected output includes:
```
...
| origemDesejada      | varchar(60)        | YES          | NULL     |
| prioridade          | enum(...)          | YES          | media    |
| prazoDesejado       | timestamp          | YES          | NULL     |
| responsavelId       | int                | YES          | NULL     |
```

---

### 2. **Update operacaoService.ts** (Backend)

Location: `server/services/operacaoService.ts`

#### 2.1 Create method signature

Update `createOperacao` to accept new fields:

```typescript
async function createOperacao(input: {
  userId: number;
  titulo: string;
  // ... existing fields ...
  
  // NEW FIELDS
  prioridade?: 'baixa' | 'media' | 'alta' | 'critica';
  prazoDesejado?: Date;
  responsavelId?: number;
  origemDesejada?: string;
}) {
  // Validate prazoDesejado is in the future
  if (input.prazoDesejado && input.prazoDesejado < new Date()) {
    throw new Error('Prazo desejado não pode ser no passado');
  }

  // Validate responsavelId exists if provided
  if (input.responsavelId) {
    const user = await getUser(input.responsavelId);
    if (!user) throw new Error('Responsável não encontrado');
  }

  return db.insert(operacoes).values({
    // ... existing mappings ...
    prioridade: input.prioridade ?? 'media',
    prazoDesejado: input.prazoDesejado,
    responsavelId: input.responsavelId,
    origemDesejada: input.origemDesejada,
  });
}
```

#### 2.2 Update method signature

Add optional updates for existing operations:

```typescript
async function updateOperacao(id: number, input: {
  titulo?: string;
  // ... existing fields ...
  
  // NEW FIELDS
  prioridade?: 'baixa' | 'media' | 'alta' | 'critica';
  prazoDesejado?: Date;
  responsavelId?: number;
  origemDesejada?: string;
}) {
  // Same validations as createOperacao
  
  return db.update(operacoes)
    .set({
      // ... existing updates ...
      ...(input.prioridade !== undefined && { prioridade: input.prioridade }),
      ...(input.prazoDesejado !== undefined && { prazoDesejado: input.prazoDesejado }),
      ...(input.responsavelId !== undefined && { responsavelId: input.responsavelId }),
      ...(input.origemDesejada !== undefined && { origemDesejada: input.origemDesejada }),
    })
    .where(eq(operacoes.id, id));
}
```

---

### 3. **Update operacoes tRPC Router** (Backend)

Location: `server/routers/operacoes.ts`

#### 3.1 Create procedure

Add new fields to the zod schema:

```typescript
export const operacoesRouter = router({
  create: protectedProcedure
    .input(z.object({
      titulo: z.string().min(1),
      // ... existing fields ...
      
      // NEW FIELDS
      prioridade: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
      prazoDesejado: z.date().optional(),
      responsavelId: z.number().int().optional(),
      origemDesejada: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const operacao = await operacaoService.createOperacao({
        userId: ctx.user.id,
        ...input,
      });
      return operacao;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().min(1).optional(),
      // ... existing fields ...
      
      // NEW FIELDS
      prioridade: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
      prazoDesejado: z.date().optional(),
      responsavelId: z.number().int().optional(),
      origemDesejada: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const operacao = await operacaoService.updateOperacao(input.id, {
        ...input,
      });
      return operacao;
    }),
});
```

---

### 4. **Update Frontend Components** (Frontend)

Location: `client/src/pages/` and `client/src/components/`

#### 4.1 OperacaoDetail.tsx

Add fields to the detail view:

```typescript
// In the detail render:
<div className="grid grid-cols-2 gap-4">
  {/* Existing fields */}
  
  {/* NEW FIELDS */}
  <div>
    <label className="text-xs font-semibold text-slate-600">Prioridade</label>
    <p className="mt-1 text-sm font-medium">
      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
        operacao.prioridade === 'critica' ? 'bg-red-50 text-red-700' :
        operacao.prioridade === 'alta' ? 'bg-orange-50 text-orange-700' :
        operacao.prioridade === 'media' ? 'bg-yellow-50 text-yellow-700' :
        'bg-slate-50 text-slate-700'
      }`}>
        {operacao.prioridade || 'média'}
      </span>
    </p>
  </div>

  <div>
    <label className="text-xs font-semibold text-slate-600">Prazo Desejado</label>
    <p className="mt-1 text-sm font-medium">
      {operacao.prazoDesejado 
        ? new Date(operacao.prazoDesejado).toLocaleDateString('pt-BR')
        : '—'}
    </p>
  </div>

  <div>
    <label className="text-xs font-semibold text-slate-600">Origem Desejada</label>
    <p className="mt-1 text-sm font-medium">{operacao.origemDesejada || '—'}</p>
  </div>

  <div>
    <label className="text-xs font-semibold text-slate-600">Responsável</label>
    <p className="mt-1 text-sm font-medium">
      {responsavel?.name || '—'}
    </p>
  </div>
</div>
```

#### 4.2 Create/Edit Modal

Add form fields (use in Operacoes.tsx or a modal):

```typescript
<form className="space-y-4">
  {/* Existing fields */}
  
  {/* NEW FIELDS */}
  <div>
    <label htmlFor="prioridade" className="text-xs font-semibold text-slate-600">
      Prioridade
    </label>
    <select
      id="prioridade"
      defaultValue={operacao?.prioridade || 'media'}
      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
    >
      <option value="baixa">Baixa</option>
      <option value="media">Média</option>
      <option value="alta">Alta</option>
      <option value="critica">Crítica</option>
    </select>
  </div>

  <div>
    <label htmlFor="prazoDesejado" className="text-xs font-semibold text-slate-600">
      Prazo Desejado
    </label>
    <input
      id="prazoDesejado"
      type="date"
      defaultValue={operacao?.prazoDesejado 
        ? new Date(operacao.prazoDesejado).toISOString().split('T')[0]
        : ''
      }
      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
    />
  </div>

  <div>
    <label htmlFor="origemDesejada" className="text-xs font-semibold text-slate-600">
      Origem Desejada (País)
    </label>
    <input
      id="origemDesejada"
      type="text"
      placeholder="Ex: China, Vietnã, Índia"
      defaultValue={operacao?.origemDesejada || ''}
      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
    />
  </div>

  <div>
    <label htmlFor="responsavelId" className="text-xs font-semibold text-slate-600">
      Responsável
    </label>
    <select
      id="responsavelId"
      defaultValue={operacao?.responsavelId || ''}
      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
    >
      <option value="">Sem atribuição</option>
      {usuarios.map(u => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  </div>
</form>
```

#### 4.3 Kanban Column Filtering (Optional)

Add ability to filter by priority:

```typescript
// In Operacoes.tsx, add filter UI:
const [filtro, setFiltro] = useState<'todos' | 'critica' | 'alta'>('todos');

const itensFilterados = itens.filter(o => {
  if (filtro === 'critica') return o.prioridade === 'critica';
  if (filtro === 'alta') return o.prioridade === 'alta' || o.prioridade === 'critica';
  return true;
});
```

---

### 5. **Update Operacao Interface (Frontend)** (Frontend)

Location: `client/src/components/OperacaoTimeline.tsx`

Update the `Operacao` interface to include new fields:

```typescript
export interface Operacao {
  id: number;
  codigo: string;
  titulo: string;
  estagioAtual: Estagio;
  status: string;
  clienteNome?: string | null;
  fornecedorNome?: string | null;
  origemPais?: string | null;
  valorEstimadoBrlCents?: number | null;
  margemEstimadaBp?: number | null;
  
  // NEW FIELDS
  prioridade?: 'baixa' | 'media' | 'alta' | 'critica' | null;
  prazoDesejado?: Date | string | null;
  responsavelId?: number | null;
  origemDesejada?: string | null;
}
```

---

### 6. **Integration with Excambia** (Backend)

When Excambia (`runExcambia`) creates/updates operations via the orchestrator:

```typescript
// In orchestrator.ts tools that create operations:
const result = await operacaoService.createOperacao({
  userId: ctx.userId,
  titulo: extractedFromChat.titulo,
  prioridade: extractedFromChat.prioridade || 'media',
  prazoDesejado: extractedFromChat.prazoDesejado,
  origemDesejada: extractedFromChat.origemDesejada,
  // responsavelId can be set to ctx.userId by default
  responsavelId: extractedFromChat.responsavelId,
});
```

---

## Testing Checklist

- [ ] **Database:** Verify new columns exist and have correct defaults
- [ ] **Backend:**
  - [ ] `POST /api/trpc/operacoes.create` with new fields
  - [ ] `PATCH /api/trpc/operacoes.update` with partial updates
  - [ ] Validation: prazoDesejado cannot be in past
  - [ ] Validation: responsavelId must exist
- [ ] **Frontend:**
  - [ ] Create form accepts and submits new fields
  - [ ] Detail view displays all new fields correctly
  - [ ] Date input uses correct format (YYYY-MM-DD)
  - [ ] Priority badge displays correct colors
- [ ] **Kanban:**
  - [ ] Cards display priority indicator
  - [ ] Filtering by priority works (if implemented)
- [ ] **Type Safety:** No TypeScript errors (`pnpm check`)
- [ ] **Build:** Production build succeeds (`pnpm build`)

---

## Migration Rollback (if needed)

```sql
ALTER TABLE operacoes DROP COLUMN origemDesejada;
ALTER TABLE operacoes DROP COLUMN prioridade;
ALTER TABLE operacoes DROP COLUMN prazoDesejado;
ALTER TABLE operacoes DROP COLUMN responsavelId;
```

---

## Notes

- **Default priority:** `'media'` — Excambia uses this unless user specifies otherwise
- **No constraints yet:** `responsavelId` is not enforced as FK; can add later with migration
- **Backward compatible:** Existing operations will have NULL values for new fields
- **Next step after COMANDO 2:** COMANDO 3 (operacao_anexos table for file attachments)
