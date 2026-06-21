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

// logo (idealmente importar de assets do projeto; aqui referência ao arquivo público)
const LOGO = "/suppley-symbol.png";

export default function ExcambiaChat() {
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.conversas.create.useMutation({
    onSuccess: ({ id }) => { setActiveId(id); utils.conversas.list.invalidate(); },
  });
  const send = trpc.conversas.send.useMutation({
    onSuccess: () => { if (activeId) utils.conversas.get.invalidate({ id: activeId }); },
  });
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
    let id = activeId;
    if (!id) {
      const res = await create.mutateAsync({ titulo: text.slice(0, 40) });
      id = res.id; setActiveId(id);
    }
    send.mutate({ conversaId: id!, content: text });
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
      <div className="flex flex-1 flex-col bg-[#faf9fc]">
        {/* topbar fina */}
        <div className="flex h-[54px] items-center gap-3 px-6">
          <span className="text-sm font-semibold text-slate-800">Excambia</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <FxRate />
          </div>
        </div>

        {/* área de conversa */}
        <div ref={scrollRef} className="flex flex-1 flex-col items-center overflow-y-auto">
          {vazio ? (
            <Welcome onPick={(t) => setDraft(t)} />
          ) : (
            <div className="flex w-full max-w-[720px] flex-col gap-5 px-6 pt-6">
              {mensagens.map((m: any) => (
                <Message key={m.id} role={m.role} content={m.content} />
              ))}
              {send.isPending && <Message role="assistant" content="…" />}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="flex w-full justify-center bg-gradient-to-t from-[#faf9fc] px-6 pb-6 pt-3.5">
          <div className="w-full max-w-[700px]">
            <div className="flex items-end gap-2.5 rounded-[18px] border border-[#e2def0] bg-white p-2.5 pl-4 shadow-[0_4px_20px_rgba(49,18,96,0.05)] focus-within:border-violet-500">
              <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50">
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
              <textarea
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                rows={1} placeholder='Ex.: "preciso de 5.400 escoras galvanizadas da China"…'
                className="flex-1 resize-none bg-transparent py-1.5 text-[14px] text-slate-700 outline-none placeholder:text-slate-400"
              />
              <button onClick={handleSend}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-violet-600 text-white hover:bg-violet-700">
                <SendHorizontal className="h-[18px] w-[18px]" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
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
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center px-6 text-center">
      <img src={LOGO} alt="" className="mb-5 h-[50px] w-[50px] object-contain opacity-95" />
      <h1 className="mb-2.5 text-[26px] font-semibold tracking-tight text-slate-800">
        Olá, Jean. O que vamos{" "}
        <span className="bg-gradient-to-r from-violet-600 to-teal-600 bg-clip-text text-transparent">importar</span> hoje?
      </h1>
      <p className="mb-7 max-w-[430px] text-[14px] leading-relaxed text-slate-500">
        Descreva o que precisa, suba uma cotação ou abra uma operação na lista ao lado.
      </p>
      <div className="flex w-full max-w-[500px] flex-col gap-2.5">
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
      className="flex items-center gap-3.5 rounded-[13px] border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:-translate-y-px hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(104,42,186,0.06)]">
      <span className="flex h-[33px] w-[33px] flex-shrink-0 items-center justify-center rounded-[9px] bg-violet-50 text-violet-600 [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-[13px] font-semibold text-slate-800">{title}</span>
        <span className="text-[11.5px] text-slate-500">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-300" />
    </button>
  );
}

function Message({ role, content }: { role: string; content: string }) {
  if (role === "user") {
    return (
      <div className="max-w-[80%] self-end rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] leading-relaxed text-slate-800">
        {content}
      </div>
    );
  }
  if (role === "assistant") {
    return (
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-teal-600 p-1.5">
          <img src={LOGO} alt="" className="h-full w-full object-contain brightness-0 invert" />
        </span>
        <div className="pt-0.5 text-[14px] leading-relaxed text-slate-800 whitespace-pre-wrap">{content}</div>
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
