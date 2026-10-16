# Guia de Implementação Fase 1: Performance e UX (Semanas 1-6)

**Objetivo:** Melhoria de velocidade percebida de 3x (5s → 2s → streaming com renderização incremental)  
**Orçamento:** ~40 horas de dev  
**Times:** Backend (streaming) + Frontend (UI) + DevOps (cache)

---

## Tarefa 1.1: Suporte de Streaming no Orquestradora Excambia

### Fluxo Atual (Bloqueante)
```typescript
// Usuário aguarda resposta inteira antes de qualquer coisa aparecer
const result = await runExcambia({ messages, ... })
displayResponse(result.reply)
```

### Fluxo Alvo (Streaming)
```typescript
// Usuário vê chunks aparecerem incrementalmente
for await (const chunk of runExcambiaStream({ messages, ... })) {
  displayChunk(chunk)  // "Analisando...", "NCM 7317.00.90", etc
}
```

### Passos de Implementação

#### Passo 1: Modificar runExcambia() → runExcambiaStream()
**Arquivo:** `server/agent/orchestrator.ts`

```typescript
// Assinatura atual (linha ~150):
export async function runExcambia(params: RunParams): Promise<RunResult>

// Nova assinatura:
export async function* runExcambiaStream(
  params: RunParams
): AsyncGenerator<StreamChunk, RunResult, unknown>

// Definição StreamChunk:
interface StreamChunk {
  type: "thinking" | "tool_start" | "tool_result" | "text" | "final"
  content: string
  toolName?: string
  timestamp: number
}

// Padrão de implementação:
export async function* runExcambiaStream(params: RunParams) {
  yield { type: "thinking", content: "Analisando sua solicitação..." }
  
  // Turno 1
  const response1 = await invokeLLM({ messages, tools })
  yield { type: "text", content: response1.content }
  
  // Execução de ferramenta com streaming
  for (const toolCall of response1.toolCalls || []) {
    yield { type: "tool_start", toolName: toolCall.name }
    const result = await executeTool(toolCall)
    yield { type: "tool_result", content: JSON.stringify(result) }
  }
  
  // Continuar loop...
  return { reply: finalText, toolsUsed, toolResults }
}
```

#### Passo 2: Criar endpoint de streaming tRPC
**Arquivo:** `server/routers/excambiaRouter.ts` (nova mutation)

```typescript
agentChatStream: protectedProcedure
  .input(z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    operacaoId: z.number().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of runExcambiaStream({
            userId: ctx.user.id,
            operacaoId: input.operacaoId,
            messages: input.messages,
          })) {
            controller.enqueue(
              `data: ${JSON.stringify(chunk)}\n\n`
            )
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
  })
```

#### Passo 3: Consumidor de streaming no frontend
**Arquivo:** `client/src/pages/ExcambiaChat.tsx`

```typescript
async function* chatStream(messages: Message[]) {
  const response = await fetch("/api/trpc/excambia.agentChatStream", {
    method: "POST",
    body: JSON.stringify({ messages }),
  })
  
  if (!response.body) throw new Error("No response body")
  
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    const chunk = decoder.decode(value)
    const lines = chunk.split("\n")
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6))
        yield data as StreamChunk
      }
    }
  }
}

// No componente:
function ExcambiaChat() {
  const [displayText, setDisplayText] = useState("")
  const [toolsUsed, setToolsUsed] = useState<string[]>([])
  
  async function handleSendMessage(userMessage: string) {
    setDisplayText("")
    setToolsUsed([])
    
    const messages = [...chatHistory, { role: "user", content: userMessage }]
    
    for await (const chunk of chatStream(messages)) {
      switch (chunk.type) {
        case "thinking":
        case "text":
          setDisplayText(prev => prev + chunk.content)
          break
        case "tool_start":
          setToolsUsed(prev => [...prev, chunk.toolName!])
          break
        case "tool_result":
          setDisplayText(prev => prev + `\n[✓ ${chunk.toolName}]\n`)
          break
        case "final":
          // Operação completa
          break
      }
    }
  }
  
  return <div className="chat-interface">
    <div className="messages">
      <div className="message assistant">
        {displayText}
        {toolsUsed.length > 0 && (
          <div className="tools-used">
            Ferramentas: {toolsUsed.join(", ")}
          </div>
        )}
      </div>
    </div>
  </div>
}
```

