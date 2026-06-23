# Phase 1 Implementation Guide: Performance & UX (Weeks 1-6)

**Goal:** 3x perceived speed improvement (5s → 2s → streaming with incremental rendering)  
**Budget:** ~40 dev hours  
**Teams:** Backend (streaming) + Frontend (UI) + DevOps (caching)

---

## Task 1.1: Streaming Support in Excambia Orchestrator

### Current Flow (Blocking)
```typescript
// User waits for entire response before anything displays
const result = await runExcambia({ messages, ... })
displayResponse(result.reply)
```

### Target Flow (Streaming)
```typescript
// User sees chunks appear incrementally
for await (const chunk of runExcambiaStream({ messages, ... })) {
  displayChunk(chunk)  // "Analisando...", "NCM 7317.00.90", etc
}
```

### Implementation Steps

#### Step 1: Modify runExcambia() → runExcambiaStream()
**File:** `server/agent/orchestrator.ts`

```typescript
// Current signature (line ~150):
export async function runExcambia(params: RunParams): Promise<RunResult>

// New signature:
export async function* runExcambiaStream(
  params: RunParams
): AsyncGenerator<StreamChunk, RunResult, unknown>

// StreamChunk definition:
interface StreamChunk {
  type: "thinking" | "tool_start" | "tool_result" | "text" | "final"
  content: string
  toolName?: string
  timestamp: number
}

// Implementation pattern:
export async function* runExcambiaStream(params: RunParams) {
  yield { type: "thinking", content: "Analisando sua solicitação..." }
  
  // Turn 1
  const response1 = await invokeLLM({ messages, tools })
  yield { type: "text", content: response1.content }
  
  // Tool execution with streaming
  for (const toolCall of response1.toolCalls || []) {
    yield { type: "tool_start", toolName: toolCall.name }
    const result = await executeTool(toolCall)
    yield { type: "tool_result", content: JSON.stringify(result) }
  }
  
  // Continue loop...
  return { reply: finalText, toolsUsed, toolResults }
}
```

#### Step 2: Create tRPC streaming endpoint
**File:** `server/routers/excambiaRouter.ts` (new mutation)

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

#### Step 3: Frontend streaming consumer
**File:** `client/src/pages/ExcambiaChat.tsx`

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

// In component:
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
          // Operation complete
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
            Tools: {toolsUsed.join(", ")}
          </div>
        )}
      </div>
    </div>
  </div>
}
```

#### Step 4: Fallback for non-streaming clients
- If client doesn't support streaming, use existing `agentChat` endpoint
- Check `Accept` header for `text/event-stream` support
- Graceful degradation: fast clients get streaming, others get full response

#### Acceptance Criteria
- [ ] User sees "Analisando..." within 100ms of click
- [ ] Chat renders partial text chunks (not waiting for full response)
- [ ] Tool execution status visible (e.g., "[●] Classificando NCM...")
- [ ] Final response complete within 2s (vs 5s blocking)
- [ ] Works on 3G network (test with Chrome DevTools throttling)

---

## Task 1.2: Model Selection Strategy

### Current (All Opus)
```typescript
const model = "claude-opus-4-8"  // $15/1M input tokens
// Simple task cost: $0.15 for NCM classification
```

### Target (Smart Routing)
```typescript
enum ModelTier {
  HAIKU = "claude-haiku-4-5",    // $0.80/1M (5ms latency)
  SONNET = "claude-sonnet-4-6",  // $3/1M (15ms latency)
  OPUS = "claude-opus-4-8",      // $15/1M (25ms latency, best reasoning)
}

interface TaskProfile {
  task: string
  complexity: "deterministic" | "simple" | "moderate" | "complex"
  model: ModelTier
  reasoning: string
}

