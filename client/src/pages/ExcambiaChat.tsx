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
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import ConversationPanel from "@/components/excambia/ConversationPanel";
import ParameterExtractionModal from "@/components/excambia/ParameterExtractionModal";
import { Paperclip, SendHorizontal, Plus, BarChart3, TrendingUp, ChevronRight, Copy, Check, Loader2, Settings2, FileSpreadsheet, ArrowRightCircle, Eye, Download } from "lucide-react";
import { Streamdown } from "streamdown";

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
];
// Alguns navegadores não preenchem file.type p/ csv/xls; validamos também pela extensão.
const ALLOWED_UPLOAD_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".xlsx", ".xls", ".csv"];
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
  return "application/octet-stream";
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

/**
 * Orbital — o símbolo da Excambia "vivo": anel de gradiente girando + brilho.
 * `glow` adiciona o pulso de luz; `thinking` acelera o giro (enquanto responde).
 */
function Orbital({
  className = "",
  glow = false,
  thinking = false,
}: { className?: string; glow?: boolean; thinking?: boolean }) {
  return (
    <span
      className={`excambia-orbital ${glow ? "excambia-orbital--glow" : ""} ${
        thinking ? "excambia-orbital--thinking" : ""
      } ${className}`}
    >
      <LogoIcon className="h-[68%] w-[68%] object-contain" />
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

            if (chunk.type === "done") {
              setStreaming(false);
            } else if (chunk.type === "reply") {
              setStreamingReply(chunk.reply ?? "");
            } else {
              setStreamingEvents((prev) => [...prev, chunk]);
            }
          } catch {
            // malformed JSON, skip
          }
        }
      }

      // Encerra o streaming ANTES de carregar a versão persistida — evita que a
      // resposta transmitida e a persistida sejam pintadas juntas (encavalamento).
      setStreaming(false);
      setStreamingReply("");
      setStreamingEvents([]);
      await utils.conversas.get.invalidate({ id });
      utils.conversas.list.invalidate();
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
    if (!file) return;

    const nome = file.name.toLowerCase();
    const extOk = ALLOWED_UPLOAD_EXTS.some((ext) => nome.endsWith(ext));
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type) && !extOk) {
      toast.error("Tipo não suportado. Envie PDF, imagem (JPEG/PNG/WebP) ou planilha (XLSX/XLS/CSV).");
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
          attachment: { url: up.fileUrl, mimeType, name: file.name },
        }),
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (chunk.type === "done") {
              setStreaming(false);
            } else if (chunk.type === "reply") {
              setStreamingReply(chunk.reply ?? "");
            } else {
              setStreamingEvents((prev) => [...prev, chunk]);
            }
          } catch {
            // malformed JSON, skip
          }
        }
      }

      // Encerra o streaming ANTES de carregar a versão persistida (anti-encavalamento).
      setStreaming(false);
      setStreamingReply("");
      setStreamingEvents([]);
      await utils.conversas.get.invalidate({ id });
      utils.conversas.list.invalidate();
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

  const mensagens = conv?.mensagens ?? [];
  const vazio = mensagens.length === 0 && optimistic.length === 0;

  return (
    <div className="relative flex h-full w-full">
      <ConversationPanel
        activeId={activeId} onSelect={setActiveId} onNew={handleNew}
        collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      {/* CHAT */}
      <div className="flex flex-1 flex-col bg-[#faf9fc] min-h-0 h-full">
        {/* topbar fina */}
        <div className="flex h-[54px] flex-shrink-0 items-center gap-2 sm:gap-2.5 px-3 sm:px-6 border-b border-slate-100">
          <img src="/suppley-icon.png" alt="" className="h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0 object-contain" />
          <span className="text-sm font-semibold tracking-tight text-slate-800">Excambia</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <FxRate />
          </div>
        </div>

        {/* área de conversa */}
        <div ref={scrollRef} className="flex flex-1 flex-col items-center overflow-y-auto scrollbar-custom min-h-0">
          {vazio ? (
            <Welcome onPick={(t) => setDraft(t)} />
          ) : (
            <div className="flex w-full max-w-full sm:max-w-2xl lg:max-w-3xl shrink-0 flex-col gap-4 sm:gap-6 px-3 sm:px-6 pt-4 sm:pt-6 pb-2">
              {mensagens.map((m: any) => (
                <Message
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  toolResults={m.toolResults}
                  conversaId={activeId}
                  operacaoId={conv?.operacaoId ?? undefined}
                />
              ))}
              {optimistic.map((o) => (
                <Message key={o.id} role="user" content={o.content} />
              ))}
              {(streaming || uploading) && (
                streamingReply ? (
                  <Message role="assistant" content={streamingReply} />
                ) : (
                  <StreamingActivity events={streamingEvents} />
                )
              )}
            </div>
          )}
        </div>

        {/* composer — fixo no rodapé (não encolhe) */}
        <div className="flex w-full flex-shrink-0 justify-center bg-gradient-to-t from-[#faf9fc] px-3 sm:px-6 pb-4 sm:pb-6 pt-2.5 sm:pt-3.5">
          <div className="w-full max-w-full sm:max-w-2xl lg:max-w-3xl">
            <div className="flex items-end gap-2 sm:gap-2.5 rounded-[18px] border border-[#e2def0] bg-white p-2 sm:p-2.5 pl-3 sm:pl-4 shadow-[0_4px_20px_rgba(49,18,96,0.05)] transition-colors focus-within:border-violet-500 focus-within:shadow-[0_4px_24px_rgba(104,42,186,0.12)]">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || streaming}
                title="Anexar PDF, imagem ou planilha (XLSX/CSV)"
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-violet-600 flex-shrink-0 disabled:opacity-50"
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
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-violet-600 flex-shrink-0 disabled:opacity-50"
              >
                <Settings2 className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              </button>
              <textarea
                ref={taRef}
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                rows={1} placeholder='Ex.: "5.400 escoras galvanizadas da China"…'
                className="flex-1 resize-none bg-transparent py-1.5 text-sm sm:text-[14px] leading-relaxed text-slate-700 outline-none placeholder:text-slate-400 max-h-[200px] overflow-y-auto scrollbar-custom"
              />
              <button onClick={handleSend}
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-[10px] bg-violet-600 text-white hover:bg-violet-700 flex-shrink-0">
                <SendHorizontal className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              </button>
            </div>
            <p className="mt-1.5 sm:mt-2 text-center text-[10px] sm:text-[11px] text-slate-400 px-2">
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

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-3 sm:px-6 py-8 sm:py-12 text-center min-h-0">
      <Orbital glow className="h-16 w-16 sm:h-20 sm:w-20 mb-4 sm:mb-5 flex-shrink-0" />
      <h1 className="mb-2 sm:mb-2.5 text-xl sm:text-2xl md:text-[26px] font-semibold tracking-tight text-slate-800">
        Olá, Jean. O que vamos{" "}
        <span className="bg-gradient-to-r from-violet-600 to-teal-600 bg-clip-text text-transparent">importar</span> hoje?
      </h1>
      <p className="mb-6 sm:mb-7 max-w-xs sm:max-w-sm text-sm sm:text-[14px] leading-relaxed text-slate-500">
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
      className="flex items-center gap-2.5 sm:gap-3.5 rounded-[13px] border border-slate-200 bg-white px-3 sm:px-4 py-2.5 sm:py-3.5 text-left transition hover:-translate-y-px hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(104,42,186,0.06)]">
      <span className="flex h-8 w-8 sm:h-[33px] sm:w-[33px] flex-shrink-0 items-center justify-center rounded-[9px] bg-violet-50 text-violet-600 [&_svg]:h-4 sm:[&_svg]:h-[18px] [&_svg]:w-4 sm:[&_svg]:w-[18px]">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs sm:text-[13px] font-semibold text-slate-800">{title}</span>
        <span className="text-[10px] sm:text-[11.5px] text-slate-500">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
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
      <Orbital glow thinking className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0" />
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
                <span className={s.done ? "text-slate-400" : "text-slate-600"}>
                  {s.label}
                  {!s.done && <span className="excambia-ellipsis" />}
                </span>
              </li>
            ))}
            {!current && (
              <li className="flex items-center gap-2 text-[13px] text-slate-500">
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

function Message({ role, content, pending, toolResults, conversaId, operacaoId }: {
  role: string; content: string; pending?: boolean;
  toolResults?: any; conversaId?: number; operacaoId?: number;
}) {
  if (role === "user") {
    return (
      <div className="max-w-[85%] sm:max-w-[75%] self-end whitespace-pre-wrap break-words rounded-2xl bg-violet-600 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-[14px] leading-relaxed text-white shadow-sm">
        {content}
      </div>
    );
  }
  if (role === "assistant") {
    return (
      <div className="group flex w-full items-start gap-2 sm:gap-3">
        {pending ? (
          <Orbital glow thinking className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0" />
        ) : (
          <span className="flex h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 p-1">
            <LogoIcon />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {pending ? (
            <TypingDots />
          ) : (
            <>
              <div className="prose prose-sm max-w-none break-words text-slate-800 prose-p:my-2 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-slate-900 prose-strong:text-slate-900 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-violet-600 prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-violet-50 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:text-violet-700 prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-table:text-[13px] prose-th:border prose-th:border-slate-200 prose-th:bg-slate-50 prose-th:px-2 prose-th:py-1 prose-td:border prose-td:border-slate-200 prose-td:px-2 prose-td:py-1">
                <Streamdown>{content}</Streamdown>
              </div>
              <CalcResultCard toolResults={toolResults} conversaId={conversaId} operacaoId={operacaoId} />
              <CopyButton text={content} />
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
  planilha?: { url: string; fileName: string; formato?: string };
  resumo?: { custo?: number; preco?: number; margemPct?: number };
} | null {
  if (!Array.isArray(toolResults)) return null;
  let planilha: any;
  let resumo: any;
  for (const tr of toolResults) {
    if (!tr || tr.ok === false) continue;
    if (tr.name === "gerar_relatorio_calculo" && tr.data?.url) {
      planilha = { url: tr.data.url, fileName: tr.data.fileName ?? "Planilha.xlsx", formato: tr.data.formato };
    }
    if (tr.name === "montar_calculo" && tr.data?.summary) {
      const sm = tr.data.summary;
      resumo = {
        custo: sm.netCostTotal,
        preco: sm.salePriceTotal,
        margemPct: typeof sm.margemBruta === "number" ? sm.margemBruta * 100 : undefined,
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
          ? { url: calc.planilha.url, nome: calc.planilha.fileName, formato: calc.planilha.formato === "pdf" ? "pdf" : "excel" }
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
        <span className="text-[13px] font-semibold text-slate-800">Cálculo pronto</span>
      </div>

      {calc.resumo && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Custo líquido" value={brl(calc.resumo.custo)} />
          <Stat label="Preço de venda" value={brl(calc.resumo.preco)} />
          <Stat label="Margem bruta" value={calc.resumo.margemPct != null ? `${calc.resumo.margemPct.toFixed(1)}%` : "—"} />
        </div>
      )}

      {calc.planilha && (
        <a
          href={calc.planilha.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-violet-700 hover:bg-violet-50"
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <Eye className="h-4 w-4" /> Só visualizar
        </button>
      </div>
      {!operacaoId && (
        <p className="mt-2 text-[11px] text-slate-400">
          Enviar cria uma operação e dá sequência ao fluxo de importação. Só visualizar mantém apenas o preço.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[13px] font-semibold text-slate-800">{value}</div>
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
      className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 opacity-0 transition focus:opacity-100 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
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
      USD/BRL <b className="font-semibold text-slate-700">{displayRate}</b>
      <span className="text-[10px] text-teal-600">● PTAX</span>
    </span>
  );
}