#### Passo 4: Fallback para clientes sem streaming
- Se cliente não suporta streaming, usar endpoint existente `agentChat`
- Verificar header `Accept` para suporte a `text/event-stream`
- Degradação graciosa: clientes rápidos recebem streaming, outros recebem resposta completa

#### Critérios de Aceitação
- [ ] Usuário vê "Analisando..." dentro de 100ms do clique
- [ ] Chat renderiza chunks de texto parcial (não aguarda resposta completa)
- [ ] Status de execução de ferramenta visível (ex. "[●] Classificando NCM...")
- [ ] Resposta final completa dentro de 2s (vs 5s bloqueante)
- [ ] Funciona em rede 3G (testar com Chrome DevTools throttling)

---

## Tarefa 1.2: Estratégia de Seleção de Modelo

### Atual (Tudo Opus)
```typescript
const model = "claude-opus-4-8"  // $15/1M tokens de input
// Custo de tarefa simples: $0.15 para classificação NCM
```

### Alvo (Roteamento Inteligente)
```typescript
enum ModelTier {
  HAIKU = "claude-haiku-4-5",    // $0.80/1M (latência 5ms)
  SONNET = "claude-sonnet-4-6",  // $3/1M (latência 15ms)
  OPUS = "claude-opus-4-8",      // $15/1M (latência 25ms, melhor raciocínio)
}

interface TaskProfile {
  task: string
  complexity: "deterministic" | "simple" | "moderate" | "complex"
  model: ModelTier
  reasoning: string
}

const TASK_PROFILES: TaskProfile[] = [
  // Determinístico (nenhum raciocínio LLM necessário)
  { task: "tax_rate_lookup", complexity: "deterministic", model: ModelTier.NONE, reasoning: "Lookup puro de DB" },
  { task: "exchange_rate_lookup", complexity: "deterministic", model: ModelTier.NONE, reasoning: "Lookup puro de DB" },
  
  // Simples (Haiku suficiente)
  { task: "ncm_classification", complexity: "simple", model: ModelTier.HAIKU, reasoning: "Correspondência de padrão determinística, 95% precisão com Haiku" },
  { task: "product_categorization", complexity: "simple", model: ModelTier.HAIKU, reasoning: "Mapeamento de taxonomia fixa" },
  { task: "supplier_risk_assessment", complexity: "simple", model: ModelTier.HAIKU, reasoning: "Baseado em regra (rating > C = risco baixo)" },
  
  // Moderada (sweet spot Sonnet)
  { task: "cost_calculation", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Algum raciocínio necessário, mas fórmula determinística" },
  { task: "quotation_analysis", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Lógica de comparação & scoring" },
  { task: "supplier_search", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Filtro multi-critério + ranking" },
  { task: "compliance_check", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Aplicação de regra com contexto" },
  
  // Complexa (Opus necessário)
  { task: "strategic_planning", complexity: "complex", model: ModelTier.OPUS, reasoning: "Raciocínio holístico de nível negócio" },
  { task: "viability_analysis", complexity: "complex", model: ModelTier.OPUS, reasoning: "Avaliação holística de múltiplos fatores" },
  { task: "scenario_planning", complexity: "complex", model: ModelTier.OPUS, reasoning: "Raciocínio contrafactual" },
  { task: "market_intelligence", complexity: "complex", model: ModelTier.OPUS, reasoning: "Geração de insight novel" },
]

// Lógica de roteamento
function selectModel(taskName: string, context?: any): ModelTier {
  const profile = TASK_PROFILES.find(p => p.task === taskName)
  if (!profile) return ModelTier.OPUS  // Padrão para mais seguro
  return profile.model
}

// Uso no orquestradora:
export async function runExcambia(params: RunParams) {
  let turn = 0
  let reply = ""
  
  while (turn < 6) {
    // Detectar que tarefa Claude está tentando fazer
    const taskName = detectTask(messages)  // "ncm_classification", "cost_calculation", etc
    const model = selectModel(taskName)
    
    const response = await invokeLLM({
      messages,
      model,  // Passar modelo selecionado em vez de "opus" hardcoded
      tools,
    })
    
    reply = response.choices[0].message.content
    
    // Executar ferramentas...
    turn++
  }
  
  return { reply, ... }
}
```

