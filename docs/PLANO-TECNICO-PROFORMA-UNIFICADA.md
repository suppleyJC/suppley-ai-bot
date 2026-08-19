# Plano Técnico: Integração Proforma + Base Unificada (Fase 0.5)

**Visão:** O Jean quer que a **Excambia receba a proforma** (PDF ou manual), **estruture os dados** via agentes, e **distribua** para a base unificada: fabricante → Indústrias & Fornecedores, produto/valor → Ativos & Insumos. A **Base** alimenta continuamente a **Excambia**.

**Fluxo de COESÃO:**
```
Upload Proforma PDF / Input Manual
                ↓
         EXCAMBIA (Orquestradora)
         /              |              \
    Agente de      Agente de      Agente de
    Fabricante     Produto        Financeiro
        ↓               ↓               ↓
Indústrias &       Ativos &        Análise de
 Fornecedores       Insumos         Viabilidade
        ↓               ↓               ↓
    [Base de Dados — Banco de Conhecimento]
        ↓
    Retroalimenta Excambia + Inteligência de Mercado
```

---

## Parte 1: Schema & Migração

### 1.1 — Alteração de Schema (Aditiva)

#### Arquivo: `drizzle/schema.ts`

Na tabela `industries` (linha ~1086), adicionar campos discriminadores:

```typescript
export const industries = mysqlTable("industries", {
  // ... campos existentes ...
  
  // ===== FASE 0.5: Discriminador e Tipo Unificado =====
  tipoEntidade: mysqlEnum("tipoEntidade", [
    "fornecedor",   // Fabricante ou fornecedor (internacional ou nacional)
    "comprador",    // Comprador nacional / setor (benchmark de demanda)
  ]).default("fornecedor").notNull(),
  
  // ... resto do schema ...
});
```

#### Arquivo: `drizzle/rfqSchema.ts`

Na tabela `supplier_quotes` (linha ~180), tornar `rfqId` opcional:

```typescript
export const supplierQuotes = mysqlTable("supplier_quotes", {
  id: int("id").autoincrement().primaryKey(),
  // ===== ALTERADO: rfqId agora opcional (proforma avulsa permitida) =====
  rfqId: int("rfqId"),  // removido .notNull() → permite proforma independente
  supplierId: int("supplierId"),
  
  // ... resto do schema ...
});
```

### 1.2 — Executar Migração

```bash
pnpm db:push
```

Drizzle vai gerar e aplicar a migração.

---

## Parte 2: Serviço de Proforma com Extração IA

### 2.1 — Arquivo: `server/services/proformaService.ts`

```typescript
import * as db from "../db";
import * as excambiaService from "./excambiaAgentService";
import { invokeLLM } from "../_core/llm";

interface ProformaExtraction {
  supplierName?: string;
  supplierCountry?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  items: {
    productName: string;
    ncmCode?: string;
    quantity: number;
    unit: string;
    unitPriceCents: number;
  }[];
  currency: string;
  incoterm: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  moq?: number;
  validUntil?: Date;
  totalFobCents?: number;
  confidence: number; // 0-100, score de confiança da extração
}

/**
 * Extrai proforma de um PDF/imagem usando Claude
 * Retorna estrutura de dados com confiança
 */
export async function extractProformaFromFile(
  userId: number,
  fileUrl: string,
  mimeType: string,
  hints?: { supplierName?: string; expectedProducts?: string[] }
): Promise<ProformaExtraction> {
  const prompt = `
Você é um especialista em processar documentos comerciais (proformas, cotações, invoices).

Extraia da proforma os dados abaixo com máxima precisão:
1. Nome, país, email e telefone do fornecedor/fabricante
2. Para cada item: nome do produto, quantidade, unidade, preço unitário
3. Moeda, incoterm (FOB, CIF, DDP, etc), prazo de pagamento
4. Lead time (prazo de produção), MOQ (mínima quantidade), validade da cotação

Retorne um JSON estruturado com um campo "confidence" (0-100) indicando seu nível de certeza.
Se não encontrar um campo, deixe como null.

Dica: Se o fornecedor for da China, o incoterm usual é FOB. Se o país é Paraguai, considere MERCOSUL.

${hints?.supplierName ? `Fornecedor esperado: ${hints.supplierName}` : ""}
${hints?.expectedProducts?.length ? `Produtos esperados: ${hints.expectedProducts.join(", ")}` : ""}

