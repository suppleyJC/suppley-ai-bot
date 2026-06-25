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
import { trpc } from "@/lib/trpc";
import ConversationPanel from "@/components/excambia/ConversationPanel";
import { Paperclip, SendHorizontal, Plus, BarChart3, TrendingUp, ChevronRight, Copy, Check } from "lucide-react";
import { Streamdown } from "streamdown";

// Ícone oficial SUPPLEY (símbolo recortado do logo, fundo transparente)
const LogoIcon = ({ className }: { className?: string }) => (
  <img src="/suppley-icon.png" alt="Excambia" className={className ?? "h-full w-full object-contain"} />
);

export default function ExcambiaChat() {
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  // No mobile inicia recolhido (chat ocupa a tela toda); no desktop, expandido.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  );
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.conversas.create.useMutation({
    onSuccess: ({ id }) => { setActiveId(id); utils.conversas.list.invalidate(); },
  });
  const send = trpc.conversas.send.useMutation();
  const { data: conv } = trpc.conversas.get.useQuery(
    { id: activeId! }, { enabled: activeId != null },
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [conv?.mensagens]);

  // Auto-grow do composer: cresce com o texto até um teto e então rola.
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [draft]);

  async function handleNew() { create.mutate({}); }

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    try {
      let id = activeId;
      let operacaoId = conv?.operacaoId;
      if (!id) {
        const res = await create.mutateAsync({ titulo: text.slice(0, 40) });
        id = res.id; setActiveId(id);
        operacaoId = undefined;
      }
      // Histórico só com papéis aceitos pelo orquestrador (exclui "tool")
      const history = mensagens
        .filter((m: any) => m.role === "user" || m.role === "assistant" || m.role === "system")
        .map((m: any) => ({ role: m.role, content: m.content }));
      const messages = [...history, { role: "user" as const, content: text }];

      await send.mutateAsync({
        conversaId: id!,
        messages,
        ...(operacaoId ? { operacaoId } : {}),
      });

      utils.conversas.get.invalidate({ id: id! });
      utils.conversas.list.invalidate();
    } catch (err: any) {
      console.error("Falha ao enviar mensagem:", err);
      setDraft(text); // devolve o texto para não perder a mensagem
    }
  }

  const mensagens = conv?.mensagens ?? [];
  const vazio = mensagens.length === 0;

  return (
    <div className="relative flex h-full">
      <ConversationPanel
        activeId={activeId} onSelect={setActiveId} onNew={handleNew}
        collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      {/* CHAT */}
      <div className="flex flex-1 flex-col bg-[#faf9fc] min-h-0">
        {/* topbar fina */}
        <div className="flex h-[54px] items-center gap-2 sm:gap-2.5 px-3 sm:px-6 border-b border-slate-100">
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
            <div className="flex w-full max-w-full sm:max-w-2xl lg:max-w-3xl flex-col gap-4 sm:gap-6 px-3 sm:px-6 pt-4 sm:pt-6 pb-2">
              {mensagens.map((m: any) => (
                <Message key={m.id} role={m.role} content={m.content} />
              ))}
              {send.isPending && <Message role="assistant" content="…" pending />}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="flex w-full justify-center bg-gradient-to-t from-[#faf9fc] px-3 sm:px-6 pb-4 sm:pb-6 pt-2.5 sm:pt-3.5">
          <div className="w-full max-w-full sm:max-w-2xl lg:max-w-3xl">
            <div className="flex items-end gap-2 sm:gap-2.5 rounded-[18px] border border-[#e2def0] bg-white p-2 sm:p-2.5 pl-3 sm:pl-4 shadow-[0_4px_20px_rgba(49,18,96,0.05)] transition-colors focus-within:border-violet-500 focus-within:shadow-[0_4px_24px_rgba(104,42,186,0.12)]">
              <button className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 flex-shrink-0">
                <Paperclip className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
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
    </div>
  );
}

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-3 sm:px-6 py-8 sm:py-12 text-center min-h-0">
      <LogoIcon className="h-14 w-14 sm:h-16 sm:w-16 mb-4 sm:mb-5 flex-shrink-0" />
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

function Message({ role, content, pending }: { role: string; content: string; pending?: boolean }) {
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
        <span className="flex h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 p-1">
          <LogoIcon />
        </span>
        <div className="min-w-0 flex-1">
          {pending ? (
            <TypingDots />
          ) : (
            <>
              <div className="prose prose-sm max-w-none break-words text-slate-800 prose-p:my-2 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-slate-900 prose-strong:text-slate-900 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-violet-600 prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-violet-50 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:text-violet-700 prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-table:text-[13px] prose-th:border prose-th:border-slate-200 prose-th:bg-slate-50 prose-th:px-2 prose-th:py-1 prose-td:border prose-td:border-slate-200 prose-td:px-2 prose-td:py-1">
                <Streamdown>{content}</Streamdown>
              </div>
              <CopyButton text={content} />
            </>
          )}
        </div>
      </div>
    );
  }
  return null; // system/tool não renderizam
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
  // opcional: trpc.exchange.getRate. Placeholder enquanto não liga.
  return (
    <span className="flex items-center gap-1.5">
      USD/BRL <b className="font-semibold text-slate-700">5,1442</b>
      <span className="text-[10px] text-teal-600">● PTAX</span>
    </span>
  );
}