#### Passos de Implementação

1. **Criar utilitário de detecção de tarefa** (server/_core/taskDetection.ts)
   - Parse da última mensagem de usuário + contexto do assistente
   - Classificar como uma de 30+ tarefas conhecidas
   - Fallback: pedir ao Claude para auto-descrever sua tarefa

2. **Atualizar invokeLLM()** para aceitar parâmetro de modelo
   - Arquivo: `server/_core/llm.ts` (linha 220)
   - Padrão Opus para retrocompatibilidade
   - Passar modelo para API Anthropic

3. **Atualizar orquestradora** para chamar selectModel()
   - Arquivo: `server/agent/orchestrator.ts`
   - Antes de cada chamada Claude, detectar tarefa + selecionar modelo

4. **Testar em espectro**
   - Haiku: NCM → esperar 90% precisão (vs 98% Opus)
   - Sonnet: Cálc custo → esperar <0.5% erro
   - Opus: Estratégia → esperar raciocínio superior

#### Projeção de Economia de Custo
| Tarefa | Frequência | Modelo | Custo/Chamada | Atual | Otimizado | Economia |
|--------|-----------|--------|-----------|-------|-----------|----------|
| Classificação NCM | 50/dia | Haiku | $0.012 | $0.75 | $0.60 | $0.15 |
| Cálc Custo | 40/dia | Sonnet | $0.04 | $0.60 | $0.16 | $0.44 |
| Análise Cotação | 20/dia | Sonnet | $0.05 | $0.30 | $0.10 | $0.20 |
| Planejamento Estratég | 5/dia | Opus | $0.20 | $0.30 | $0.30 | $0.00 |
| **Total Diário** | - | - | - | **$1.95** | **$1.16** | **40% ↓** |

#### Critérios de Aceitação
- [ ] Detecção de tarefa funciona para 20+ operações comuns
- [ ] Precisão Haiku testada em 90%+ para NCM
- [ ] Precisão Sonnet testada em 98%+ para custos
- [ ] Custo por dia reduzido para <$1.20 (de $1.95)
- [ ] Sem regressão de precisão (<1% aumento de erro permitido)

---

## Tarefa 1.3: Camada de Cache de Resposta

### Estratégia
Cache **apenas operações determinísticas**:
- Classificação NCM (entrada: nome do produto → saída: código NCM)
- Alíquotas de imposto (entrada: NCM + estado → saída: alíquotas)
- Taxas de câmbio (entrada: par de moeda → saída: taxa)
- Rankings de fornecedor (entrada: critérios → saída: lista ranqueada)

### Implementação

#### Passo 1: Criar serviço de cache
**Arquivo:** `server/_core/cache.ts`

```typescript
import NodeCache from "node-cache"

export class CacheService {
  private cache = new NodeCache({
    stdTTL: 24 * 60 * 60,  // 24h padrão
    checkperiod: 60,        // Verificar a cada 60s
  })
  
  get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key)
    if (value) {
      this.metrics.recordHit(key)
    }
    return value
  }
  
  set<T>(key: string, value: T, ttl?: number): boolean {
    this.cache.set(key, value, ttl)
    return true
  }
  
  delete(key: string): number {
    return this.cache.del(key)
  }
  
  clear(): void {
    this.cache.flushAll()
  }
  
  getStats() {
    return {
      hitRate: this.metrics.hitRate(),
      keys: this.cache.keys().length,
    }
  }
}

export const cacheService = new CacheService()
```

#### Passo 2: Envolver operações cacheáveis
**Arquivo:** `server/services/ncmService.ts` (exemplo)

