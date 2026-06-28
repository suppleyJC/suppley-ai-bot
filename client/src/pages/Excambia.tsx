import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getStoredToken } from "@/lib/authToken";
import type { StreamChunk } from "@/types/stream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Bot, Send, Loader2, Upload, FileText, Image as ImageIcon,
  Sparkles, TrendingUp, TrendingDown, Calculator, MessageSquare, Lightbulb,
  CheckCircle, AlertTriangle, XCircle, ArrowRight, Bell, Activity,
  Brain, Target, Shield, Zap, BarChart3, RefreshCw, ArrowUpRight,
  ArrowDownRight, Minus, Globe, DollarSign, Package, Users, Settings2
} from "lucide-react";
import { ChatTab } from "@/components/excambia/ChatTab";
import { ConversationSidebar } from "@/components/excambia/ConversationSidebar";
import { ConversaOperacaoBar } from "@/components/excambia/ConversaOperacaoBar";
import { toast } from "sonner";
import { MessageContent } from "@/components/MessageContent";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: Date;
  /** Ferramentas acionadas pela Excambia nesta resposta (Fase 3) — guiam os botões de ação. */
  toolsUsed?: string[];
  /** Operação vinculada no momento da resposta (para o botão "Ver no Painel"). */
  linkedOperacaoId?: number | null;
  /** Arquivo gerado (planilha/PDF) para download direto na mensagem. */
  downloadUrl?: string;
  downloadName?: string;
  /** Em streaming: mensagem provisória sendo construída via SSE. */
  streaming?: boolean;
  /** Status transitório durante o streaming ("Pensando...", "Executando: ..."). */
  statusText?: string;
}

/** Mensagem de boas-vindas exibida em conversas novas (sem histórico). */
const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content: `Olá! 👋 Sou a **Excambia** — Inteligência Agêntica para Comércio Exterior.

Sou sua consultora especialista em comércio exterior, integrada a todas as funções do Excambia. Posso ajudá-lo com:

🔮 **Análise Preditiva** — Correlações de mercado e janelas de oportunidade
📊 **Análise de Cotações** — Envie documentos para extração e análise automática
💰 **Viabilidade Financeira** — Verifico se o preço FOB é viável para seu negócio
🤝 **Estratégias de Negociação** — Sugiro argumentos para negociar com fornecedores
📈 **Insights de BI** — Identifico padrões no seu histórico de importações
⚡ **Alertas Inteligentes** — Monitoro câmbio e oportunidades em tempo real

Como posso ajudá-lo hoje?`,
  timestamp: new Date(),
};

interface MarketIndicator {
  name: string;
  value: number;
  trend: "up" | "down" | "stable";
  impact: "positive" | "negative" | "neutral";
  description: string;
}

interface Correlation {
  variable1: string;
  variable2: string;
  coefficient: number;
  strength: "strong" | "moderate" | "weak";
  interpretation: string;
}

interface TrendPrediction {
  indicator: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  timeframe: string;
  direction: "up" | "down" | "stable";
  recommendation: string;
}

interface OpportunityWindow {
  type: "exchange" | "commodity" | "seasonal" | "regulatory";
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  potentialSavings: number;
  confidence: number;
  actionRequired: string;
}

interface SystemicAnalysis {
  timestamp: Date;
  marketIndicators: MarketIndicator[];
  correlations: Correlation[];
  predictions: TrendPrediction[];
  opportunities: OpportunityWindow[];
  riskFactors: string[];
  strategicInsights: string[];
  overallOutlook: "bullish" | "bearish" | "neutral";
  confidenceScore: number;
}

