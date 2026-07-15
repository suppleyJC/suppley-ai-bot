import { ENV } from "./env";
import { recordLlmUsage } from "../db/usageDb";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type DocumentContent = {
  type: "document";
  source: {
    type: "base64";
    media_type: "application/pdf" | "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

export type ImageBase64Content = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent | DocumentContent | ImageBase64Content;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  /** Presente em mensagens do assistente que pediram ferramentas (function calling). */
  tool_calls?: ToolCall[];
  /**
   * Blocos de raciocínio (extended thinking) da Anthropic, CRUS e assinados.
   * Quando um turno com thinking pede tools, a API exige que esses blocos sejam
   * devolvidos INTACTOS na mensagem do assistente do turno seguinte. Preencha
   * com o que veio em InvokeResult.choices[0].message.thinking_blocks.
   */
  thinking_blocks?: unknown[];
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  /** Override do modelo. Default: claude-opus-4-8. Use Haiku/Sonnet p/ tarefas simples. */
  model?: string;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /**
   * Habilita a ferramenta NATIVA de pesquisa web da Anthropic (web_search).
   * O modelo decide quando pesquisar; a busca roda no servidor da Anthropic e o
   * texto volta com citações — sem chave de API externa. Use para pesquisa de
   * legislação, fiscal, logística, mercado financeiro e commodities.
   */
  webSearch?: boolean;
  /** Limite de buscas por chamada (default 5). */
  webSearchMaxUses?: number;
  /**
   * EXTENDED THINKING (cadeia de pensamento nativa da Anthropic): o modelo
   * raciocina em blocos internos antes de responder — qualidade muito superior
   * em análises complexas (viabilidade multi-cenário, correlação de mercado,
   * planejamento fiscal). O budget é o teto de tokens de raciocínio.
   * Restrições da API: incompatível com tool_choice FORÇADO (use "auto") e o
   * max_tokens deve ser MAIOR que o budget. Com tools, os blocos de thinking
   * retornados devem ser replayados intactos (ver Message.thinking_blocks).
   */
  thinking?: { budgetTokens: number };
};

/** IDs de modelo disponíveis para roteamento por complexidade. */
export const MODELS = {
  fast: "claude-haiku-4-5-20251001", // tarefas determinísticas/simples (NCM, classificações)
  balanced: "claude-sonnet-4-6", // análise de complexidade média
  smart: "claude-opus-4-8", // raciocínio estratégico (orquestrador)
} as const;

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent | DocumentContent | ImageBase64Content>;
      tool_calls?: ToolCall[];
      /** Blocos de extended thinking CRUS (replay obrigatório no loop de tools). */
      thinking_blocks?: unknown[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent | DocumentContent | ImageBase64Content => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  if (part.type === "document") {
    return part;
  }

  if (part.type === "image") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const assertApiKey = () => {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    model,
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
    webSearch,
    webSearchMaxUses,
    thinking,
  } = params;

  // A Anthropic não tem "response_format: json_schema" como a OpenAI. Para obter
  // saída estruturada de forma confiável, convertemos o schema numa ferramenta
  // forçada (tool_choice fixo): o Claude é obrigado a preencher os campos do
  // schema, e devolvemos o input da tool como conteúdo JSON.
  const rf = responseFormat ?? response_format;
  const structuredSchema: JsonSchema | undefined =
    rf && rf.type === "json_schema" ? rf.json_schema : (outputSchema ?? output_schema);

  // Texto plano de um conteúdo qualquer (usado para system e tool_result)
  const asPlainText = (content: MessageContent | MessageContent[]): string =>
    ensureArray(content)
      .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : JSON.stringify(part)))
      .join("\n");

  // Anthropic só aceita roles 'user' e 'assistant'. Convertemos o fluxo de
  // function calling (estilo OpenAI) para o formato de blocos da Anthropic:
  //  - assistant que pediu tools  -> content[] com blocos tool_use
  //  - mensagem 'tool'/'function' -> role 'user' com bloco tool_result
  const anthropicMessages: Array<Record<string, unknown>> = [];
  let systemPrompt: string | undefined;

  for (const message of messages) {
    if (message.role === "system") {
      systemPrompt = asPlainText(message.content);
      continue;
    }

    if (message.role === "tool" || message.role === "function") {
      anthropicMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id,
            content: asPlainText(message.content),
          },
        ],
      });
      continue;
    }

    if (message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0) {
      const blocks: Array<Record<string, unknown>> = [];
      // REPLAY do extended thinking: blocos assinados do turno anterior devem
      // voltar PRIMEIRO e intactos, senão a API rejeita o tool loop com thinking.
      if (message.thinking_blocks?.length) {
        blocks.push(...(message.thinking_blocks as Array<Record<string, unknown>>));
      }
      const text = asPlainText(message.content);
      if (text.trim().length > 0) {
        blocks.push({ type: "text", text });
      }
      for (const call of message.tool_calls) {
        let input: unknown = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          input = {};
        }
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input,
        });
      }
      anthropicMessages.push({ role: "assistant", content: blocks });
      continue;
    }

    const normalized = normalizeMessage(message);
    anthropicMessages.push({
      role: normalized.role,
      content: (normalized as { content: unknown }).content,
    });
  }

  // Preparar tools para API do Anthropic (formato diferente)
  const toolList = tools?.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description || "Tool",
    input_schema: tool.function.parameters || { type: "object", properties: {} },
  })) || undefined;

  // Preparar payload para Anthropic
  const requestedMax = max_tokens || maxTokens || 4096;
  const payload: Record<string, unknown> = {
    model: model || MODELS.smart,
    max_tokens: requestedMax,
    messages: anthropicMessages,
  };

  // Extended thinking: exige max_tokens > budget e tool_choice não-forçado.
  // Com schema estruturado (tool forçada), thinking é silenciosamente ignorado.
  const thinkingEnabled = !!thinking && !structuredSchema;
  if (thinkingEnabled) {
    const budget = Math.max(1024, thinking!.budgetTokens);
    payload.thinking = { type: "enabled", budget_tokens: budget };
    if (requestedMax <= budget) payload.max_tokens = budget + 8000;
  }

  if (systemPrompt) {
    // Prompt caching: um breakpoint no bloco de system cacheia TOOLS + SYSTEM
    // (render: tools → system → messages). O prefixo estável (prompt + ~22 schemas
    // + memória) para de ser cobrado cheio a cada turno/mensagem (~0,1x na releitura).
    payload.system = [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ];
  }

  // Nome da tool sintética usada para saída estruturada (se aplicável).
  let structuredToolName: string | undefined;

  if (toolList && toolList.length > 0) {
    payload.tools = toolList;

    // Anthropic exige tool_choice sempre como objeto (nunca string)
    const normalizedToolChoice = normalizeToolChoice(
      toolChoice || tool_choice,
      tools
    );
    if (normalizedToolChoice === "auto") {
      payload.tool_choice = { type: "auto" };
    } else if (normalizedToolChoice === "none") {
      payload.tool_choice = { type: "none" };
    } else if (normalizedToolChoice) {
      // forçar tool específica
      payload.tool_choice = {
        type: "tool",
        name: (normalizedToolChoice as any).function.name,
      };
    }
  } else if (structuredSchema) {
    // Sem tools explícitas, mas com schema de saída: cria uma tool sintética e
    // força o Claude a chamá-la, garantindo o formato estruturado.
    structuredToolName = structuredSchema.name || "structured_output";
    payload.tools = [
      {
        name: structuredToolName,
        description:
          "Retorne o resultado preenchendo EXATAMENTE os campos do schema.",
        input_schema: structuredSchema.schema,
      },
    ];
    payload.tool_choice = { type: "tool", name: structuredToolName };
  }

  // Ferramenta NATIVA de pesquisa web da Anthropic (server-side). Não é roteada
  // pelo nosso loop de tools — a Anthropic executa a busca e devolve texto com
  // citações. Não combina com saída estruturada forçada (structuredToolName).
  if (webSearch && !structuredToolName) {
    const existing = (payload.tools as Array<Record<string, unknown>> | undefined) ?? [];
    payload.tools = [
      ...existing,
      { type: "web_search_20250305", name: "web_search", max_uses: webSearchMaxUses ?? 5 },
    ];
    // Garante que o modelo PODE escolher pesquisar (nunca força).
    if (!payload.tool_choice) payload.tool_choice = { type: "auto" };
  }

  // Chamar API Anthropic
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": ENV.anthropicApiKey!,
    "anthropic-version": "2023-06-01",
  };
  // Interleaved thinking: permite raciocinar ENTRE chamadas de tool (analisar o
  // resultado de uma tool antes de decidir a próxima) — essencial p/ análises
  // multi-fonte (mercado → comex → cálculo).
  if (thinkingEnabled && payload.tools) {
    headers["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = await response.json() as any;

  // Medição de tokens/custo (fire-and-forget; inclui cache read/write).
  if (result.usage) {
    void recordLlmUsage({
      model: result.model ?? (model || MODELS.smart),
      promptTokens: result.usage.input_tokens ?? 0,
      completionTokens: result.usage.output_tokens ?? 0,
      cacheCreationTokens: result.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: result.usage.cache_read_input_tokens ?? 0,
    }).catch(() => {});
  }

  // Converter resposta Anthropic para formato genérico InvokeResult
  const toolCalls = result.content
    ?.filter((block: any) => block.type === "tool_use")
    .map((block: any) => ({
      id: block.id,
      type: "function" as const,
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input),
      },
    })) || [];

  // Blocos de thinking CRUS (assinados) — o chamador replaya no próximo turno.
  const thinkingBlocks = (result.content ?? []).filter(
    (block: any) => block.type === "thinking" || block.type === "redacted_thinking",
  );

  // Concatena TODOS os blocos de texto (a pesquisa web devolve a resposta em
  // múltiplos blocos com citações; pegar só o primeiro perderia conteúdo).
  let textContent = (result.content ?? [])
    .filter((block: any) => block.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text)
    .join("") || "";

  // Saída estruturada: o JSON vem como input da tool sintética. Devolvemos como
  // string em content (e limpamos tool_calls) para o chamador fazer JSON.parse.
  if (structuredToolName) {
    const structuredBlock = result.content?.find(
      (block: any) => block.type === "tool_use" && block.name === structuredToolName
    );
    if (structuredBlock) {
      textContent = JSON.stringify(structuredBlock.input);
      toolCalls.length = 0;
    }
  }

  return {
    id: result.id,
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent,
          ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
          ...(thinkingBlocks.length > 0 && { thinking_blocks: thinkingBlocks }),
        },
        finish_reason: result.stop_reason === "tool_use" ? "tool_calls" : result.stop_reason,
      },
    ],
    usage: result.usage
      ? {
          prompt_tokens: result.usage.input_tokens,
          completion_tokens: result.usage.output_tokens,
          total_tokens: result.usage.input_tokens + result.usage.output_tokens,
        }
      : undefined,
  };
}
