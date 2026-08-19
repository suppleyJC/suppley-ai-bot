/**
 * ExcambiaChat — a página da Excambia no padrão Claude (conversa-primeiro).
 *
 * Composição: [Sidebar do sistema (DashboardLayout)] + [ConversationPanel] + [Chat].
 * Esta página é o "children" do DashboardLayout existente — a sidebar do sistema
 * permanece intacta; o ConversationPanel e o chat vivem dentro da área de conteúdo.
 *
 * Dados: trpc.conversas.* (list/get/create/send). Substitui a Excambia.tsx antiga.
 *
 * Integração no App.tsx (wouter):
 *   <Route path="/excambia" component={ExcambiaChat} />
 */
import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ConversationPanel from "@/components/excambia/ConversationPanel";
import ParameterExtractionModal from "@/components/excambia/ParameterExtractionModal";
import { Paperclip, SendHorizontal, Plus, BarChart3, TrendingUp, ChevronRight, Copy, Check, Loader2, Settings2, FileSpreadsheet, ArrowRightCircle, Eye, Download, Clock, FileText, X as XIcon, Route, ExternalLink } from "lucide-react";
import { MessageContent } from "@/components/MessageContent";
import ExcambiaOrb from "@/components/ExcambiaOrb";
import { STAGE_ORDER, STAGE_LABELS } from "@/lib/stageLabels";
import { getMarcoLabel } from "@/lib/marcoLabels";

const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  // Planilhas (parseadas no backend e enviadas como texto ao agente)
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
  "application/csv",
  // Documentos Word (texto extraído no backend)
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  // Texto, código e dados (enviados como conteúdo bruto ao agente)
  "text/plain",
  "text/markdown",
  "application/json",
  "text/x-python",
  "application/x-python",
  "text/xml",
  "application/xml",
];
// Alguns navegadores não preenchem file.type p/ csv/xls; validamos também pela extensão.
const ALLOWED_UPLOAD_EXTS = [
  ".pdf", ".jpg", ".jpeg", ".png", ".webp",
  ".xlsx", ".xls", ".csv",
  ".docx", ".txt", ".md", ".json", ".py", ".xml", ".yaml", ".yml",
];
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024; // 16MB

/** Infere o MIME type pela extensão (fallback quando o navegador não preenche file.type). */
function mimeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".csv")) return "text/csv";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".txt") || n.endsWith(".log")) return "text/plain";
  if (n.endsWith(".md")) return "text/markdown";
  if (n.endsWith(".json")) return "application/json";
  if (n.endsWith(".py")) return "text/x-python";
  if (n.endsWith(".xml")) return "application/xml";
  if (n.endsWith(".yaml") || n.endsWith(".yml")) return "text/plain";
  return "application/octet-stream";
}