Responda em JSON puro (sem markdown, sem explicação).
`;

  const result = await invokeLLM({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "file_url",
            file_url: {
              url: fileUrl,
              mime_type: mimeType as "application/pdf" | "audio/mpeg" | "audio/wav" | "audio/mp4" | "video/mp4",
            },
          },
        ],
      },
    ],
    outputSchema: {
      name: "proforma_extraction",
      schema: {
        type: "object",
        properties: {
          supplierName: { type: ["string", "null"] },
          supplierCountry: { type: ["string", "null"] },
          supplierEmail: { type: ["string", "null"] },
          supplierPhone: { type: ["string", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productName: { type: "string" },
                ncmCode: { type: ["string", "null"] },
                quantity: { type: "number" },
                unit: { type: "string" },
                unitPriceCents: { type: "number" },
              },
              required: ["productName", "quantity", "unit", "unitPriceCents"],
            },
          },
          currency: { type: "string" },
          incoterm: { type: "string" },
          paymentTerms: { type: ["string", "null"] },
          leadTimeDays: { type: ["number", "null"] },
          moq: { type: ["number", "null"] },
          validUntil: { type: ["string", "null"] },
          totalFobCents: { type: ["number", "null"] },
          confidence: { type: "number" },
        },
        required: ["items", "currency", "incoterm", "confidence"],
      },
    },
  });

  const content = result.choices[0].message.content;
  return JSON.parse(content);
}

/**
 * Cria proforma (avulsa, sem RFQ)
 */
export async function createProforma(
  userId: number,
  data: {
    supplierId?: number;
    supplierName: string;
    supplierCountry: string;
    supplierEmail?: string;
    supplierPhone?: string;
    items: {
      productName: string;
      ncmCode?: string;
      quantity: number;
      unit: string;
      unitPriceCents: number;
    }[];
    currency: string;
    incoterm: string;
    paymentTerms?: string;
    leadTimeDays?: number;
    moq?: number;
    validUntil?: Date;
    quotationFileUrl?: string;
  }
) {
  // 1. Criar supplier_quote (proforma avulsa, rfqId = null)
  const quoteId = await db.createSupplierQuote({
    rfqId: null, // ← proforma avulsa (não vinculada a RFQ)
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    supplierCountry: data.supplierCountry,
    supplierEmail: data.supplierEmail,
    supplierPhone: data.supplierPhone,
    currency: data.currency,
    incoterm: data.incoterm,
    paymentTerms: data.paymentTerms,
    leadTimeDays: data.leadTimeDays,
    moq: data.moq,
    validUntil: data.validUntil,
    quotationFileUrl: data.quotationFileUrl,
    status: "received",
  });

  // 2. Criar itens da proforma
  for (const item of data.items) {
    await db.createSupplierQuoteItem({
      supplierQuoteId: quoteId,
      rfqItemId: 0, // placeholder (proforma avulsa)
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.unitPriceCents * item.quantity,
      supplierProductName: item.productName,
    });
  }

  return quoteId;
}

/**
 * Distribuir proforma para a Base:
 * 1. Fornecedor → Indústrias & Fornecedores (enriquecer/criar)
 * 2. Produtos → Ativos & Insumos (enriquecer/criar)
 */
export async function distributeProformaToBase(
  userId: number,
  quoteId: number,
  extraction: ProformaExtraction
): Promise<{ industriaId: number; productIds: number[] }> {
  // 1. Upsert fornecedor em industries
  const industriaId = await db.upsertIndustry(userId, {
    tipoEntidade: "fornecedor",
    name: extraction.supplierName || "Fornecedor desconhecido",
    country: extraction.supplierCountry || "Desconhecido",
    contactEmail: extraction.supplierEmail,
    contactPhone: extraction.supplierPhone,
    preferredIncoterm: extraction.incoterm as any,
    preferredCurrency: extraction.currency,
    paymentTerms: extraction.paymentTerms,
    leadTimeDays: extraction.leadTimeDays,
  });

  // 2. Para cada item, criar/enriquecer em products (Ativos & Insumos)
  const productIds: number[] = [];
  for (const item of extraction.items) {
    // Validar/sugerir NCM se não tiver
    let ncmCode = item.ncmCode;
    if (!ncmCode) {
      try {
        const ncmResult = await invokeLLM({
          messages: [
            {
              role: "user",
              content: `Qual é o código NCM para: "${item.productName}"? Retorne apenas o código no formato 8 dígitos.`,
            },
          ],
        });
        ncmCode = ncmResult.choices[0].message.content.trim().substring(0, 10);
      } catch {
        // Fallback: deixar em branco
      }
    }

    // Criar/atualizar produto
    const productId = await db.upsertProduct(userId, {
      name: item.productName,
      ncmCode: ncmCode || "00000000",
      supplierId: industriaId, // vinculá ao fornecedor
      // ... outros campos opcionais
    });
    productIds.push(productId);

    // Calcular custo nacionalizado (motor certificado)
    const nationalizedCost = await calculateNationalizedCost(
      ncmCode || "00000000",
      item.unitPriceCents,
      extraction.currency,
      extraction.incoterm,
      extraction.supplierCountry || "CN"
    );

    // Atualizar produto com custo importado
    await db.updateProduct(productId, {
      custoImportadoRefCents: nationalizedCost,
    });
  }

  return { industriaId, productIds };
}

/**
 * Calcula custo nacionalizado via motor certificado (já existe)
 */
async function calculateNationalizedCost(
  ncmCode: string,
  unitPriceCents: number,
  currency: string,
  incoterm: string,
  originCountry: string
): Promise<number> {
  // Reusar importCostEngine ou importCalculationService
  // Por agora, placeholder:
  return Math.round(unitPriceCents * 1.3); // Estimativa bruta (30% de custo adicional)
}

export async function listProformas(
  userId: number,
  filters?: { supplierId?: number; status?: string }
) {
  return db.listSupplierQuotes(userId, {
    rfqId: null, // apenas proformas avulsas
    ...filters,
  });
}

export async function getProforma(userId: number, quoteId: number) {
  return db.getSupplierQuote(quoteId);
}
```

