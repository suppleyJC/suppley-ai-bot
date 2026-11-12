export interface PendingMessage {
  id: string;
  content: string;
  conversationId?: number;
  previousIds: number[];
}

/** Only a newly persisted user message can replace its provisional bubble. */
export function visiblePendingMessages(
  pending: PendingMessage[],
  saved: Array<{ id: number; role: string; content: string }>,
  conversationId?: number,
) {
  return pending.filter(p => p.conversationId === conversationId && !saved.some(
    m => m.role === "user" && m.content === p.content && !p.previousIds.includes(m.id),
  ));
}