```typescript
// Antes: chamada direta para Claude
export async function classifyNCM(productName: string) {
  const result = await invokeLLM({...})
  return result
}

// Depois: consciente de cache
export async function classifyNCM(productName: string) {
  const cacheKey = `ncm:${productName.toLowerCase()}`
  
  // Verificar cache primeiro
  const cached = cacheService.get<NCMResult>(cacheKey)
  if (cached) return cached
  
  // Cache miss → chamar Claude
  const result = await invokeLLM({...})
  
  // Armazenar (TTL 24h para NCM, improvável mudar)
  cacheService.set(cacheKey, result, 24 * 60 * 60)
  
  return result
}
```

#### Passo 3: Cache para outros serviços
Aplicar mesmo padrão a:
- `exchangeService.ts` (TTL: 1 hora, taxas mudam diariamente)
- `taxTableUpdateService.ts` (TTL: 7 dias, alíquotas mudam raramente)
- `statePricingService.ts` (TTL: 30 dias, preços estáveis)
- `supplierSearchService.ts` (TTL: 1 dia, rankings estáveis)

#### Passo 4: Monitoramento de cache
**Endpoint:** `GET /api/cache/stats`

```typescript
cacheRouter.query("stats", protectedProcedure.query(async () => {
  return cacheService.getStats()
}))

// Retorna: { hitRate: 0.87, keys: 1243, byOperation: {...} }
```

#### Critérios de Aceitação
- [ ] Taxa de acerto 75%+ em operações comuns
- [ ] Tempo de recuperação <10ms do cache
- [ ] TTLs configurados por tipo de operação
- [ ] Endpoint de stats de cache funcionando
- [ ] Nenhum dado obsoleto (mecanismo de verificação)

---

## Tarefa 1.4: Responsividade UI

### Problemas a Corrigir
1. **Overflow em móvel:** Input/mensagens de chat overflow em telas pequenas
2. **Históricos de chat longos:** Virtualização necessária para 100+ mensagens
3. **Renderização lenta:** Cada mensagem dispara re-render completo
4. **Áreas de toque:** Botões/inputs muito pequenos em móvel

### Implementação

#### Passo 1: Corrigir layout móvel
**Arquivo:** `client/src/pages/ExcambiaChat.tsx`

```typescript
return (
  <div className="flex flex-col h-screen w-screen overflow-hidden">
    {/* Cabeçalho */}
    <div className="flex-none border-b p-4">
      <h1 className="text-xl font-bold">Excambia</h1>
    </div>
    
    {/* Mensagens - scrollável com virtualização */}
    <div className="flex-1 overflow-y-auto">
      <MessageList messages={messages} />
    </div>
    
    {/* Input - sticky bottom */}
    <div className="flex-none border-t p-4 bg-white">
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          className="flex-1 px-3 py-2 border rounded text-base"  // font min 16px previne zoom
          placeholder="Escreva sua pergunta..."
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded min-w-14 min-h-10"  // Área toque: 10x10mm
        >
          Enviar
        </button>
      </form>
    </div>
  </div>
)
```

#### Passo 2: Virtualizar lista de mensagens
**Arquivo:** `client/src/components/MessageList.tsx` (novo)

```typescript
import { Virtualizer } from "@react-window/fixed-size-list"

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <Virtualizer
      height={window.innerHeight - 200}  // Deixar espaço para cabeçalho + input
      itemCount={messages.length}
      itemSize={100}  // Estimar altura de mensagem
    >
      {({ index, style }) => (
        <div style={style}>
          <Message message={messages[index]} />
        </div>
      )}
    </Virtualizer>
  )
}
```

#### Passo 3: Memoizar renderização de mensagem
```typescript
const MessageComponent = memo(({ message }: { message: Message }) => (
  <div className={`message ${message.role}`}>
    {message.content}
  </div>
))

MessageComponent.displayName = "Message"
```