---

## Parte 3: Router tRPC

### 3.1 — Arquivo: `server/routers/proformaRouter.ts` (novo)

```typescript
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as proformaService from "../services/proformaService";
import { TRPCError } from "@trpc/server";
import { toast } from "sonner";

export const proformaRouter = router({
  // Extrair proforma de PDF/imagem
  extract: protectedProcedure
    .input(
      z.object({
        fileUrl: z.string().url(),
        mimeType: z.string(),
        supplierName: z.string().optional(),
        expectedProducts: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const extracted = await proformaService.extractProformaFromFile(
          ctx.user.id,
          input.fileUrl,
          input.mimeType,
          {
            supplierName: input.supplierName,
            expectedProducts: input.expectedProducts,
          }
        );
        return extracted;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao extrair proforma: ${error instanceof Error ? error.message : "desconhecido"}`,
        });
      }
    }),

  // Criar proforma (manual ou a partir da extração)
  create: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        supplierName: z.string(),
        supplierCountry: z.string(),
        supplierEmail: z.string().email().optional(),
        supplierPhone: z.string().optional(),
        items: z.array(
          z.object({
            productName: z.string(),
            ncmCode: z.string().optional(),
            quantity: z.number().int().positive(),
            unit: z.string(),
            unitPriceCents: z.number().int().nonnegative(),
          })
        ),
        currency: z.string(),
        incoterm: z.string(),
        paymentTerms: z.string().optional(),
        leadTimeDays: z.number().optional(),
        moq: z.number().optional(),
        validUntil: z.date().optional(),
        quotationFileUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const quoteId = await proformaService.createProforma(ctx.user.id, input);
      return { id: quoteId };
    }),

  // Distribuir proforma para a base (Indústrias & Fornecedores + Ativos & Insumos)
  distribute: protectedProcedure
    .input(
      z.object({
        quoteId: z.number(),
        extraction: z.object({
          supplierName: z.string().optional(),
          supplierCountry: z.string().optional(),
          supplierEmail: z.string().optional(),
          supplierPhone: z.string().optional(),
          items: z.array(
            z.object({
              productName: z.string(),
              ncmCode: z.string().optional(),
              quantity: z.number(),
              unit: z.string(),
              unitPriceCents: z.number(),
            })
          ),
          currency: z.string(),
          incoterm: z.string(),
          paymentTerms: z.string().optional(),
          leadTimeDays: z.number().optional(),
          moq: z.number().optional(),
          confidence: z.number(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await proformaService.distributeProformaToBase(
        ctx.user.id,
        input.quoteId,
        input.extraction
      );
      return result;
    }),

  // Listar proformas avulsas
  list: protectedProcedure.query(async ({ ctx }) => {
    return proformaService.listProformas(ctx.user.id);
  }),

  // Obter uma proforma
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return proformaService.getProforma(ctx.user.id, input.id);
    }),
});
```

### 3.2 — Registrar em `server/routers.ts`

```typescript
import { proformaRouter } from "./routers/proformaRouter";