/** Mesma data (dia) para agrupar mensagens sob um separador temporal. */
function isSameDay(a?: string | Date | null, b?: string | Date | null): boolean {
  if (!a || !b) return true;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** Rótulo do dia: "Hoje", "Ontem" ou "14 de jun." (com ano se for outro ano). */
function dayLabel(d: string | Date): string {
  const date = new Date(d);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (isSameDay(date, hoje)) return "Hoje";
  if (isSameDay(date, ontem)) return "Ontem";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (date.getFullYear() !== hoje.getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString("pt-BR", opts);
}

/** Hora curta da mensagem (ex.: 14:32). */
function timeLabel(d: string | Date): string {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Separador de dia no fio da conversa — âncora temporal das interações. */
function DayDivider({ date }: { date: string | Date }) {
  return (
    <div className="flex items-center gap-3 py-1" aria-label={`Mensagens de ${dayLabel(date)}`}>
      <span className="h-px flex-1 bg-(--hair)/80" />
      <span className="rounded-full border border-(--hair) bg-(--exc-card) px-2.5 py-0.5 text-[11px] font-medium text-(--ink-2)">
        {dayLabel(date)}
      </span>
      <span className="h-px flex-1 bg-(--hair)/80" />
    </div>
  );
}

/** Converte um File em base64 puro (sem o prefixo data:). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(((reader.result as string) || "").split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Ícone oficial SUPPLEY (símbolo recortado do logo, fundo transparente)
const LogoIcon = ({ className }: { className?: string }) => (
  <img src="/suppley-icon.png" alt="Excambia" className={className ?? "h-full w-full object-contain"} />
);

// Data e horário correntes no canto superior esquerdo do palco do chat,
// no formato "11 JUL 2026 · 22:14 BRT", atualizando a cada minuto —
// mesma fonte e corpo do indicador de câmbio (PTAX) no lado direito.
const MESES_CURTOS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function formataAgora(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MESES_CURTOS[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm} BRT`;
}

function RelogioAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="whitespace-nowrap text-xs text-(--ink-2)">
      {formataAgora(agora)}
    </span>
  );
}

export default function ExcambiaChat() {
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  // No mobile inicia recolhido (chat ocupa a tela toda); no desktop, expandido.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  );
  const [draft, setDraft] = useState("");
  // Mensagens do usuário exibidas na hora (optimistic UI), antes da resposta.
  const [optimistic, setOptimistic] = useState<Array<{ id: string; content: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [paramModalOpen, setParamModalOpen] = useState(false);
  const [collectedParams, setCollectedParams] = useState<any>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const [streamingEvents, setStreamingEvents] = useState<Array<any>>([]);
  const utils = trpc.useUtils();

  const create = trpc.conversas.create.useMutation({
    onSuccess: ({ id }) => { setActiveId(id); utils.conversas.list.invalidate(); },
  });
  const upload = trpc.calculations.uploadQuotation.useMutation();
  const { data: conv } = trpc.conversas.get.useQuery(
    { id: activeId! }, { enabled: activeId != null },
  );

  // PORTA PAINEL → CHAT: /excambia?operacao=ID abre (ou cria) a conversa
  // vinculada àquela operação — o card do painel conversa com a Excambia.
  const search = useSearch();
  const getOrCreateForOp = trpc.conversas.getOrCreateForOperacao.useMutation();
  const opParamHandled = useRef<number | null>(null);
  useEffect(() => {
    const opId = Number(new URLSearchParams(search).get("operacao"));
    if (!Number.isFinite(opId) || opId <= 0 || opParamHandled.current === opId) return;
    opParamHandled.current = opId;
    getOrCreateForOp.mutate(
      { operacaoId: opId },
      {
        onSuccess: ({ id }) => { setActiveId(id); utils.conversas.list.invalidate(); },
        onError: () => toast.error("Não encontrei essa operação para abrir no chat."),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // CONVERGÊNCIA CHAT → PAINEL: quando a Excambia age numa conversa vinculada
  // (marco, financeiro, catálogo…), o painel precisa refletir na hora.
  function refreshPainel(operacaoId?: number) {
    if (!operacaoId) return;
    utils.operations.get.invalidate({ id: operacaoId });
    utils.operations.list.invalidate();
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Acompanha o fim da conversa — inclusive durante o streaming (a resposta e os
  // passos crescem), como nos chats de IA. Por isso streamingReply/Events entram
  // nas dependências, senão a tela não "sobe" enquanto a Excambia responde.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.mensagens, optimistic, streaming, streamingReply, streamingEvents]);

  // Auto-grow do composer: cresce com o texto até um teto e então rola.
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [draft]);

  async function handleNew() { create.mutate({}); }

  /** Histórico aceito pelo orquestrador (exclui "tool"). */
  function buildHistory() {
    return mensagens
      .filter((m: any) => m.role === "user" || m.role === "assistant" || m.role === "system")
      .map((m: any) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
  }

  async function ensureConversa(titulo: string): Promise<{ id: number; operacaoId?: number }> {
    if (activeId) return { id: activeId, operacaoId: conv?.operacaoId ?? undefined };
    const res = await create.mutateAsync({ titulo: titulo.slice(0, 40) });
    setActiveId(res.id);
    return { id: res.id, operacaoId: undefined };
  }

  async function handleSend() {
    if (streaming || uploading) return; // evita duplo envio (clique duplo / Enter repetido)
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const optId = `opt-${Date.now()}`;
    setOptimistic((prev) => [...prev, { id: optId, content: text }]);
    try {
      const { id, operacaoId } = await ensureConversa(text);
      const messages = [...buildHistory(), { role: "user" as const, content: text }];

      setStreaming(true);
      setStreamingReply("");
      setStreamingEvents([]);

      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId: id,
          messages,
          ...(operacaoId ? { operacaoId } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // A Excambia conclui em silêncio (só atividade); guardamos a resposta
      // pronta e a REVELAMOS fluindo após o stream terminar.
      let finalReply = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const chunk = JSON.parse(line.slice(6));

            if (chunk.type === "reply") {
              finalReply = chunk.reply ?? "";
            } else if (chunk.type !== "done") {
              // "done" NÃO encerra aqui — finalizamos após a revelação, para a
              // mensagem não sumir antes do fade de entrega.
              setStreamingEvents((prev) => [...prev, chunk]);
            }
          } catch {
            // malformed JSON, skip
          }
        }
      }

      // ENTREGA FLUIDA: troca o indicador de atividade pela resposta PRONTA, que
      // entra com fade/subida suave (CSS, sem re-parse de markdown). A versão
      // persistida é buscada em paralelo e substitui sem gap (mesmo conteúdo).
      setStreamingReply(finalReply);
      await utils.conversas.get.invalidate({ id });
      utils.conversas.list.invalidate();
      refreshPainel(operacaoId);
      setStreaming(false);
      setStreamingReply("");
      setStreamingEvents([]);
    } catch (err: any) {
      console.error("Falha ao enviar mensagem:", err);
      setDraft(text);
      setStreaming(false);
      setStreamingReply("");
      setStreamingEvents([]);
      toast.error("Não foi possível enviar a mensagem. Tente novamente.");
    } finally {
      setOptimistic((prev) => prev.filter((o) => o.id !== optId));
    }
  }

  function handleParametersCollected(params: any) {
    setCollectedParams(params);
    setParamModalOpen(false);
    // Format parameters as a summary message
    const summary = `Parâmetros para cálculo:
- Regime: ${params.regime === 'lucro_real' ? 'Lucro Real' : params.regime === 'lucro_presumido' ? 'Lucro Presumido' : 'Simples Nacional'}
- Estado: ${params.estado}${params.ttdPhase ? ` (TTD: ${params.ttdPhase === 'primeiros_36m' ? 'primeiros 36m' : 'após 36m'})` : ''}
- Câmbio: ${params.cambio === 'ptax_oficial' ? 'PTAX Oficial' : `Taxa fixa: ${params.taxaFixa}`}
- Modal: ${params.modal}${params.frete ? ` | Frete: USD ${params.frete}` : ''}${params.seguro ? ` | Seguro: USD ${params.seguro}` : ''}`;

    setDraft(summary);
    // Could auto-send, but instead we let user review and send manually
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await processFile(file);
  }

  async function processFile(file: File) {
    const nome = file.name.toLowerCase();
    const extOk = ALLOWED_UPLOAD_EXTS.some((ext) => nome.endsWith(ext));
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type) && !extOk) {
      toast.error("Tipo não suportado. Envie documento (PDF/DOCX/TXT), planilha (XLSX/CSV), imagem (JPEG/PNG/WebP) ou código/dados (JSON/PY/XML).");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Arquivo muito grande (máximo 16MB).");
      return;
    }

    const mimeType = file.type || mimeFromName(nome);
    const text = draft.trim();
    setDraft("");
    const optId = `opt-${Date.now()}`;
    setOptimistic((prev) => [
      ...prev,
      { id: optId, content: `Anexo: ${file.name}${text ? `\n\n${text}` : ""}` },
    ]);
    setUploading(true);
    try {
      const { id, operacaoId } = await ensureConversa(file.name);
      const base64 = await fileToBase64(file);
      const up = await upload.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: mimeType,
      });

      setStreaming(true);
      setStreamingReply("");
      setStreamingEvents([]);

      const messages = [...buildHistory(), { role: "user" as const, content: text }];
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId: id,
          messages,
          ...(operacaoId ? { operacaoId } : {}),
          // fileKey = chave permanente no storage: o agente vincula o arquivo
          // à proforma que catalogar (a url pré-assinada expira em ~1h).
          attachment: { url: up.fileUrl, fileKey: up.fileKey, mimeType, name: file.name },
        }),
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalReply = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            if (chunk.type === "reply") {
              finalReply = chunk.reply ?? "";
            } else if (chunk.type !== "done") {
              setStreamingEvents((prev) => [...prev, chunk]);
            }
          } catch {
            // malformed JSON, skip
          }
        }
      }

      // ENTREGA FLUIDA: resposta pronta entra com fade/subida (CSS); persistida
      // substitui em paralelo, sem gap.
      setStreamingReply(finalReply);
      await utils.conversas.get.invalidate({ id });
      utils.conversas.list.invalidate();
      refreshPainel(operacaoId);
      setStreaming(false);
      setStreamingReply("");
      setStreamingEvents([]);
    } catch (err: any) {
      console.error("Falha ao enviar anexo:", err);
      setStreaming(false);
      setStreamingReply("");
      setStreamingEvents([]);
      toast.error("Não foi possível processar o anexo. Tente novamente.");
    } finally {
      setUploading(false);
      setOptimistic((prev) => prev.filter((o) => o.id !== optId));
    }
  }

  // Arrastar-e-soltar arquivo no chat (reaproveita o mesmo processFile do botão).
  const [dragOver, setDragOver] = useState(false);
  function handleDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
    e.preventDefault();
    if (!uploading && !streaming) setDragOver(true);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (uploading || streaming) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  const mensagens = conv?.mensagens ?? [];
  const vazio = mensagens.length === 0 && optimistic.length === 0;

  return (
    <div className="relative flex h-full w-full">
      <ConversationPanel
        activeId={activeId} onSelect={setActiveId} onNew={handleNew}
        collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      {/* CHAT */}
      <div
        className="relative flex flex-1 flex-col bg-(--paper) min-h-0 h-full"
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-violet-50/80 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-violet-400 bg-(--exc-card)/90 px-8 py-6 text-violet-700 shadow-lg">
              <Paperclip className="h-7 w-7" />
              <p className="text-sm font-semibold">Solte o arquivo aqui</p>
              <p className="text-xs text-violet-400">PDF, imagem ou planilha (XLSX/XLS/CSV) · até 16MB</p>
            </div>
          </div>
        )}
        {/* topbar fina — data/hora, contexto da operação vinculada (se houver) + câmbio */}
        <div className="flex h-[54px] flex-shrink-0 items-center gap-2 sm:gap-2.5 px-3 sm:px-6 border-b border-(--hair)">
          <RelogioAgora />
          {conv?.operacaoId ? <OperacaoContextBar operacaoId={conv.operacaoId} /> : null}
          <div className="ml-auto flex items-center gap-3 text-xs text-(--ink-2)">
            <FxRate />
          </div>
        </div>

        {/* área de conversa — a malha de pontos (.chat-stage) só aparece no
            estado vazio/home; com mensagens o fundo fica liso (--paper) */}
        <div ref={scrollRef} className={`flex flex-1 flex-col items-center overflow-y-auto scrollbar-custom min-h-0 ${vazio ? "chat-stage" : ""}`}>
          {vazio ? (
            <Welcome onPick={(t) => setDraft(t)} />
          ) : (
            <div className="flex w-full max-w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl shrink-0 flex-col gap-4 sm:gap-6 px-3 sm:px-6 pt-4 sm:pt-6 pb-2">
              {mensagens.map((m: any, i: number) => {
                const anterior = mensagens[i - 1];
                const mostraDia = m.criadaEm && (!anterior || !isSameDay(anterior?.criadaEm, m.criadaEm));
                return (
                  <React.Fragment key={m.id}>
                    {mostraDia && <DayDivider date={m.criadaEm} />}
                    <Message
                      role={m.role}
                      content={m.content}
                      criadaEm={m.criadaEm}
                      toolResults={m.toolResults}
                      conversaId={activeId}
                      operacaoId={conv?.operacaoId ?? undefined}
                    />
                  </React.Fragment>
                );
              })}
              {optimistic.map((o) => (
                <Message key={o.id} role="user" content={o.content} criadaEm={new Date()} />
              ))}
              {(streaming || uploading) && (
                streamingReply ? (
                  // Entrega fluida: a resposta pronta entra com fade/subida suave.
                  <div className="excambia-reveal">
                    <Message role="assistant" content={streamingReply} />
                  </div>
                ) : (
                  <StreamingActivity events={streamingEvents} />
                )
              )}
            </div>
          )}
        </div>

        {/* composer — fixo no rodapé (não encolhe) */}
        <div className="flex w-full flex-shrink-0 justify-center bg-gradient-to-t from-(--paper) px-3 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6 pt-2.5 sm:pt-3.5">
          <div className="w-full max-w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl">
            <div className="flex items-end gap-2 sm:gap-2.5 rounded-[18px] border border-(--hair) bg-(--exc-card) p-2 sm:p-2.5 pl-3 sm:pl-4 shadow-[0_4px_20px_rgba(49,18,96,0.05)] transition-colors focus-within:border-violet-500 focus-within:shadow-[0_4px_24px_rgba(104,42,186,0.12)]">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv,.json,.py,.xml,.yaml,.yml,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/json,text/x-python,application/xml"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || streaming}
                title="Anexar documento (PDF/DOCX/TXT), planilha (XLSX/CSV), imagem ou código/dados (JSON/PY)"
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-(--ink-2) hover:bg-(--paper) hover:text-violet-600 flex-shrink-0 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 sm:h-[18px] sm:w-[18px] animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setParamModalOpen(true)}
                disabled={uploading || streaming}
                title="Extrair parâmetros de cálculo (regime, estado, câmbio, frete)"
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-(--ink-2) hover:bg-(--paper) hover:text-violet-600 flex-shrink-0 disabled:opacity-50"
              >
                <Settings2 className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              </button>
              <textarea
                ref={taRef}
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!streaming && !uploading) handleSend(); } }}
                rows={1} placeholder="Escreva para a Excambia…"
                className="flex-1 resize-none bg-transparent py-1.5 text-base sm:text-[14px] leading-relaxed text-(--ink) outline-none placeholder:text-(--ink-2) max-h-[200px] overflow-y-auto scrollbar-custom"
              />
              <button onClick={handleSend}
                disabled={streaming || uploading || !draft.trim()}
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-[10px] bg-violet-600 text-white hover:bg-violet-700 flex-shrink-0 disabled:opacity-40 disabled:hover:bg-violet-600">
                {streaming ? (
                  <Loader2 className="h-4 w-4 sm:h-[18px] sm:w-[18px] animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                )}
              </button>
            </div>
            <p className="mt-1.5 sm:mt-2 text-center text-[10px] sm:text-[11px] text-(--ink-2) px-2">
              A Excambia conduz a operação ponta a ponta · cálculo pelo motor certificado
            </p>
          </div>
        </div>
      </div>

      {/* Parameter Extraction Modal */}
      <ParameterExtractionModal
        open={paramModalOpen}
        onClose={() => setParamModalOpen(false)}
        onSubmit={handleParametersCollected}
        prefilledParams={collectedParams}
      />
    </div>
  );
}