export default function Excambia() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [systemicAnalysis, setSystemicAnalysis] = useState<SystemicAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // ── Conversas (Fase 3) ──────────────────────────────────────────────────
  // `activeConversaId === null` → histórico legado (mensagens pré-Fase 3) ou
  // conversa nova ainda não persistida. O ref espelha o estado para os callbacks
  // das mutations (que rodam fora do ciclo de render).
  const [activeConversaId, setActiveConversaIdState] = useState<number | null>(null);
  const activeConversaIdRef = useRef<number | null>(null);
  const setActiveConversaId = (id: number | null) => {
    activeConversaIdRef.current = id;
    setActiveConversaIdState(id);
  };
  const [legacyLoaded, setLegacyLoaded] = useState(false);

  // Histórico legado (mensagens sem conversa) — carregado só quando se está na
  // visão "Histórico anterior" (activeConversaId === null).
  const { data: legacyHistory } = trpc.excambia.getChatHistory.useQuery(undefined, {
    enabled: activeConversaId === null && !legacyLoaded,
  });

  useEffect(() => {
    if (activeConversaId !== null || legacyLoaded) return;
    if (legacyHistory && legacyHistory.length > 0) {
      setMessages(legacyHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
        timestamp: new Date(msg.createdAt),
      })));
      setLegacyLoaded(true);
    } else if (legacyHistory && legacyHistory.length === 0) {
      setLegacyLoaded(true);
    }
  }, [legacyHistory, legacyLoaded, activeConversaId]);

  // Mensagens da conversa selecionada.
  const { data: conversaMessages } = trpc.excambia.getConversaMessages.useQuery(
    { conversaId: activeConversaId ?? 0 },
    { enabled: activeConversaId !== null },
  );

  // Detalhe da conversa ativa (inclui o vínculo com a operação).
  const { data: activeConversa } = trpc.excambia.getConversa.useQuery(
    { conversaId: activeConversaId ?? 0 },
    { enabled: activeConversaId !== null },
  );

  // Hidrata as mensagens do DB UMA vez por conversa selecionada. Evita que um
  // refetch (disparado ao criar a conversa no 1º envio) sobrescreva as mensagens
  // otimistas já em tela.
  const hydratedConversaRef = useRef<number | null>(null);
  useEffect(() => {
    if (activeConversaId === null || !conversaMessages) return;
    if (hydratedConversaRef.current === activeConversaId) return;
    hydratedConversaRef.current = activeConversaId;
    setMessages(
      conversaMessages.length > 0
        ? conversaMessages.map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: new Date(msg.criadaEm),
          }))
        : [WELCOME_MESSAGE],
    );
  }, [conversaMessages, activeConversaId]);

  // Trocar de conversa: abre uma conversa existente (ou o histórico legado).
  const handleSelectConversa = (id: number | null) => {
    setActiveConversaId(id);
    if (id === null) {
      setLegacyLoaded(false); // recarrega o histórico legado
      setMessages([WELCOME_MESSAGE]);
    }
  };

  // Nova conversa: limpa a tela. A conversa só é persistida no primeiro envio.
  const handleNewConversa = () => {
    setActiveConversaId(null);
    setLegacyLoaded(true); // não puxa o histórico legado numa conversa nova
    setMessages([WELCOME_MESSAGE]);
  };

  const createConversaMutation = trpc.excambia.createConversa.useMutation();

  // ── Ações chat → Painel (compartilhadas pela barra de contexto e pelos
  //    botões dentro das mensagens) ────────────────────────────────────────
  const [, navigate] = useLocation();
  const createOpMutation = trpc.operations.create.useMutation();
  const linkConversaMutation = trpc.excambia.linkConversaOperacao.useMutation();

  // Espelha o vínculo da conversa para os callbacks das mutations de chat.
  const linkedOpIdRef = useRef<number | null>(null);
  useEffect(() => {
    linkedOpIdRef.current = activeConversa?.operacaoId ?? null;
  }, [activeConversa]);

  const openOperacao = (id: number) => navigate(`/operacao/${id}`);

  // Cria uma operação a partir da conversa atual e a vincula (chat → Painel).
  const createOperacaoFromConversa = async () => {
    if (!activeConversaId) return;
    const titulo = (activeConversa?.titulo || "Operação do chat").slice(0, 255);
    const op = await createOpMutation.mutateAsync({ titulo });
    if (op?.id) {
      await linkConversaMutation.mutateAsync({
        conversaId: activeConversaId, operacaoId: op.id, estagio: op.estagioAtual as any,
      });
      utils.operations.list.invalidate();
      utils.excambia.getConversa.invalidate({ conversaId: activeConversaId });
      utils.excambia.listConversas.invalidate();
      toast.success("Operação criada e vinculada à conversa");
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Queries
  const { data: hasApiKey } = trpc.excambia.hasApiKey.useQuery();
  const { data: alerts, isLoading: loadingAlerts } = trpc.agent.getAlerts.useQuery();
  const { data: unreadAlerts } = trpc.agent.getUnreadAlerts.useQuery();
  const { data: actions, isLoading: loadingActions } = trpc.agent.getActions.useQuery();
  const { data: marketAnalysis, isLoading: loadingMarket } = trpc.agent.analyzeMarket.useQuery();
  // Stats will be calculated from quotations list
  const { data: quotationsList } = trpc.quotations.list.useQuery({ limit: 100 });
  const quotationStats = {
    total: quotationsList?.length || 0,
    viable: quotationsList?.filter((q: any) => q.status === 'approved').length || 0,
    analyzing: quotationsList?.filter((q: any) => q.status === 'pending').length || 0,
  };
  const { data: usdRate } = trpc.exchange.getRate.useQuery({ from: 'USD', to: 'BRL' });
  const { data: eurRate } = trpc.exchange.getRate.useQuery({ from: 'EUR', to: 'BRL' });
  const { data: cnyRate } = trpc.exchange.getRate.useQuery({ from: 'CNY', to: 'BRL' });
  const exchangeRates = {
    USD: usdRate?.rate,
    EUR: eurRate?.rate,
    CNY: cnyRate?.rate,
  };

  // Save message mutation
  const saveMessageMutation = trpc.excambia.saveChatMessage.useMutation();

  // Persiste a resposta do assistente na conversa ativa (se já houver uma).
  const persistAssistant = (content: string) => {
    const conversaId = activeConversaIdRef.current;
    saveMessageMutation.mutate({
      role: "assistant",
      content,
      ...(conversaId ? { conversaId } : {}),
    });
    if (conversaId) utils.excambia.listConversas.invalidate();
  };

  // Chat mutation (legado, não-streaming) — mantido como referência/fallback.
  // O envio principal agora usa streamChat() via SSE (SPRINT 3).
  const chatMutation = trpc.excambia.agentChat.useMutation({
    onMutate: () => setIsTyping(true),
    onSuccess: (data) => {
      // Transparência: indica quando o motor certificado (ou outra tool) foi acionado
      const tools = data.toolsUsed ?? [];
      const toolNote = tools.length > 0
        ? `\n\n_⚙️ Ferramentas acionadas: ${tools.join(", ")}_`
        : "";
      const content = (data.reply || "") + toolNote;

      // Arquivo gerado pela tool de relatório → botão de download na mensagem.
      const relatorio = (data.toolResults ?? []).find(
        (t) => t.name === "gerar_relatorio_calculo" && t.ok && t.data,
      );
      const dl = relatorio?.data as { url?: string; fileName?: string } | undefined;

      const assistantMessage = {
        role: "assistant" as const,
        content,
        timestamp: new Date(),
        toolsUsed: tools,
        linkedOperacaoId: linkedOpIdRef.current,
        downloadUrl: dl?.url,
        downloadName: dl?.fileName,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      persistAssistant(content);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao processar mensagem");
    },
    onSettled: () => setIsTyping(false),
  });

  // Document analysis mutation
  const analyzeMutation = trpc.excambia.analyzeDocument.useMutation({
    onMutate: () => setIsTyping(true),
    onSuccess: (data) => {
      const assistantMessage = {
        role: "assistant" as const,
        content: data.analysis,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      persistAssistant(data.analysis);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao analisar documento");
    },
    onSettled: () => setIsTyping(false),
  });

  // Alert mutations
  const markReadMutation = trpc.agent.markAlertRead.useMutation({
    onSuccess: () => {
      utils.agent.getAlerts.invalidate();
      utils.agent.getUnreadAlerts.invalidate();
    },
  });

  const markAllReadMutation = trpc.agent.markAllAlertsRead.useMutation({
    onSuccess: () => {
      utils.agent.getAlerts.invalidate();
      utils.agent.getUnreadAlerts.invalidate();
      toast.success("Todos os alertas marcados como lidos");
    },
  });

  const dismissMutation = trpc.agent.dismissAlert.useMutation({
    onSuccess: () => {
      utils.agent.getAlerts.invalidate();
      toast.success("Alerta removido");
    },
  });

  const checkExchangeMutation = trpc.agent.checkExchangeAlerts.useMutation({
    onSuccess: (alerts) => {
      utils.agent.getAlerts.invalidate();
      utils.agent.getUnreadAlerts.invalidate();
      if (alerts.length > 0) {
        toast.success(`${alerts.length} alerta(s) gerado(s)`);
      } else {
        toast.info("Nenhum alerta gerado - câmbio dentro dos limites");
      }
    },
  });

  const systemicAnalysisMutation = trpc.agent.generateSystemicAnalysis.useMutation({
    onSuccess: (analysis) => {
      setSystemicAnalysis(analysis as SystemicAnalysis);
      toast.success("Análise sistêmica concluída!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao gerar análise");
    },
  });

  // Garante que exista uma conversa persistida antes de salvar mensagens.
  // Numa conversa nova (activeConversaId === null e não é o histórico legado),
  // cria a conversa usando o texto como título. Devolve o conversaId (ou null
  // se não houver conexão/DB).
  const ensureConversa = async (firstText: string): Promise<number | null> => {
    if (activeConversaIdRef.current) return activeConversaIdRef.current;
    const titulo = firstText.trim().slice(0, 60) || "Nova conversa";
    const conv = await createConversaMutation.mutateAsync({ titulo });
    const id = conv?.id ?? null;
    if (id) {
      // Marca como já hidratada para a hidratação do DB não limpar as mensagens
      // otimistas que acabaram de ser enviadas nesta conversa recém-criada.
      hydratedConversaRef.current = id;
      setActiveConversaId(id);
      utils.excambia.listConversas.invalidate();
    }
    return id;
  };

  // Rótulos amigáveis das tools para o status de streaming.
  const toolLabel = (name: string): string => {
    const map: Record<string, string> = {
      montar_calculo: "calculando custos",
      gerar_relatorio_calculo: "gerando relatório",
      classificar_ncm: "classificando NCM",
      comparar_cotacoes: "comparando cotações",
      enviar_rfq: "enviando RFQ",
      registrar_cotacao: "registrando cotação",
      registrar_marco_producao: "registrando marco",
      registrar_nacionalizacao: "registrando nacionalização",
      lancar_financeiro: "lançando financeiro",
      coletar_dados_faltantes: "verificando o que falta",
      buscar_ativo: "buscando ativo",
      comparar_origem: "comparando origens",
      benchmark_mercado: "consultando mercado (BCB)",
    };
    return map[name] || name;
  };

  /**
   * Envio com STREAMING (SPRINT 3): consome /api/chat/stream via SSE, exibindo
   * o progresso das ferramentas em tempo real até a resposta final. A persistência
   * (mensagem do usuário e da Excambia) é feita pelo próprio endpoint em
   * conversaMensagens — a mesma tabela que o histórico lê.
   */
  const streamChat = async (
    conversaId: number,
    history: ChatMessage[],
  ): Promise<void> => {
    setIsTyping(true);

    // Mensagem provisória da Excambia (atualizada conforme os chunks chegam).
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", streaming: true, statusText: "Pensando...", timestamp: new Date() },
    ]);

    const updateStreaming = (patch: Partial<ChatMessage>) =>
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].streaming) {
            next[i] = { ...next[i], ...patch };
            break;
          }
        }
        return next;
      });

    try {
      const token = getStoredToken();
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          conversaId,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          ...(activeConversa?.operacaoId ? { operacaoId: activeConversa.operacaoId } : {}),
          ...(activeConversa?.estagio ? { estagio: activeConversa.estagio } : {}),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(event.slice(6));
          } catch {
            continue;
          }

          if (chunk.type === "thinking") {
            updateStreaming({ statusText: "Pensando..." });
          } else if (chunk.type === "tool_call") {
            updateStreaming({ statusText: `Excambia está ${toolLabel(chunk.name)}...` });
          } else if (chunk.type === "tool_result") {
            updateStreaming({
              statusText: chunk.ok
                ? `✓ ${toolLabel(chunk.name)}`
                : `⚠️ falha em ${toolLabel(chunk.name)}`,
            });
          } else if (chunk.type === "reply") {
            const tools = chunk.toolsUsed ?? [];
            const toolNote = tools.length > 0
              ? `\n\n_⚙️ Ferramentas acionadas: ${tools.join(", ")}_`
              : "";
            const relatorio = (chunk.toolResults ?? []).find(
              (t) => t.name === "gerar_relatorio_calculo" && t.ok && t.data,
            );
            const dl = relatorio?.data as { url?: string; fileName?: string } | undefined;
            updateStreaming({
              content: (chunk.reply || "") + toolNote,
              toolsUsed: tools,
              linkedOperacaoId: linkedOpIdRef.current,
              downloadUrl: dl?.url,
              downloadName: dl?.fileName,
              streaming: false,
              statusText: undefined,
            });
          } else if (chunk.type === "error") {
            updateStreaming({
              content: "Tive um problema ao processar. Pode tentar de novo?",
              streaming: false,
              statusText: undefined,
            });
            toast.error(chunk.message || "Erro ao processar mensagem");
          }
        }
      }

      // Sincroniza a sidebar (ordem por atividade recente) e o histórico persistido.
      utils.excambia.listConversas.invalidate();
    } catch (err) {
      updateStreaming({
        content: "Não consegui me conectar agora. Tente novamente em instantes.",
        streaming: false,
        statusText: undefined,
      });
      toast.error(err instanceof Error ? err.message : "Erro de conexão");
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isTyping) return;

    const text = inputMessage;
    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const history = [...messages, userMessage];
    setMessages(history);
    setInputMessage("");

    const conversaId = await ensureConversa(text);
    if (!conversaId) {
      toast.error("Não consegui iniciar a conversa. Tente novamente.");
      return;
    }

    // Streaming (SPRINT 3): o endpoint persiste usuário + resposta em conversaMensagens.
    await streamChat(conversaId, history);
  };

  // Upload mutation
  const uploadMutation = trpc.calculations.uploadQuotation.useMutation();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de arquivo não suportado. Use PDF, JPEG, PNG ou WebP.");
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 16MB.");
      return;
    }

    setUploadingFile(true);

    try {
      // Convert file to base64
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      // Use tRPC mutation for upload
      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });

      const url = result.fileUrl;

      const userMessage: ChatMessage = {
        role: "user",
        content: `📎 Enviei o arquivo: **${file.name}**\n\nPor favor, analise este documento.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const conversaId = await ensureConversa(`Análise: ${file.name}`);

      // Save user message to database
      saveMessageMutation.mutate({
        role: "user",
        content: userMessage.content,
        ...(conversaId ? { conversaId } : {}),
      });

      analyzeMutation.mutate({
        documentUrl: url,
        mimeType: file.type,
        question: "Analise este documento de cotação. Extraia os produtos, preços, condições comerciais e qualquer informação relevante para cálculo de importação.",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao fazer upload do arquivo");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up": return <ArrowUpRight className="h-4 w-4 text-green-500" />;
      case "down": return <ArrowDownRight className="h-4 w-4 text-red-500" />;
      case "stable": return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getImpactColor = (impact: "positive" | "negative" | "neutral") => {
    switch (impact) {
      case "positive": return "text-green-600 bg-green-50 dark:bg-green-950/30";
      case "negative": return "text-red-600 bg-red-50 dark:bg-red-950/30";
      case "neutral": return "text-gray-600 bg-gray-50 dark:bg-gray-950/30";
    }
  };

  const getOutlookInfo = (outlook: "bullish" | "bearish" | "neutral") => {
    switch (outlook) {
      case "bullish": return { label: "Otimista", color: "text-green-600", bgColor: "bg-green-500", icon: TrendingUp };
      case "bearish": return { label: "Pessimista", color: "text-red-600", bgColor: "bg-red-500", icon: TrendingDown };
      case "neutral": return { label: "Neutro", color: "text-gray-600", bgColor: "bg-gray-500", icon: Minus };
    }
  };

  const getOpportunityTypeIcon = (type: string) => {
    switch (type) {
      case "exchange": return <DollarSign className="h-5 w-5 text-blue-500" />;
      case "commodity": return <BarChart3 className="h-5 w-5 text-orange-500" />;
      case "seasonal": return <Zap className="h-5 w-5 text-yellow-500" />;
      case "regulatory": return <Shield className="h-5 w-5 text-green-500" />;
      default: return <Target className="h-5 w-5 text-gray-500" />;
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "exchange_rate_favorable": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "exchange_rate_unfavorable": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "recommendation": return <Sparkles className="h-4 w-4 text-purple-500" />;
      case "market_opportunity": return <TrendingUp className="h-4 w-4 text-blue-500" />;
      default: return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  // Quick actions for chat
  const quickActions = [
    {
      icon: Calculator,
      label: "Analisar Viabilidade",
      color: "from-purple-500 to-indigo-600",
      action: () => setInputMessage("Quero analisar a viabilidade de uma nova cotação. Quais informações você precisa?"),
    },
    {
      icon: TrendingUp,
      label: "Sugerir Negociação",
      color: "from-blue-500 to-cyan-600",
      action: () => setInputMessage("Preciso de ajuda para negociar uma redução de preço com meu fornecedor."),
    },
    {
      icon: Lightbulb,
      label: "Insights do Histórico",
      color: "from-amber-500 to-orange-600",
      action: () => setInputMessage("Analise meu histórico de cotações e me dê insights sobre padrões e oportunidades."),
    },
    {
      icon: Globe,
      label: "Análise de Mercado",
      color: "from-green-500 to-emerald-600",
      action: () => setInputMessage("Qual é a situação atual do mercado de importação? Há janelas de oportunidade?"),
    },
    {
      icon: Package,
      label: "Status das RFQs",
      color: "from-teal-500 to-cyan-600",
      action: () => setInputMessage("Qual o status das minhas RFQs abertas? Há cotações pendentes de análise?"),
    },
    {
      icon: Shield,
      label: "Reforma Tributária",
      color: "from-red-500 to-pink-600",
      action: () => setInputMessage("Como a reforma tributária 2026-2033 impacta minhas importações atuais? Simule o cenário."),
    },
  ];

  return (
    <div className="flex flex-col -m-6 md:-m-8 h-[calc(100%+3rem)] md:h-[calc(100%+4rem)] overflow-hidden bg-gradient-to-br from-slate-50 via-purple-50/30 to-indigo-50/50 dark:from-slate-950 dark:via-purple-950/20 dark:to-indigo-950/30">
      {/* Header Disruptivo */}
      <div className="relative overflow-hidden border-b bg-gradient-to-r from-[#311260] via-[#682ABA] to-[#311260] p-3 sm:p-6">
        {/* Animated background elements - hidden on mobile */}
        <div className="absolute inset-0 overflow-hidden hidden sm:block">
          <div className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-1/2 -right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#28E7C5]/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "0.5s" }} />
        </div>

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Avatar Excambia */}
            <div className="relative">
              <div className="h-10 w-10 sm:h-16 sm:w-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#28E7C5] to-[#682ABA] flex items-center justify-center shadow-lg shadow-purple-500/30 animate-pulse">
                <Brain className="h-5 w-5 sm:h-8 sm:w-8 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                <Sparkles className="h-2 w-2 sm:h-3 sm:w-3 text-white" />
              </div>
            </div>

            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
                Excambia
                <Badge className="bg-[#28E7C5]/20 text-[#28E7C5] border-[#28E7C5]/30 hover:bg-[#28E7C5]/30 text-xs hidden sm:flex">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Inteligência de Comércio Exterior
                </Badge>
              </h1>
              <p className="text-purple-200 text-xs sm:text-sm hidden sm:block">
                Inteligência Agêntica para Comércio Exterior
              </p>
            </div>
          </div>

          {/* Status indicators - hidden on mobile */}
          <div className="hidden sm:flex items-center gap-3">
            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              IA Ativa
            </Badge>
            <Badge className="bg-white/10 text-white border-white/20">
              <Bell className="h-3 w-3 mr-1" />
              {unreadAlerts?.length || 0} alertas
            </Badge>
          </div>
        </div>

        {/* Stats bar - 2 columns on mobile, 4 on desktop */}
        <div className="relative mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2 sm:p-3 border border-white/10">
            <div className="flex items-center gap-1 sm:gap-2 text-purple-200 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
              <Package className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              Cotações
            </div>
            <div className="text-base sm:text-xl font-bold text-white">{quotationStats?.total || 0}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2 sm:p-3 border border-white/10">
            <div className="flex items-center gap-1 sm:gap-2 text-purple-200 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
              <DollarSign className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              USD/BRL
            </div>
            <div className="text-base sm:text-xl font-bold text-[#28E7C5]">
              {exchangeRates?.USD ? `R$ ${exchangeRates.USD.toFixed(4)}` : "..."}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2 sm:p-3 border border-white/10">
            <div className="flex items-center gap-1 sm:gap-2 text-purple-200 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
              <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              Viáveis
            </div>
            <div className="text-base sm:text-xl font-bold text-green-400">{quotationStats?.viable || 0}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-2 sm:p-3 border border-white/10">
            <div className="flex items-center gap-1 sm:gap-2 text-purple-200 text-[10px] sm:text-xs mb-0.5 sm:mb-1">
              <Activity className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              Em Análise
            </div>
            <div className="text-base sm:text-xl font-bold text-amber-400">{quotationStats?.analyzing || 0}</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation - scrollable on mobile */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm px-2 sm:px-4 overflow-x-auto">
          <TabsList className="h-10 sm:h-12 bg-transparent gap-0.5 sm:gap-1 w-max sm:w-auto">
            <TabsTrigger 
              value="chat" 
              className="gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white"
            >
              <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Chat</span>
            </TabsTrigger>
            <TabsTrigger 
              value="predictive" 
              className="gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white"
            >
              <Brain className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Preditiva</span>
            </TabsTrigger>
            <TabsTrigger 
              value="alerts" 
              className="gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white"
            >
              <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Alertas</span>
              {(unreadAlerts?.length || 0) > 0 && (
                <Badge variant="destructive" className="ml-0.5 sm:ml-1 h-4 w-4 sm:h-5 sm:w-5 p-0 text-[10px] sm:text-xs">
                  {unreadAlerts?.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="market" 
              className="gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white"
            >
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Mercado</span>
            </TabsTrigger>
            <TabsTrigger 
              value="activity" 
              className="gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white"
            >
              <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Atividade</span>
            </TabsTrigger>
            <TabsTrigger 
              value="documents" 
              className="gap-1 sm:gap-2 px-2 sm:px-3 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white"
            >
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Docs</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Chat Tab - uses responsive ChatTab component */}
        <ChatTab
          messages={messages}
          inputMessage={inputMessage}
          setInputMessage={setInputMessage}
          isTyping={isTyping}
          uploadingFile={uploadingFile}
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUpload}
          onKeyPress={handleKeyPress}
          quickActions={quickActions}
          sidebar={
            <ConversationSidebar
              activeConversaId={activeConversaId}
              onSelect={handleSelectConversa}
              onNew={handleNewConversa}
            />
          }
          topBar={
            activeConversaId !== null ? (
              <ConversaOperacaoBar
                conversaId={activeConversaId}
                operacaoId={activeConversa?.operacaoId ?? null}
                conversaTitulo={activeConversa?.titulo}
                onCreateOperacao={createOperacaoFromConversa}
                onChanged={() => utils.excambia.getConversa.invalidate({ conversaId: activeConversaId })}
              />
            ) : null
          }
          onOpenOperacao={openOperacao}
          onCreateOperacao={createOperacaoFromConversa}
        />

        {/* Predictive Tab */}
        <TabsContent value="predictive" className="flex-1 overflow-auto m-0 p-4">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Análise Sistêmica e Preditiva</h2>
                <p className="text-sm text-muted-foreground">
                  Correlações de mercado, previsões e janelas de oportunidade
                </p>
              </div>
              <Button
                onClick={() => systemicAnalysisMutation.mutate()}
                disabled={systemicAnalysisMutation.isPending}
                className="bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
              >
                {systemicAnalysisMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Gerar Análise Sistêmica
                  </>
                )}
              </Button>
            </div>

            {systemicAnalysis ? (
              <div className="space-y-6">
                {/* Overall Outlook */}
                <Card className="border-2 border-purple-200 dark:border-purple-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between">
                      <span>Perspectiva Geral do Mercado</span>
                      <Badge className={`${getOutlookInfo(systemicAnalysis.overallOutlook).bgColor} text-white`}>
                        {getOutlookInfo(systemicAnalysis.overallOutlook).label}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-2">Confiança da Análise</p>
                        <Progress value={systemicAnalysis.confidenceScore} className="h-3" />
                      </div>
                      <div className="text-2xl font-bold text-purple-600">
                        {systemicAnalysis.confidenceScore}%
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Market Indicators */}
                {systemicAnalysis.marketIndicators.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-purple-600" />
                        Indicadores de Mercado
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 md:grid-cols-2">
                        {systemicAnalysis.marketIndicators.map((indicator, index) => (
                          <div
                            key={index}
                            className={`p-4 rounded-xl border ${getImpactColor(indicator.impact)}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{indicator.name}</span>
                              {getTrendIcon(indicator.trend)}
                            </div>
                            <div className="text-2xl font-bold mb-1">
                              {typeof indicator.value === "number" 
                                ? indicator.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                                : indicator.value}
                            </div>
                            <p className="text-xs opacity-80">{indicator.description}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Opportunities */}
                {systemicAnalysis.opportunities.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-green-600" />
                        Janelas de Oportunidade
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {systemicAnalysis.opportunities.map((opp, index) => (
                          <div
                            key={index}
                            className="p-4 rounded-xl border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800"
                          >
                            <div className="flex items-start gap-3">
                              {getOpportunityTypeIcon(opp.type)}
                              <div className="flex-1">
                                <h4 className="font-semibold text-green-800 dark:text-green-300">{opp.title}</h4>
                                <p className="text-sm text-green-700 dark:text-green-400 mt-1">{opp.description}</p>
                                <div className="flex items-center gap-4 mt-3 text-xs">
                                  <span className="text-green-600">
                                    Economia potencial: R$ {opp.potentialSavings.toLocaleString("pt-BR")}
                                  </span>
                                  <span className="text-green-600">
                                    Confiança: {opp.confidence}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Strategic Insights */}
                {systemicAnalysis.strategicInsights.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-amber-600" />
                        Insights Estratégicos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {systemicAnalysis.strategicInsights.map((insight, index) => (
                          <li key={index} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                            <Sparkles className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <span className="text-sm text-amber-800 dark:text-amber-300">{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Brain className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Análise Sistêmica Disponível</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                    Clique no botão acima para gerar uma análise completa do mercado, incluindo correlações, previsões e janelas de oportunidade.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="flex-1 overflow-auto m-0 p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Alertas Inteligentes</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkExchangeMutation.mutate()}
                  disabled={checkExchangeMutation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${checkExchangeMutation.isPending ? "animate-spin" : ""}`} />
                  Verificar Câmbio
                </Button>
                {(unreadAlerts?.length || 0) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAllReadMutation.mutate()}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar Todos Lidos
                  </Button>
                )}
              </div>
            </div>

            {loadingAlerts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : alerts && alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((alert: any) => (
                  <Card
                    key={alert.id}
                    className={`transition-all ${!alert.isRead ? "border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full ${getPriorityColor(alert.priority)}`}>
                          {getAlertIcon(alert.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{alert.title}</h4>
                            {!alert.isRead && (
                              <Badge variant="secondary" className="text-xs">Novo</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-muted-foreground">
                              {new Date(alert.createdAt).toLocaleString("pt-BR")}
                            </span>
                            <div className="flex gap-2">
                              {!alert.isRead && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => markReadMutation.mutate({ alertId: alert.id })}
                                >
                                  Marcar como lido
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => dismissMutation.mutate({ alertId: alert.id })}
                              >
                                Dispensar
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Bell className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum Alerta</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Você está em dia! Novos alertas aparecerão aqui quando houver oportunidades ou riscos.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Market Tab */}
        <TabsContent value="market" className="flex-1 overflow-auto m-0 p-4">
          <div className="max-w-6xl mx-auto space-y-6">
            <h2 className="text-xl font-bold">Análise de Mercado</h2>

            {loadingMarket ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : marketAnalysis ? (
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                      Câmbio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                        <span className="font-medium">USD/BRL</span>
                        <span className="text-xl font-bold text-blue-600">
                          R$ {exchangeRates?.USD?.toFixed(4) || "..."}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                        <span className="font-medium">EUR/BRL</span>
                        <span className="text-xl font-bold text-blue-600">
                          R$ {exchangeRates?.EUR?.toFixed(4) || "..."}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                        <span className="font-medium">CNY/BRL</span>
                        <span className="text-xl font-bold text-blue-600">
                          R$ {exchangeRates?.CNY?.toFixed(4) || "..."}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      Tendências
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-w-none break-words">
                      <MessageContent>{typeof marketAnalysis === 'string' ? marketAnalysis : (marketAnalysis as any)?.analysis || "Análise de mercado não disponível."}</MessageContent>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Análise de Mercado</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Dados de mercado serão exibidos aqui.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="flex-1 overflow-auto m-0 p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            <h2 className="text-xl font-bold">Histórico de Atividades</h2>

            {loadingActions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : actions && actions.length > 0 ? (
              <div className="space-y-3">
                {actions.map((action: any) => (
                  <Card key={action.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900">
                          <Activity className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{action.action}</h4>
                          <p className="text-sm text-muted-foreground">{action.result}</p>
                          <span className="text-xs text-muted-foreground">
                            {new Date(action.createdAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Activity className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma Atividade</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    O histórico de ações da Excambia aparecerá aqui.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="flex-1 overflow-auto m-0 p-4">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Análise de Documentos</h2>
                <p className="text-sm text-muted-foreground">
                  Envie cotações, invoices e documentos para análise automática
                </p>
              </div>
            </div>

            {/* Upload Area */}
            <Card className="border-2 border-dashed border-purple-300 dark:border-purple-700 hover:border-purple-500 transition-colors">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="p-4 rounded-full bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 mb-4">
                    <Upload className="h-10 w-10 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Arraste arquivos ou clique para enviar</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Suporta PDF, JPEG, PNG e WebP (máx. 16MB)
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="bg-gradient-to-r from-[#311260] to-[#682ABA] hover:opacity-90"
                  >
                    {uploadingFile ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Selecionar Arquivo
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Document Types */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => {
                setActiveTab('chat');
                setInputMessage('Preciso analisar uma cotação de fornecedor');
              }}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Cotações</h4>
                    <p className="text-xs text-muted-foreground">Propostas de fornecedores</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => {
                setActiveTab('chat');
                setInputMessage('Preciso analisar uma invoice/fatura');
              }}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Invoices</h4>
                    <p className="text-xs text-muted-foreground">Faturas comerciais</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => {
                setActiveTab('chat');
                setInputMessage('Preciso analisar um documento de importação');
              }}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Globe className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Documentos</h4>
                    <p className="text-xs text-muted-foreground">BL, AWB, Certificados</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tips */}
            <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-purple-200 dark:border-purple-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium mb-1">Dica da Excambia</h4>
                    <p className="text-sm text-muted-foreground">
                      Ao enviar uma cotação, extraio automaticamente os produtos, preços, NCMs e condições comerciais. 
                      Você pode me pedir para comparar com cotações anteriores ou calcular a viabilidade de cada item.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
