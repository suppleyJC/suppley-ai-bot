import { ENV } from "./env";

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

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  /** Presente em mensagens do assistente que pediram ferramentas (function calling). */
  tool_calls?: ToolCall[];
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
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

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
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
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
): TextContent | ImageContent | FileContent => {
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
  } = params;

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
  const payload: Record<string, unknown> = {
    model: "claude-opus-4-8",
    max_tokens: max_tokens || maxTokens || 4096,
    messages: anthropicMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

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
  }

  // Chamar API Anthropic
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = await response.json() as any;

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

  const textContent = result.content
    ?.find((block: any) => block.type === "text")
    ?.text || "";

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
