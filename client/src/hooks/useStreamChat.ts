import { useState, useCallback } from "react";
import type { StreamChunk } from "@/types/stream";

interface UseStreamChatOptions {
  conversaId: number;
  operacaoId?: number;
  estagio?: string;
  token: string;
}

interface StreamState {
  reply: string;
  toolsUsed: string[];
  toolResults: Array<{ name: string; ok: boolean; data?: unknown }>;
  isLoading: boolean;
  error?: string;
  chunks: StreamChunk[]; // para debug/detalhes
}

export function useStreamChat({ conversaId, operacaoId, estagio, token }: UseStreamChatOptions) {
  const [state, setState] = useState<StreamState>({
    reply: "",
    toolsUsed: [],
    toolResults: [],
    isLoading: false,
    chunks: [],
  });

  const sendMessage = useCallback(
    async (messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) => {
      setState((prev) => ({
        ...prev,
        reply: "",
        toolsUsed: [],
        toolResults: [],
        isLoading: true,
        error: undefined,
        chunks: [],
      }));

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversaId,
            messages,
            operacaoId,
            estagio,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error("Nenhum stream disponível");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events (formato: data: {...}\n\n)
          const events = buffer.split("\n\n");
          buffer = events.pop() || ""; // Último item pode estar incompleto

          for (const event of events) {
            if (!event.startsWith("data: ")) continue;

            const jsonStr = event.slice(6); // Remove "data: "
            try {
              const chunk: StreamChunk = JSON.parse(jsonStr);

              setState((prev) => {
                const newState = { ...prev, chunks: [...prev.chunks, chunk] };

                if (chunk.type === "reply") {
                  newState.reply = chunk.reply;
                  newState.toolsUsed = chunk.toolsUsed;
                  newState.toolResults = chunk.toolResults;
                  newState.isLoading = false;
                } else if (chunk.type === "tool_result") {
                  // Opcional: atualizar com progresso de tool
                } else if (chunk.type === "done") {
                  newState.isLoading = false;
                } else if (chunk.type === "error") {
                  newState.error = chunk.message;
                  newState.isLoading = false;
                }

                return newState;
              });
            } catch (err) {
              console.warn("Erro ao parsear chunk SSE:", err, jsonStr);
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        setState((prev) => ({
          ...prev,
          error: message,
          isLoading: false,
        }));
      }
    },
    [conversaId, operacaoId, estagio, token]
  );

  return {
    ...state,
    sendMessage,
  };
}