/**
 * OperacaoContextBar — a operação vinculada SEMPRE visível no topo do chat:
 * código, título, chip de estágio e progresso da jornada (5 etapas), com
 * atalho para o painel. Dados vivos de operations.get — o que mudar no painel
 * aparece aqui (e o refreshPainel pós-resposta fecha o ciclo inverso).
 */
function OperacaoContextBar({ operacaoId }: { operacaoId: number }) {
  const [, setLocation] = useLocation();
  const { data } = trpc.operations.get.useQuery({ id: operacaoId });
  const op = data?.operacao;
  if (!op) return null;

  const idx = STAGE_ORDER.indexOf(op.estagioAtual as (typeof STAGE_ORDER)[number]);
  const encerrada = ["closed", "lost"].includes(op.estagioAtual);

  return (
    <button
      onClick={() => setLocation(`/operacao/${op.id}`)}
      title={`${op.codigo} — ${op.titulo} · abrir no Painel de Operações`}
      className="group flex min-w-0 items-center gap-2 sm:gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-2.5 sm:px-3 py-1.5 text-left transition hover:border-violet-300 hover:bg-violet-50"
    >
      <Route className="h-4 w-4 flex-shrink-0 text-violet-600" />
      <span className="hidden sm:inline font-mono text-[11px] font-semibold text-violet-700">{op.codigo}</span>
      <span className="max-w-[110px] sm:max-w-[220px] truncate text-xs font-medium text-(--ink)">{op.titulo}</span>
      <span className="rounded-md bg-(--exc-card) px-1.5 py-0.5 text-[10px] font-bold text-violet-700 border border-violet-100 whitespace-nowrap">
        {STAGE_LABELS[op.estagioAtual as keyof typeof STAGE_LABELS] ?? op.estagioAtual}
      </span>
      {/* progresso da jornada — 5 pontos, coeso com a esteira do painel */}
      <span className="hidden md:flex items-center gap-1">
        {STAGE_ORDER.map((s, i) => (
          <span
            key={s}
            title={STAGE_LABELS[s]}
            className={`h-1.5 w-1.5 rounded-full ${
              encerrada || (idx >= 0 && i < idx) ? "bg-teal-500"
                : i === idx ? "bg-violet-600 ring-2 ring-violet-200"
                : "bg-(--idle)"
            }`}
          />
        ))}
      </span>
      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-(--idle) transition group-hover:text-violet-500" />
    </button>
  );
}

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-3 sm:px-6 py-8 sm:py-12 text-center min-h-0">
      <span className="mb-4 sm:mb-5 flex-shrink-0">
        <ExcambiaOrb size={48} />
      </span>
      <h1 className="mb-2 sm:mb-2.5 text-xl sm:text-2xl md:text-[26px] font-semibold tracking-tight text-(--ink)">
        Olá, Jean. O que vamos{" "}
        <span className="bg-gradient-to-r from-violet-600 to-teal-600 bg-clip-text text-transparent">importar</span> hoje?
      </h1>
      <p className="mb-6 sm:mb-7 max-w-xs sm:max-w-sm text-sm sm:text-[14px] leading-relaxed text-(--ink-2)">
        Descreva o que precisa, suba uma cotação ou abra uma operação na lista ao lado.
      </p>
      <div className="flex w-full max-w-xs sm:max-w-sm flex-col gap-2 sm:gap-2.5">
        <Suggestion icon={<Plus />} title="Nova importação" sub="descrever um produto ou subir um PDF"
          onClick={() => onPick("Quero iniciar uma nova importação: ")} />
        <Suggestion icon={<TrendingUp />} title="Ver o mercado" sub="preço médio e tendência de um NCM"
          onClick={() => onPick("Me mostre o preço médio de mercado do NCM ")} />
      </div>
    </div>
  );
}

