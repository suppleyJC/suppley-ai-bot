/**
 * OpenAI Service - Integração direta com OpenAI API
 * Permite uso de API key própria do usuário para independência do Manus
 */

import { getDb } from "../db";
import { companySettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

// Interface para mensagens do chat
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{
    type: "text" | "image_url" | "file_url";
    text?: string;
    image_url?: { url: string; detail?: "auto" | "low" | "high" };
    file_url?: { url: string; mime_type?: string };
  }>;
}

// Interface para resposta do LLM
export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Configuração padrão
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Busca a API key do OpenAI nas configurações do usuário
 */
async function getOpenAIApiKey(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const settings = await db
    .select({ openaiApiKey: companySettings.openaiApiKey })
    .from(companySettings)
    .where(eq(companySettings.userId, userId))
    .limit(1);

  return settings[0]?.openaiApiKey || null;
}

/**
 * Chama a OpenAI API diretamente
 */
async function callOpenAIDirect(
  apiKey: string,
  messages: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<LLMResponse> {
  const model = options?.model || DEFAULT_MODEL;
  const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;
  const temperature = options?.temperature ?? 0.7;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error?.message || `OpenAI API error: ${response.status}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  return {
    content,
    model: data.model,
    usage: data.usage,
  };
}

/**
 * Chama o LLM usando a API key própria do usuário (OpenAI) ou,
 * por padrão, a IA do sistema (Anthropic/Claude via invokeLLM).
 */
export async function invokeLLMWithUserKey(
  userId: number,
  messages: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<LLMResponse> {
  // Tenta buscar API key do usuário
  const userApiKey = await getOpenAIApiKey(userId);

  if (userApiKey) {
    // Usa OpenAI diretamente com a key do usuário
    console.log("[OpenAI] Using user's dedicated API key");
    return callOpenAIDirect(userApiKey, messages, options);
  }

  // Padrão: IA do sistema (Anthropic/Claude)
  console.log("[Excambia] Usando IA do sistema (Claude)");
  const response = await invokeLLM({
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content as string,
    })),
  });

  const content = response.choices?.[0]?.message?.content;
  return {
    content: typeof content === "string" ? content : "",
    model: "claude-opus-4-8",
    usage: response.usage,
  };
}

/**
 * Valida se uma API key é válida fazendo uma chamada de teste
 */
export async function validateOpenAIApiKey(apiKey: string): Promise<{
  valid: boolean;
  error?: string;
  models?: string[];
}> {
  try {
    // Tenta listar modelos para validar a key
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: error.error?.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const gptModels = data.data
      ?.filter((m: { id: string }) => m.id.includes("gpt"))
      ?.map((m: { id: string }) => m.id)
      ?.slice(0, 10);

    return {
      valid: true,
      models: gptModels,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Salva a API key do OpenAI nas configurações do usuário
 */
export async function saveOpenAIApiKey(
  userId: number,
  apiKey: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Verifica se já existe configuração
  const existing = await db
    .select({ id: companySettings.id })
    .from(companySettings)
    .where(eq(companySettings.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    // Atualiza
    await db
      .update(companySettings)
      .set({ openaiApiKey: apiKey })
      .where(eq(companySettings.userId, userId));
  } else {
    // Insere
    await db.insert(companySettings).values({
      userId,
      openaiApiKey: apiKey,
      companyName: "",
      taxRegime: "lucro_real",
    });
  }

  return true;
}

/**
 * Remove a API key do OpenAI das configurações do usuário
 */
export async function removeOpenAIApiKey(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db
    .update(companySettings)
    .set({ openaiApiKey: null })
    .where(eq(companySettings.userId, userId));

  return true;
}

/**
 * Verifica se o usuário tem API key configurada
 */
export async function hasOpenAIApiKey(userId: number): Promise<boolean> {
  const key = await getOpenAIApiKey(userId);
  return !!key;
}
