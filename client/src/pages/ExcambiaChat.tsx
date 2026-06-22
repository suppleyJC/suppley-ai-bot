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
import { Paperclip, SendHorizontal, Plus, BarChart3, TrendingUp, ChevronRight } from "lucide-react";

// Símbolo orbital da Excambia (gradiente violeta → teal), desenhado inline em SVG
// para ficar nítido em qualquer tamanho e herdar a cor de fundo do container.
const LogoIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" className={className ?? "h-full w-full"} aria-label="Excambia">
    <defs>
      <linearGradient id="excambiaGrad" x1="15" y1="15" x2="85" y2="85" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#7c3aed" />
        <stop offset="1" stopColor="#0d9488" />
      </linearGradient>
    </defs>
    <g stroke="url(#excambiaGrad)" strokeWidth="4.5">
      {/* círculo principal */}
      <circle cx="50" cy="50" r="34" />
      {/* duas órbitas elípticas cruzadas */}
      <ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(45 50 50)" />
      <ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(-45 50 50)" />
    </g>
    {/* nós sobre as órbitas */}
    <circle cx="74" cy="32" r="5.5" fill="url(#excambiaGrad)" />
    <circle cx="68" cy="74" r="5.5" fill="url(#excambiaGrad)" />
    {/* marca central "X" */}
    <path d="M40 44 L48 50 L40 56 M52 44 L52 56" stroke="url(#excambiaGrad)" strokeWidth="4.5"
      strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export default function ExcambiaChat() {
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
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
    <div className="flex h-full">
      <ConversationPanel
        activeId={activeId} onSelect={setActiveId} onNew={handleNew}
        collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      {/* CHAT */}
      <div className="flex flex-1 flex-col bg-[#faf9fc] min-h-0">
        {/* topbar fina */}
        <div className="flex h-[54px] items-center gap-3 px-3 sm:px-6">
          <span className="text-sm font-semibold text-slate-800">Excambia</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <FxRate />
          </div>
        </div>

        {/* área de conversa */}
        <div ref={scrollRef} className="flex flex-1 flex-col items-center overflow-y-auto min-h-0">
          {vazio ? (
            <Welcome onPick={(t) => setDraft(t)} />
          ) : (
            <div className="flex w-full max-w-xs sm:max-w-sm md:max-w-xl lg:max-w-2xl flex-col gap-3 sm:gap-5 px-3 sm:px-6 pt-4 sm:pt-6">
              {mensagens.map((m: any) => (
                <Message key={m.id} role={m.role} content={m.content} />
              ))}
              {send.isPending && <Message role="assistant" content="…" />}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="flex w-full justify-center bg-gradient-to-t from-[#faf9fc] px-3 sm:px-6 pb-4 sm:pb-6 pt-2.5 sm:pt-3.5">
          <div className="w-full max-w-xs sm:max-w-sm md:max-w-xl lg:max-w-2xl">
            <div className="flex items-end gap-2 sm:gap-2.5 rounded-[18px] border border-[#e2def0] bg-white p-2 sm:p-2.5 pl-3 sm:pl-4 shadow-[0_4px_20px_rgba(49,18,96,0.05)] focus-within:border-violet-500">
              <button className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 flex-shrink-0">
                <Paperclip className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              </button>
              <textarea
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                rows={1} placeholder='Ex.: "5.400 escoras galvanizadas da China"…'
                className="flex-1 resize-none bg-transparent py-1.5 text-sm sm:text-[14px] text-slate-700 outline-none placeholder:text-slate-400"
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

function Message({ role, content }: { role: string; content: string }) {
  if (role === "user") {
    return (
      <div className="max-w-[85%] sm:max-w-[75%] self-end rounded-2xl border border-slate-200 bg-white px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-[14px] leading-relaxed text-slate-800">
        {content}
      </div>
    );
  }
  if (role === "assistant") {
    return (
      <div className="flex items-start gap-2 sm:gap-3 w-full">
        <span className="flex h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 p-1">
          <LogoIcon />
        </span>
        <div className="pt-0.5 text-sm sm:text-[14px] leading-relaxed text-slate-800 whitespace-pre-wrap">{content}</div>
      </div>
    );
  }
  return null; // system/tool não renderizam
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