function Suggestion({ icon, title, sub, onClick }: any) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2.5 sm:gap-3.5 rounded-[13px] border border-(--hair) bg-(--exc-card) px-3 sm:px-4 py-2.5 sm:py-3.5 text-left transition hover:-translate-y-px hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(104,42,186,0.06)]">
      <span className="flex h-8 w-8 sm:h-[33px] sm:w-[33px] flex-shrink-0 items-center justify-center rounded-[9px] bg-violet-50 text-violet-600 [&_svg]:h-4 sm:[&_svg]:h-[18px] [&_svg]:w-4 sm:[&_svg]:w-[18px]">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs sm:text-[13px] font-semibold text-(--ink)">{title}</span>
        <span className="text-[10px] sm:text-[11.5px] text-(--ink-2)">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-(--idle) flex-shrink-0" />
    </button>
  );
}

// Rótulos humanos para as ferramentas — nada de nomes técnicos no chat.
const TOOL_LABELS: Record<string, string> = {
  montar_calculo: "Calculando o custo no motor certificado",
  gerar_relatorio_calculo: "Montando a planilha de cálculo",
  classificar_ncm: "Classificando a NCM",
  comparar_cotacoes: "Comparando cotações",
  enviar_rfq: "Preparando a solicitação de cotação",
  registrar_cotacao: "Registrando a cotação",
  registrar_marco_producao: "Registrando o marco da operação",
  registrar_nacionalizacao: "Registrando a nacionalização",
  lancar_financeiro: "Lançando o financeiro",
  coletar_dados_faltantes: "Revisando os dados da operação",
  buscar_ativo: "Buscando o ativo",
  comparar_origem: "Comparando origens",
  benchmark_mercado: "Consultando o mercado",
  web_search: "Pesquisando na web",
};
const labelFor = (name?: string) =>
  (name && TOOL_LABELS[name]) || "Trabalhando na sua solicitação";