#### Passo 4: Adicionar placeholders de carregamento
```typescript
function LoadingMessage() {
  return (
    <div className="message assistant">
      <div className="animate-pulse flex space-x-2">
        <div className="h-2 bg-gray-300 rounded-full w-2" />
        <div className="h-2 bg-gray-300 rounded-full w-2" />
        <div className="h-2 bg-gray-300 rounded-full w-2" />
      </div>
    </div>
  )
}
```

#### Critérios de Aceitação
- [ ] Sem scroll horizontal em móvel (largura 375px)
- [ ] Chat trata 1000+ mensagens sem lag
- [ ] Áreas de toque 10mm mínimo (44px)
- [ ] Tamanho de fonte mínimo 16px (previne auto-zoom)
- [ ] Carrega em <3s em 3G (testado com Chrome DevTools)

---

## Plano de Testes

### Testes Unitários
```bash
pnpm test -- runExcambiaStream.test.ts
pnpm test -- taskDetection.test.ts
pnpm test -- cache.service.test.ts
```

### Testes de Integração
```bash
pnpm test -- excambiaRouter.stream.test.ts  # Endpoint de streaming
pnpm test -- modelSelection.integration.test.ts  # Roteamento de modelo
pnpm test -- caching.integration.test.ts  # Consistência cache + DB
```

### Testes de Performance
```bash
pnpm perf:latency  # Benchmarks de tempo de resposta
pnpm perf:memory   # Uso de memória sob carga
pnpm perf:cache    # Simulação de taxa de acerto de cache
```

### Testes E2E (Selenium/Cypress)
```bash
pnpm test:e2e:mobile    # Responsividade UI móvel
pnpm test:e2e:streaming # Visualização de chat streaming
pnpm test:e2e:slow-network  # Throttling 3G
```

---

## Plano de Rollout

### Semana 1-2: Desenvolvimento Backend
- [ ] Implementar runExcambiaStream() no orquestradora
- [ ] Criar endpoint tRPC de streaming
- [ ] Implementar lógica de seleção de modelo
- [ ] Configurar serviço de cache
- [ ] Todos testes unitários passando

### Semana 3: Integração
- [ ] Conectar endpoint de streaming à UI
- [ ] Testar com API Claude real
- [ ] Monitorar latência & custos
- [ ] Corrigir problemas de layout móvel

### Semana 4-5: Testes e Otimização
- [ ] Testar E2E em rede 3G
- [ ] Perfilagem de performance (medir melhoria 3x)
- [ ] Teste de carga (usuários simultâneos)
- [ ] Testes de aceitação com stakeholders

### Semana 6: Rollout
- [ ] Implantar em staging
- [ ] 1 semana canário em produção (10% de tráfego)
- [ ] Monitorar métricas (latência, custo, erros)
- [ ] Rollout completo se verde

---

## Métricas de Sucesso

| Métrica | Atual | Alvo | Atingido |
|---------|-------|------|----------|
| Tempo de resposta (p50) | 5.0s | 2.0s | ? |
| Tempo de resposta (p95) | 8.0s | 3.0s | ? |
| Custo por requisição | $0.15 | $0.05 | ? |
| Tempo de carregamento móvel | 5.5s | 2.0s | ? |
| Taxa de acerto de cache | 0% | 75%+ | ? |
| Tempo até primeiro texto | 5.0s | 0.5s | ? |
| Satisfação do usuário | 2/5 | 4.5/5 | ? |

---

## Plano de Rollback

Se problemas surgirem:
1. **Streaming quebrado?** → Desabilitar endpoint de streaming, fallback para `agentChat` bloqueante
2. **Regressão de precisão de modelo?** → Reverter para Opus para todas as tarefas
3. **Inconsistência de cache?** → Limpar cache, desabilitar cache
4. **Renderização móvel quebrada?** → Reverter mudanças CSS, testar apenas em desktop

---

## Próximos Passos Após Fase 1

Uma vez Fase 1 completa:
1. Coletar métricas de performance
2. Coletar feedback do usuário sobre melhoria de velocidade
3. Identificar gargalos restantes
4. Planejar Fase 2 (trilha de auditoria + fluxo de aprovação)

---

*Este guia é um documento vivo. Atualize com detalhes de implementação conforme progride.*