export const appRouter = router({
  // ... outros routers ...
  proforma: proformaRouter,
});
```

---

## Parte 4: Frontend — Página Proformas

### 4.1 — Arquivo: `client/src/pages/Proformas.tsx` (novo)

```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Upload, FileText, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function Proformas() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const extractMutation = trpc.proforma.extract.useMutation({
    onSuccess: (data) => {
      setExtractedData(data);
      toast.success(`Proforma extraída com confiança ${data.confidence}%`);
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Fazer upload do arquivo (para produção, seria S3 ou similar)
    // Por enquanto, usar data URL
    const reader = new FileReader();
    reader.onload = async (event) => {
      setUploadedFile(file);
      setIsExtracting(true);

      // Chamar extração com data URL (em produção, seria URL real)
      extractMutation.mutate({
        fileUrl: event.target?.result as string,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Proformas</h1>
        <p className="text-muted-foreground">
          Cadastre proformas de fornecedores. A Excambia estrutura os dados e distribui para a Base.
        </p>
      </div>

      {/* Upload ou Input Manual */}
      <Card>
        <CardHeader>
          <CardTitle>Adicionar Proforma</CardTitle>
          <CardDescription>
            Upload de PDF ou input manual. A Excambia extrai fabricante → Indústrias & Fornecedores, 
            produtos/valores → Ativos & Insumos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload PDF */}
          <div>
            <Label>Upload de Proforma (PDF/Imagem)</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition">
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Clique ou arraste arquivo</p>
                <p className="text-xs text-muted-foreground">PDF até 10MB</p>
              </label>
            </div>
            {uploadedFile && (
              <p className="text-sm text-green-600 mt-2">✓ {uploadedFile.name}</p>
            )}
          </div>

          {/* Extração aguardando */}
          {isExtracting && (
            <Alert>
              <AlertDescription>
                Extraindo proforma... (Excambia analisando documento)
              </AlertDescription>
            </Alert>
          )}

          {/* Preview da extração */}
          {extractedData && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Confiança da extração: {extractedData.confidence}%
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Lista de Proformas */}
      <Card>
        <CardHeader>
          <CardTitle>Proformas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            (listar aqui as proformas já importadas, com links para editar/distribuir)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 4.2 — Adicionar ao Menu (DashboardLayout.tsx)

Na seção `OPERAÇÕES`, adicionar:
```typescript
{ icon: FileText, label: "Proformas", path: "/proformas", section: "operacoes" },
```

### 4.3 — Adicionar rota no App.tsx

```typescript
import Proformas from "./pages/Proformas";

// Em AuthenticatedRoutes:
<Route path="/proformas" component={Proformas} />
```

---

## Parte 5: Integração Excambia

Modify `server/services/excambiaAgentService.ts` para incluir um novo agente:

```typescript
const PROFORMA_AGENT_TOOLS = [
  // Ferramenta para extrair proforma
  {
    name: "extract_proforma",
    description: "Extrai dados de uma proforma PDF enviada pelo usuário",
    parameters: {
      type: "object",
      properties: {
        fileUrl: { type: "string" },
        mimeType: { type: "string" },
      },
    },
  },
  // Ferramenta para distribuir para base
  {
    name: "distribute_to_base",
    description: "Distribui proforma para Indústrias & Fornecedores e Ativos & Insumos",
    parameters: {
      type: "object",
      properties: {
        quoteId: { type: "number" },
        extractedData: { type: "object" },
      },
    },
  },
];
```

---

## Resumo de Mudanças

| Arquivo | Tipo | O que Muda |
|---------|------|-----------|
| `drizzle/schema.ts` | Schema | Adicionar `tipoEntidade` em `industries` |
| `drizzle/rfqSchema.ts` | Schema | Tornar `rfqId` opcional em `supplier_quotes` |
| `server/services/proformaService.ts` | Novo | Lógica de extração, criação, distribuição |
| `server/routers/proformaRouter.ts` | Novo | API tRPC para proformas |
| `server/routers.ts` | Alter | Registrar `proformaRouter` |
| `client/src/pages/Proformas.tsx` | Novo | UI de upload e cadastro |
| `client/src/components/DashboardLayout.tsx` | Alter | Adicionar "Proformas" no menu |
| `client/src/App.tsx` | Alter | Adicionar rota `/proformas` |

---

## Próximos Passos (Ordem Recomendada)

1. ✅ Aplicar schema (pnpm db:push)
2. ✅ Implementar `proformaService.ts`
3. ✅ Implementar `proformaRouter.ts`
4. ✅ Implementar `Proformas.tsx`
5. ✅ Integração com Excambia (agente de distribuição)
6. Testar fluxo completo end-to-end
7. Implementar unificação de Fornecedores & Compradores (renomear tela para "Indústrias & Fornecedores")

---

*Plano técnico alinhado com a visão de COESÃO do Jean.*  
*Pronto para começar a implementação.*