/**
 * StreamingActivity — uma única linha de atividade viva, sóbria e sem emoji.
 * Mostra os passos concluídos esmaecidos (com check) e o passo atual com um
 * leve pulso. Substitui o despejo de eventos crus, dando fluidez ao chat.
 */
function StreamingActivity({ events }: { events: any[] }) {
  // Deriva os passos a partir dos tool_call/tool_result (ignora "thinking" cru).
  const steps: Array<{ label: string; done: boolean; ok: boolean }> = [];
  for (const e of events) {
    if (e.type === "tool_call") {
      steps.push({ label: labelFor(e.name), done: false, ok: true });
    } else if (e.type === "tool_result") {
      // marca o último passo aberto como concluído
      for (let i = steps.length - 1; i >= 0; i--) {
        if (!steps[i].done) { steps[i].done = true; steps[i].ok = e.ok !== false; break; }
      }
    }
  }
  const current = steps.find((s) => !s.done);

  return (
    <div className="group flex w-full items-start gap-2 sm:gap-3">
      {/* mesmo tamanho do indicador anterior (32px), ciclo curto de 10s */}
      <ExcambiaOrb size={24} duration={10} />
      <div className="min-w-0 flex-1 pt-0.5">
        {steps.length === 0 ? (
          <TypingDots />
        ) : (
          <ul className="space-y-1">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] leading-relaxed">
                {s.done ? (
                  <Check className={`h-3.5 w-3.5 flex-shrink-0 ${s.ok ? "text-teal-500" : "text-rose-400"}`} />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-400" />
                )}
                <span className={s.done ? "text-(--ink-2)" : "text-(--ink)"}>
                  {s.label}
                  {!s.done && <span className="excambia-ellipsis" />}
                </span>
              </li>
            ))}
            {!current && (
              <li className="flex items-center gap-2 text-[13px] text-(--ink-2)">
                <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-400" />
                <span>Redigindo a resposta<span className="excambia-ellipsis" /></span>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function Message({ role, content, pending, criadaEm, toolResults, conversaId, operacaoId }: {
  role: string; content: string; pending?: boolean; criadaEm?: string | Date;
  toolResults?: any; conversaId?: number; operacaoId?: number;
}) {
  if (role === "user") {
    return (
      <div className="group flex max-w-[85%] sm:max-w-[75%] flex-col items-end gap-0.5 self-end">
        <div className="whitespace-pre-wrap break-words rounded-2xl bg-violet-600 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-[14px] leading-relaxed text-white shadow-sm">
          {content}
        </div>
        {criadaEm && (
          <span className="pr-1 text-[10px] text-(--ink-2) opacity-0 transition group-hover:opacity-100">
            {dayLabel(criadaEm)} · {timeLabel(criadaEm)}
          </span>
        )}
      </div>
    );
  }
  if (role === "assistant") {
    return (
      <div className="group flex w-full items-start gap-2 sm:gap-3">
        {pending ? (
          <ExcambiaOrb size={24} duration={10} />
        ) : (
          <span className="flex h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0 items-center justify-center rounded-lg bg-(--exc-card) border border-(--hair) p-1">
            <LogoIcon />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {pending ? (
            <TypingDots />
          ) : (
            <>
              <div className="min-w-0 max-w-none break-words">
                <MessageContent>{content}</MessageContent>
              </div>
              <CalcResultCard toolResults={toolResults} conversaId={conversaId} operacaoId={operacaoId} />
              <OperationJourneyCard toolResults={toolResults} />
              <div className="flex items-center gap-2">
                <CopyButton text={content} />
                {criadaEm && (
                  <span className="mt-1.5 text-[10px] text-(--ink-2) opacity-0 transition group-hover:opacity-100">
                    {dayLabel(criadaEm)} · {timeLabel(criadaEm)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  return null; // system/tool não renderizam
}

/** Extrai do array de toolResults o cálculo e/ou a planilha gerada. */
function extractCalc(toolResults: any): {
  planilha?: { url: string; fileKey?: string; fileName: string; formato?: string };
  resumo?: { custo?: number; preco?: number; margemPct?: number; consumo?: boolean };
} | null {
  if (!Array.isArray(toolResults)) return null;
  let planilha: any;
  let resumo: any;
  for (const tr of toolResults) {
    if (!tr || tr.ok === false) continue;
    if (tr.name === "gerar_relatorio_calculo" && tr.data?.url) {
      planilha = { url: tr.data.url, fileKey: tr.data.fileKey, fileName: tr.data.fileName ?? "Planilha.xlsx", formato: tr.data.formato };
    }
    if (tr.name === "montar_calculo" && tr.data?.summary) {
      const sm = tr.data.summary;
      resumo = {
        custo: sm.netCostTotal,
        preco: sm.salePriceTotal,
        margemPct: typeof sm.margemBruta === "number" ? sm.margemBruta * 100 : undefined,
        consumo: sm.finalidade === "consumo_proprio",
      };
    }
  }
  if (!planilha && !resumo) return null;
  return { planilha, resumo };
}

/**
 * Card de bifurcação pós-cálculo: após a Excambia calcular/emitir a planilha, a
 * pessoa decide enviar para Operações (segue o fluxo de importação) ou só ver o
 * preço. Some quando a conversa já está vinculada a uma operação.
 */
function CalcResultCard({ toolResults, conversaId, operacaoId }: {
  toolResults?: any; conversaId?: number; operacaoId?: number;
}) {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const utils = trpc.useUtils();
  const createOp = trpc.operations.createFromCalculation.useMutation();

  const calc = extractCalc(toolResults);
  if (!calc || dismissed) return null;

  const brl = (v?: number) =>
    v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;

  async function enviarParaOperacoes() {
    try {
      const titulo = calc?.planilha?.fileName?.replace(/\.(xlsx|pdf)$/i, "") || "Importação (cálculo Excambia)";
      const res = await createOp.mutateAsync({
        conversaId,
        titulo,
        planilha: calc?.planilha
          ? { url: calc.planilha.url, fileKey: calc.planilha.fileKey, nome: calc.planilha.fileName, formato: calc.planilha.formato === "pdf" ? "pdf" : "excel" }
          : undefined,
        snapshot: calc?.resumo ?? {},
      });
      await utils.conversas.get.invalidate();
      utils.conversas.list.invalidate();
      toast.success("Operação criada. Cálculo e planilha vinculados.");
      setLocation(`/operacao/${res.operacaoId}`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível criar a operação. Tente novamente.");
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 to-teal-50/40 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-violet-600" />
        <span className="text-[13px] font-semibold text-(--ink)">Cálculo pronto</span>
      </div>

      {calc.resumo && (
        calc.resumo.consumo ? (
          <div className="mt-2 grid grid-cols-1 gap-2 text-center">
            <Stat label="Custo nacionalizado (consumo próprio)" value={brl(calc.resumo.custo)} />
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Stat label="Custo líquido" value={brl(calc.resumo.custo)} />
            <Stat label="Preço de venda" value={brl(calc.resumo.preco)} />
            <Stat label="Margem bruta" value={calc.resumo.margemPct != null ? `${calc.resumo.margemPct.toFixed(1)}%` : "—"} />
          </div>
        )
      )}

      {calc.planilha && (
        <a
          href={calc.planilha.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-(--exc-card) px-3 py-1.5 text-[12.5px] font-medium text-violet-700 hover:bg-violet-50"
        >
          <Download className="h-3.5 w-3.5" />
          {calc.planilha.fileName}
        </a>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {operacaoId ? (
          <button
            onClick={() => setLocation(`/operacao/${operacaoId}`)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-violet-700"
          >
            <ArrowRightCircle className="h-4 w-4" /> Abrir operação
          </button>
        ) : (
          <button
            onClick={enviarParaOperacoes}
            disabled={createOp.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {createOp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
            Enviar para Operações
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--hair) bg-(--exc-card) px-3 py-1.5 text-[12.5px] font-medium text-(--ink) hover:bg-(--paper)"
        >
          <Eye className="h-4 w-4" /> Só visualizar
        </button>
      </div>
      {!operacaoId && (
        <p className="mt-2 text-[11px] text-(--ink-2)">
          Enviar cria uma operação e dá sequência ao fluxo de importação. Só visualizar mantém apenas o preço.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-(--exc-card)/70 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-(--ink-2)">{label}</div>
      <div className="text-[13px] font-semibold text-(--ink)">{value}</div>
    </div>
  );
}

// --- Jornada da operação no chat ---
// Vocabulário ÚNICO com o painel: mesmas etapas (stageLabels) e mesmos 13
// marcos (marcoLabels) — o card do chat e o Painel contam a mesma história.
const OP_STAGES = STAGE_ORDER.map((key) => ({ key, label: STAGE_LABELS[key] }));

/** Extrai do toolResults os dados da operação consultada (consultar_operacao). */
function extractOperacao(toolResults: any): { operacao: any; marcos: any[]; anexos: any[] } | null {
  if (!Array.isArray(toolResults)) return null;
  for (const tr of toolResults) {
    if (tr?.name === "consultar_operacao" && tr.ok !== false && tr.data?.operacao) {
      return { operacao: tr.data.operacao, marcos: tr.data.marcos ?? [], anexos: tr.data.anexos ?? [] };
    }
  }
  return null;
}

/**
 * OperationJourneyCard — a jornada da operação renderizada no chat: esteira de
 * estágios, marcos com status e documentos. Coeso com o Painel de operações,
 * mas vivendo na conversa (a dinâmica que o usuário pediu).
 */
function OperationJourneyCard({ toolResults }: { toolResults?: any }) {
  const [, setLocation] = useLocation();
  const data = extractOperacao(toolResults);
  if (!data) return null;
  const { operacao, marcos, anexos } = data;

  const currentIdx = OP_STAGES.findIndex((s) => s.key === operacao.estagioAtual);

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-(--exc-card) p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-violet-600" />
        <span className="text-[13px] font-semibold text-(--ink)">
          {operacao.codigo ?? `OP-${operacao.id}`} · {operacao.titulo}
        </span>
        <span className="ml-auto rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
          {operacao.status}
        </span>
      </div>

      {/* Esteira de estágios */}
      <div className="mt-3 flex items-center gap-1">
        {OP_STAGES.map((s, i) => {
          const done = currentIdx >= 0 && i < currentIdx;
          const current = i === currentIdx;
          return (
            <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-center">
                <span className={`h-1.5 flex-1 rounded-full ${i === 0 ? "opacity-0" : done || current ? "bg-violet-400" : "bg-(--hair)"}`} />
                <span className={`mx-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  done ? "bg-teal-500" : current ? "bg-violet-600 ring-2 ring-violet-200" : "bg-(--idle)"
                }`} />
                <span className={`h-1.5 flex-1 rounded-full ${i === OP_STAGES.length - 1 ? "opacity-0" : done ? "bg-violet-400" : "bg-(--hair)"}`} />
              </div>
              <span className={`text-[9px] ${current ? "font-semibold text-violet-700" : "text-(--ink-2)"}`}>{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Marcos */}
      {marcos.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {marcos.slice(0, 8).map((m: any, i: number) => {
            const ok = m.status === "realizado";
            const cancel = m.status === "cancelado";
            return (
              <div key={i} className="flex items-start gap-2 text-[12.5px]">
                {ok ? <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-teal-500" />
                  : cancel ? <XIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
                  : <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-(--ink-2)" />}
                <span className="text-(--ink)">
                  <span className="font-medium">{getMarcoLabel(m.tipo)}</span>
                  {m.descricao ? <span className="text-(--ink-2)"> — {m.descricao}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Documentos */}
      {anexos.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-(--ink-2) mb-1.5">Documentos</div>
          <div className="flex flex-wrap gap-1.5">
            {anexos.slice(0, 8).map((a: any, i: number) => (
              <a
                key={i}
                href={a.fileUrl || a.fileKey || "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-(--hair) bg-(--paper) px-2 py-1 text-[11.5px] text-(--ink) hover:bg-(--hair)"
              >
                <FileText className="h-3 w-3 text-violet-500" />
                {a.nome}
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setLocation(`/operacao/${operacao.id}`)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-violet-700"
      >
        <ArrowRightCircle className="h-4 w-4" /> Abrir operação
      </button>
    </div>
  );
}

/** Indicador de "digitando" enquanto a Excambia processa. */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 pt-2" aria-label="Excambia está respondendo">
      <span className="h-2 w-2 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-violet-500" />
    </div>
  );
}

/** Botão de copiar a resposta (texto puro), aparece ao passar o mouse. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard indisponível (ex.: http) — ignora silenciosamente */
        }
      }}
      title="Copiar resposta"
      className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-(--ink-2) opacity-0 transition focus:opacity-100 group-hover:opacity-100 hover:bg-(--hair) hover:text-(--ink)"
    >
      {copied ? <Check className="h-3 w-3 text-teal-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function FxRate() {
  const { data: rate, isLoading } = trpc.exchange.getRate.useQuery({ from: 'USD', to: 'BRL' });
  const displayRate = rate?.rate?.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) ?? (isLoading ? '...' : '—');
  return (
    <span className="flex items-center gap-1.5">
      USD/BRL <b className="font-semibold text-(--ink)">{displayRate}</b>
      <span className="text-[10px] text-teal-600">● PTAX</span>
    </span>
  );
}