const TASK_PROFILES: TaskProfile[] = [
  // Deterministic (no LLM reasoning needed)
  { task: "tax_rate_lookup", complexity: "deterministic", model: ModelTier.NONE, reasoning: "Pure DB lookup" },
  { task: "exchange_rate_lookup", complexity: "deterministic", model: ModelTier.NONE, reasoning: "Pure DB lookup" },
  
  // Simple (Haiku sufficient)
  { task: "ncm_classification", complexity: "simple", model: ModelTier.HAIKU, reasoning: "Deterministic pattern matching, 95% accuracy with Haiku" },
  { task: "product_categorization", complexity: "simple", model: ModelTier.HAIKU, reasoning: "Fixed taxonomy mapping" },
  { task: "supplier_risk_assessment", complexity: "simple", model: ModelTier.HAIKU, reasoning: "Rule-based (rating > C = low risk)" },
  
  // Moderate (Sonnet sweet spot)
  { task: "cost_calculation", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Some reasoning required, but deterministic formula" },
  { task: "quotation_analysis", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Comparison & scoring logic" },
  { task: "supplier_search", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Multi-criteria filtering + ranking" },
  { task: "compliance_check", complexity: "moderate", model: ModelTier.SONNET, reasoning: "Rule application with context" },
  
  // Complex (Opus required)
  { task: "strategic_planning", complexity: "complex", model: ModelTier.OPUS, reasoning: "High-level business reasoning" },
  { task: "viability_analysis", complexity: "complex", model: ModelTier.OPUS, reasoning: "Multi-factor holistic assessment" },
  { task: "scenario_planning", complexity: "complex", model: ModelTier.OPUS, reasoning: "Counterfactual reasoning" },
  { task: "market_intelligence", complexity: "complex", model: ModelTier.OPUS, reasoning: "Novel insight generation" },
]

// Routing logic
function selectModel(taskName: string, context?: any): ModelTier {
  const profile = TASK_PROFILES.find(p => p.task === taskName)
  if (!profile) return ModelTier.OPUS  // Default to safest
  return profile.model
}

// Usage in orchestrator:
export async function runExcambia(params: RunParams) {
  let turn = 0
  let reply = ""
  
  while (turn < 6) {
    // Detect what task Claude is trying to do
    const taskName = detectTask(messages)  // "ncm_classification", "cost_calculation", etc
    const model = selectModel(taskName)
    
    const response = await invokeLLM({
      messages,
      model,  // Pass selected model instead of hardcoded "opus"
      tools,
    })
    
    reply = response.choices[0].message.content
    
    // Execute tools...
    turn++
  }
  
  return { reply, ... }
}
```

#### Implementation Steps

1. **Create task detection utility** (server/_core/taskDetection.ts)
   - Parse last user message + assistant context
   - Classify as one of 30+ known tasks
   - Fallback: ask Claude to self-describe its task

2. **Update invokeLLM()** to accept model parameter
   - File: `server/_core/llm.ts` (line 220)
   - Default to Opus for backward compatibility
   - Pass model to Anthropic API

3. **Update orchestrator** to call selectModel()
   - File: `server/agent/orchestrator.ts`
   - Before each Claude call, detect task + select model

4. **Test across spectrum**
   - Haiku: NCM → expect 90% accuracy (vs 98% Opus)
   - Sonnet: Cost calc → expect <0.5% error
   - Opus: Strategy → expect superior reasoning

#### Cost Savings Projection
| Task | Frequency | Model | Cost/Call | Current | Optimized | Saving |
|------|-----------|-------|-----------|---------|-----------|--------|
| NCM Classification | 50/day | Haiku | $0.012 | $0.75 | $0.60 | $0.15 |
| Cost Calculation | 40/day | Sonnet | $0.04 | $0.60 | $0.16 | $0.44 |
| Quote Analysis | 20/day | Sonnet | $0.05 | $0.30 | $0.10 | $0.20 |
| Strategic Planning | 5/day | Opus | $0.20 | $0.30 | $0.30 | $0.00 |
| **Daily Total** | - | - | - | **$1.95** | **$1.16** | **40% ↓** |

#### Acceptance Criteria
- [ ] Task detection works for 20+ common operations
- [ ] Haiku accuracy tested at 90%+ for NCM
- [ ] Sonnet accuracy tested at 98%+ for costs
- [ ] Cost per day reduced to <$1.20 (from $1.95)
- [ ] No accuracy regression (<1% error increase allowed)

---

## Task 1.3: Response Caching Layer

### Strategy
Cache **deterministic operations only**:
- NCM classification (input: product name → output: NCM code)
- Tax rates (input: NCM + state → output: rates)
- Exchange rates (input: currency pair → output: rate)
- Supplier rankings (input: criteria → output: ranked list)

### Implementation

#### Step 1: Create cache service
**File:** `server/_core/cache.ts`

```typescript
import NodeCache from "node-cache"

export class CacheService {
  private cache = new NodeCache({
    stdTTL: 24 * 60 * 60,  // 24h default
    checkperiod: 60,        // Check every 60s
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

#### Step 2: Wrap cacheable operations
**File:** `server/services/ncmService.ts` (example)

```typescript
// Before: direct call to Claude
export async function classifyNCM(productName: string) {
  const result = await invokeLLM({...})
  return result
}

// After: cache-aware
export async function classifyNCM(productName: string) {
  const cacheKey = `ncm:${productName.toLowerCase()}`
  
  // Check cache first
  const cached = cacheService.get<NCMResult>(cacheKey)
  if (cached) return cached
  
  // Cache miss → call Claude
  const result = await invokeLLM({...})
  
  // Store (24h TTL for NCM, unlikely to change)
  cacheService.set(cacheKey, result, 24 * 60 * 60)
  
  return result
}
```

#### Step 3: Cache for other services
Apply same pattern to:
- `exchangeService.ts` (TTL: 1 hour, rates change daily)
- `taxTableUpdateService.ts` (TTL: 7 days, rates change infrequently)
- `statePricingService.ts` (TTL: 30 days, prices stable)
- `supplierSearchService.ts` (TTL: 1 day, rankings stable)

#### Step 4: Cache monitoring
**Endpoint:** `GET /api/cache/stats`

```typescript
cacheRouter.query("stats", protectedProcedure.query(async () => {
  return cacheService.getStats()
}))

// Returns: { hitRate: 0.87, keys: 1243, byOperation: {...} }
```

#### Acceptance Criteria
- [ ] 75%+ cache hit rate on common operations
- [ ] <10ms cache retrieval time
- [ ] TTLs configured per operation type
- [ ] Cache stats endpoint working
- [ ] No stale data (verification mechanism)

---

## Task 1.4: UI Responsiveness

### Issues to Fix
1. **Overflow on mobile:** Chat input/messages overflow on small screens
2. **Long chat histories:** Virtualization needed for 100+ messages
3. **Slow rendering:** Each message triggers full re-render
4. **Touch targets:** Buttons/inputs too small on mobile

### Implementation

#### Step 1: Fix mobile layout
**File:** `client/src/pages/ExcambiaChat.tsx`

```typescript
return (
  <div className="flex flex-col h-screen w-screen overflow-hidden">
    {/* Header */}
    <div className="flex-none border-b p-4">
      <h1 className="text-xl font-bold">Excambia</h1>
    </div>
    
    {/* Messages - scrollable with virtualization */}
    <div className="flex-1 overflow-y-auto">
      <MessageList messages={messages} />
    </div>
    
    {/* Input - sticky bottom */}
    <div className="flex-none border-t p-4 bg-white">
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          className="flex-1 px-3 py-2 border rounded text-base"  // min 16px font prevents zoom
          placeholder="Escreva sua pergunta..."
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded min-w-14 min-h-10"  // Touch target: 10x10mm
        >
          Enviar
        </button>
      </form>
    </div>
  </div>
)
```

#### Step 2: Virtualize message list
**File:** `client/src/components/MessageList.tsx` (new)

```typescript
import { Virtualizer } from "@react-window/fixed-size-list"

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <Virtualizer
      height={window.innerHeight - 200}  // Leave room for header + input
      itemCount={messages.length}
      itemSize={100}  // Estimate message height
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

#### Step 3: Memoize message rendering
```typescript
const MessageComponent = memo(({ message }: { message: Message }) => (
  <div className={`message ${message.role}`}>
    {message.content}
  </div>
))

MessageComponent.displayName = "Message"
```

#### Step 4: Add loading placeholders
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

#### Acceptance Criteria
- [ ] No horizontal scroll on mobile (375px width)
- [ ] Chat handles 1000+ messages without lag
- [ ] Touch targets 10mm minimum (44px)
- [ ] Font size minimum 16px (prevents auto-zoom)
- [ ] Loads in <3s on 3G (tested with Chrome DevTools)

---

## Testing Plan

### Unit Tests
```bash
pnpm test -- runExcambiaStream.test.ts
pnpm test -- taskDetection.test.ts
pnpm test -- cache.service.test.ts
```

### Integration Tests
```bash
pnpm test -- excambiaRouter.stream.test.ts  # Streaming endpoint
pnpm test -- modelSelection.integration.test.ts  # Model routing
pnpm test -- caching.integration.test.ts  # Cache + DB consistency
```

### Performance Tests
```bash
pnpm perf:latency  # Response time benchmarks
pnpm perf:memory   # Memory usage under load
pnpm perf:cache    # Cache hit rate simulation
```

### E2E Tests (Selenium/Cypress)
```bash
pnpm test:e2e:mobile    # Mobile UI responsiveness
pnpm test:e2e:streaming # Chat streaming visual
pnpm test:e2e:slow-network  # 3G throttling
```

---

## Rollout Plan

### Week 1-2: Backend Development
- [ ] Implement runExcambiaStream() in orchestrator
- [ ] Create streaming tRPC endpoint
- [ ] Implement model selection logic
- [ ] Set up cache service
- [ ] All unit tests passing

### Week 3: Integration
- [ ] Connect streaming endpoint to UI
- [ ] Test with real Claude API
- [ ] Monitor latency & costs
- [ ] Fix mobile layout issues

### Week 4-5: Testing & Optimization
- [ ] E2E test on 3G network
- [ ] Performance profiling (measure 3x improvement)
- [ ] Load testing (concurrent users)
- [ ] Acceptance testing with stakeholders

### Week 6: Rollout
- [ ] Deploy to staging
- [ ] 1 week production canary (10% traffic)
- [ ] Monitor metrics (latency, cost, errors)
- [ ] Full rollout if green

---

## Success Metrics

| Metric | Current | Target | Achieved |
|--------|---------|--------|----------|
| Response time (p50) | 5.0s | 2.0s | ? |
| Response time (p95) | 8.0s | 3.0s | ? |
| Cost per request | $0.15 | $0.05 | ? |
| Mobile load time | 5.5s | 2.0s | ? |
| Cache hit rate | 0% | 75%+ | ? |
| Time to first text | 5.0s | 0.5s | ? |
| User satisfaction | 2/5 | 4.5/5 | ? |

---

## Rollback Plan

If issues arise:
1. **Streaming broken?** → Disable streaming endpoint, fallback to blocking `agentChat`
2. **Model accuracy regression?** → Revert to Opus for all tasks
3. **Cache inconsistency?** → Clear cache, disable caching
4. **Mobile rendering broken?** → Revert CSS changes, test on desktop only

---

## Next Steps After Phase 1

Once Phase 1 complete:
1. Gather performance metrics
2. Collect user feedback on speed improvement
3. Identify remaining bottlenecks
4. Plan Phase 2 (audit trail + approval workflow)

---

*This guide is a living document. Update with implementation details as you progress.*
