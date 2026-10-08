export type StreamChunk =
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; ok: boolean; summary: string }
  | {
      type: "reply";
      reply: string;
      toolsUsed: string[];
      toolResults: Array<{ name: string; ok: boolean; data?: unknown }>;
    }
  | { type: "error"; message: string }
  | { type: "done" };
