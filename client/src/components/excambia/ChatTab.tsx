import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import {
  Send, Loader2, Upload, ExternalLink, Plus,
} from "lucide-react";
import { Streamdown } from "streamdown";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: Date;
  toolsUsed?: string[];
  linkedOperacaoId?: number | null;
}

interface QuickAction {
  icon: any;
  label: string;
  color: string;
  action: () => void;
}

interface ChatTabProps {
  messages: ChatMessage[];
  inputMessage: string;
  setInputMessage: (msg: string) => void;
  isTyping: boolean;
  uploadingFile: boolean;
  onSendMessage: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  quickActions: QuickAction[];
  /** Sidebar de conversas (Fase 3) — renderizada à esquerda no desktop. */
  sidebar?: React.ReactNode;
  /** Barra de contexto da operação vinculada (Fase 3) — acima das mensagens. */
  topBar?: React.ReactNode;
  /** Abre a operação no Painel (botão de ação dentro da mensagem). */
  onOpenOperacao?: (operacaoId: number) => void;
  /** Cria uma operação a partir da conversa (botão de ação dentro da mensagem). */
  onCreateOperacao?: () => void;
}

export function ChatTab({
  messages,
  inputMessage,
  setInputMessage,
  isTyping,
  uploadingFile,
  onSendMessage,
  onFileUpload,
  onKeyPress,
  quickActions,
  sidebar,
  topBar,
  onOpenOperacao,
  onCreateOperacao,
}: ChatTabProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <TabsContent
      value="chat"
      className="flex-1 flex flex-col overflow-hidden m-0 p-0"
      style={{ height: 'calc(100vh - 240px)', minHeight: '400px' }}
    >
     <div className="flex h-full min-h-0">
      {sidebar && (
        <aside className="hidden md:flex w-64 shrink-0 h-full min-h-0">
          {sidebar}
        </aside>
      )}
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {topBar}
        {/* Messages Area - responsive padding and max-width */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 lg:px-8"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#682ABA transparent',
          }}
        >
          <div className="space-y-3 sm:space-y-4 max-w-3xl mx-auto w-full">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm transition-all ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-[#311260] to-[#682ABA] text-white max-w-[85%] sm:max-w-[75%] lg:max-w-[65%]"
                      : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-w-[90%] sm:max-w-[80%] lg:max-w-[75%]"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:text-xs [&_code]:text-xs">
                      <Streamdown>{msg.content}</Streamdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm sm:text-base break-words">{msg.content}</div>
                  )}
                  {msg.timestamp && (
                    <div
                      className={`text-[10px] mt-1.5 sm:mt-2 ${
                        msg.role === "user"
                          ? "text-purple-200"
                          : "text-muted-foreground"
                      }`}
                    >
                      {msg.timestamp.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}

                  {/* Botões de ação na mensagem (Fase 3): guiados pelas tools
                      acionadas. Só navegam (Ver no Painel) ou criam+vinculam
                      uma operação (aditivo) — nada destrutivo automático. */}
                  {msg.role === "assistant" && (msg.toolsUsed?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-700 pt-2">
                      {msg.linkedOperacaoId ? (
                        <Button
                          variant="outline" size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => onOpenOperacao?.(msg.linkedOperacaoId!)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ver no Painel
                        </Button>
                      ) : (
                        <Button
                          variant="outline" size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => onCreateOperacao?.()}
                        >
                          <Plus className="h-3.5 w-3.5" /> Criar operação desta conversa
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm text-muted-foreground ml-1">Excambia está pensando...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Quick Actions - shown only when conversation is fresh */}
        {messages.length <= 1 && (
          <div className="px-3 pb-2 sm:px-4 md:px-6 lg:px-8 shrink-0">
            <div className="max-w-3xl mx-auto">
              <p className="text-xs text-muted-foreground mb-2">Ações rápidas:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {quickActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.action}
                    className={`p-2.5 sm:p-3 rounded-xl bg-gradient-to-r ${action.color} text-white text-left hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm`}
                  >
                    <action.icon className="h-4 w-4 sm:h-5 sm:w-5 mb-1" />
                    <span className="text-[11px] sm:text-xs font-medium leading-tight block">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input Area - sticky bottom with safe area for mobile keyboards */}
        <div className="shrink-0 p-3 sm:p-4 border-t bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm safe-area-bottom">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 items-end">
              <input
                type="file"
                ref={fileInputRef}
                onChange={onFileUpload}
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || isTyping}
                className="shrink-0 h-10 w-10 sm:h-10 sm:w-10 rounded-xl"
                title="Enviar arquivo"
              >
                {uploadingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
              <div className="flex-1 relative">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={onKeyPress}
                  placeholder="Digite sua mensagem..."
                  disabled={isTyping}
                  className="pr-2 h-10 sm:h-10 rounded-xl text-sm sm:text-base"
                />
              </div>
              <Button
                onClick={onSendMessage}
                disabled={!inputMessage.trim() || isTyping}
                className="shrink-0 h-10 w-10 sm:h-10 sm:w-auto sm:px-4 rounded-xl bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
                title="Enviar mensagem"
              >
                {isTyping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline ml-2 text-sm">Enviar</span>
                  </>
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center hidden sm:block">
              Pressione Enter para enviar • Shift+Enter para nova linha
            </p>
          </div>
        </div>
      </div>
     </div>
    </TabsContent>
  );
}
