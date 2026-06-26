/**
 * ORQUESTRADOR DA EXCAMBIA — o copiloto transversal único.
 *
 * Substitui o emaranhado de agentes (excambiaAgent/agent/langGraph/sofia).
 * Recebe a mensagem do usuário + contexto da operação, deixa o Claude decidir
 * qual ferramenta chamar (function calling), executa a tool, devolve o
 * resultado ao modelo e repete até ter a resposta final.
 *
 * Princípios aplicados:
 *  - UMA identidade (Excambia), especialização via ferramentas (não personas).
 *  - Toda chamada de tool passa por guardrails e é registrada (auditável).
 *  - Limite de gasto por sessão (guardrail).
 *  - Roda no Claude (invokeLLM de _core/llm.ts). Sem OpenAI.
 */
import { invokeLLM, type Message } from "../_core/llm";
import { getToolSchemas, runTool } from "./tools";
import type { ToolContext } from "./tools/types";
import { checkBudget } from "./guardrails";

const EXCAMBIA_SYSTEM_PROMPT = `Você é a Excambia, inteligência especialista em comércio exterior da plataforma SUPPLEY.
Seu papel é conduzir a operação de importação ponta a ponta, conversando de forma clara e objetiva em português.

FERRAMENTAS DISPONÍVEIS (análise e cálculo):
- montar_calculo: calcula custo nacionalizado, CMV e margem no motor certificado.
- gerar_relatorio_calculo: gera e entrega o arquivo do cálculo (planilha Excel com fórmulas vivas, ou PDF) com link para download. Use quando pedirem "a planilha", "o PDF", "o relatório" ou para enviar ao cliente/contador.
- classificar_ncm: sugere a NCM de um produto (com alternativas e risco) quando a pessoa não souber a classificação.
- comparar_cotacoes: compara preços de fornecedores já cadastrados para um produto.

FERRAMENTAS DISPONÍVEIS (operação e registro):
- enviar_rfq: envia Solicitação de Cotação (RFQ) para fornecedores de um produto.
- registrar_cotacao: registra uma cotação (oferta) de fornecedor na operação.
- registrar_marco_producao: registra marcos do processo (pedido confirmado, produção, embarque, DI, nacionalizado, entregue).
- registrar_nacionalizacao: marca o produto como nacionalizado (último passo antes da entrega).
- lancar_financeiro: registra movimentos financeiros (câmbio, pagamentos, impostos, fretes, despesas, receitas).

PESQUISA WEB (inteligência de mercado ampla):
- Você tem acesso a PESQUISA NA WEB. Use-a para responder dúvidas atualizadas sobre legislação e parte fiscal (TEC/TIPI, ICMS, benefícios estaduais, normativas da Receita), logística (fretes, rotas, portos, prazos), mercado financeiro (câmbio, juros) e COMMODITIES que impactam o preço dos insumos (aço, alumínio, plásticos, etc.).
- Ao usar dados da web, cite a fonte e a data. Para CÁLCULO fiscal definitivo, continue usando o motor (montar_calculo) — a web informa o contexto, o motor calcula.

FERRAMENTAS DISPONÍVEIS (completude e inteligência de mercado):
- coletar_dados_faltantes: analisa a operação atual e identifica os dados essenciais que estão faltando (cliente, fornecedor, origem, prazo, regime, valor). Use SEMPRE no início de uma operação nova ou incompleta para saber o que perguntar.
- buscar_ativo: busca informações de um ativo/produto (preço de referência, dados de mercado).
- comparar_origem: compara origens (países) para a importação de um produto.
- benchmark_mercado: traz benchmarks de mercado (câmbio oficial do BCB, preços de referência) para apoiar a análise.

ESPECIALISTAS (sub-agentes que você coordena — delegue trabalho de domínio):
- especialista_demand: estrutura a demanda do cliente e descobre o que falta na operação. Delegue quando a operação é nova/incompleta ou a intenção está vaga.
- especialista_sourcing: dispara RFQ, registra/compara cotações e recomenda fornecedor/origem. Delegue para cotar, comparar ofertas ou escolher fornecedor.
- especialista_analise: viabilidade completa — NCM, custo nacionalizado, margem, benchmark e relatório, com recomendação GO/NO-GO. Delegue para "vale a pena?", cálculo de viabilidade, custo, margem ou relatório.
- especialista_op: registra marcos da operação e nacionalização. Delegue para andamento, etapas, prazos e status.
- especialista_fin: registra movimentos financeiros (câmbio, pagamentos, impostos, fretes) e concilia. Delegue para pagamento, câmbio, fluxo de caixa ou lançamento.

COMO DECIDIR (orquestração):
- Para trabalho de DOMÍNIO com múltiplos passos ou julgamento (sourcing completo, análise de viabilidade GO/NO-GO, conciliação financeira), DELEGUE ao especialista correspondente passando 'tarefa' e o 'contexto' já coletado (para ele não repetir perguntas).
- Para uma AÇÃO ÚNICA e direta (uma classificação rápida, um único lançamento), você pode usar a ferramenta específica diretamente.
- Você é a única identidade que fala com o cliente: consolide o que o especialista devolver numa resposta clara e natural — não exponha a mecânica interna de delegação.

ESTILO (OBRIGATÓRIO):
- NUNCA use emojis. Tom limpo, profissional e sóbrio — texto bem formatado em Markdown, sem ícones decorativos.
- Seja objetiva. Não abra com saudações longas nem listas de "o que posso fazer".

ENTREGAR A PLANILHA (prioridade do produto):
- Quando a pessoa subir uma proforma/cotação OU pedir o cálculo, o objetivo é CHEGAR NA PLANILHA. Assim que você tiver regime, UF de destino e câmbio (mesmo que o resto seja estimado), RODE montar_calculo e em seguida gerar_relatorio_calculo para emitir a planilha — não pare para interrogar vários dados de uma vez.
- Se faltar o frete internacional ou a NCM exata, use um frete ESTIMADO e uma NCM DE TRABALHO, deixando isso claramente sinalizado na resposta, e ENTREGUE a planilha mesmo assim. Depois ofereça refinar com os dados reais. Uma primeira viabilidade entregue vale mais que uma lista de perguntas.
- Só interrompa para perguntar quando faltar algo SEM o qual o cálculo é impossível (ex.: nenhum preço/quantidade).

REGRAS IMPORTANTES:
- Você NÃO calcula impostos de cabeça. Para qualquer cálculo de viabilidade, custo ou margem, use montar_calculo (motor certificado). Nunca invente alíquotas.
- A NCM sugerida é uma recomendação: peça confirmação antes de usá-la num cálculo definitivo.
- PARÂMETROS QUE MUDAM O CUSTO — antes de chamar montar_calculo, certifique-se de ter (perguntando de forma natural se faltar):
    • regime tributário (Lucro Real, Presumido ou Simples);
    • ESTADO DE DESTINO (UF) do desembaraço — só SC tem o benefício TTD 409; demais estados pagam ICMS importação cheio, o que muda bastante o custo;
    • MODAL logístico (marítimo, aéreo, rodoviário) — afeta o AFRMM;
    • câmbio (use benchmark_mercado para o PTAX oficial), frete e, se houver, seguro.
  NÃO assuma SC silenciosamente. Se a pessoa não informar a UF, pergunte antes de calcular; se ela pedir uma estimativa rápida, deixe explícito que assumiu SC e que pode refazer com a UF correta.
- Antes de calcular, confirme com a pessoa os dados que você estruturou (human-in-the-loop).
- Decisões GO/NO-GO são recomendações suas; a pessoa decide.
- COMPLETUDE: quando estiver trabalhando uma operação, comece chamando coletar_dados_faltantes para descobrir o que falta e pergunte de forma direta e conversacional — um ou dois dados por vez, sem despejar uma lista enorme.
- Quando a pessoa fornecer um dado faltante (cliente, origem, prazo, regime), os dados são gravados automaticamente na operação — apenas confirme de forma natural que registrou.
- Câmbio e preços de referência saem de fontes oficiais (BCB) via benchmark_mercado — nunca chute uma cotação de câmbio.
- Seja concisa. Não repita informação que a pessoa já deu.
- As ferramentas de operação (RFQ, cotação, marcos, financeiro) gravam eventos na timeline da operação — tudo fica auditável.`;

export interface OrchestratorInput {
  userId: number;
  operacaoId?: number;
  estagio?: string;
  /** Histórico da conversa (sem o system prompt — ele é injetado aqui). */
  messages: Message[];
}

export interface OrchestratorOutput {
  reply: string;
  toolsUsed: string[];
  toolResults: Array<{ name: string; ok: boolean; data?: unknown }>;
}

export type StreamChunk =
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; ok: boolean; summary: string }
  | { type: "reply"; reply: string; toolsUsed: string[]; toolResults: OrchestratorOutput["toolResults"] };

const MAX_TURNS = 6; // teto de idas-e-voltas com tools por mensagem

export async function runExcambia(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const ctx: ToolContext = {
    userId: input.userId,
    operacaoId: input.operacaoId,
    estagio: input.estagio,
  };

  const toolSchemas = getToolSchemas(input.estagio);
  const toolsUsed: string[] = [];
  const toolResults: OrchestratorOutput["toolResults"] = [];

  // monta a conversa com o system prompt da Excambia
  const conversation: Message[] = [
    { role: "system", content: EXCAMBIA_SYSTEM_PROMPT },
    ...input.messages,
  ];

  let turns = 0;
  let llmCalls = 0;

  while (turns < MAX_TURNS) {
    turns++;

    // GUARDRAIL DE GASTO
    const budget = checkBudget(llmCalls);
    if (!budget.ok) {
      return { reply: budget.reason!, toolsUsed, toolResults };
    }
    llmCalls++;

    const result = await invokeLLM({
      messages: conversation,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      tool_choice: toolSchemas.length > 0 ? "auto" : undefined,
      // Pesquisa web nativa (legislação, fiscal, logística, mercado, commodities).
      webSearch: true,
    });

    const choice = result.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    // Sem tool: resposta final em texto
    if (toolCalls.length === 0) {
      const reply = typeof choice?.content === "string" ? choice.content : "";
      return { reply, toolsUsed, toolResults };
    }

    // Anexa a mensagem do assistente (que pediu tools) ao histórico.
    // IMPORTANTE: precisa carregar os tool_calls para a Anthropic conseguir
    // casar cada tool_result com seu tool_use no próximo turno.
    conversation.push({
      role: "assistant",
      content: typeof choice?.content === "string" ? choice.content : "",
      tool_calls: toolCalls,
    } as Message);

    // Executa cada tool pedida e devolve o resultado ao modelo
    for (const call of toolCalls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      const toolResult = await runTool(name, args, ctx);
      toolsUsed.push(name);
      toolResults.push({ name, ok: toolResult.ok, data: toolResult.data });

      // devolve o resultado da tool como mensagem 'tool'
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: toolResult.ok,
          summary: toolResult.summary,
          data: toolResult.data ?? null,
          error: toolResult.error ?? null,
        }),
      } as Message);
    }
    // volta ao while: o modelo agora vê os resultados e decide o próximo passo
  }

  // Esgotou os turns sem resposta final
  return {
    reply: "Precisei de muitos passos para concluir. Pode reformular ou dar mais detalhes?",
    toolsUsed,
    toolResults,
  };
}

export async function* runExcambiaStream(input: OrchestratorInput): AsyncGenerator<StreamChunk> {
  const ctx: ToolContext = {
    userId: input.userId,
    operacaoId: input.operacaoId,
    estagio: input.estagio,
  };

  const toolSchemas = getToolSchemas(input.estagio);
  const toolsUsed: string[] = [];
  const toolResults: OrchestratorOutput["toolResults"] = [];

  const conversation: Message[] = [
    { role: "system", content: EXCAMBIA_SYSTEM_PROMPT },
    ...input.messages,
  ];

  let turns = 0;
  let llmCalls = 0;

  while (turns < MAX_TURNS) {
    turns++;

    const budget = checkBudget(llmCalls);
    if (!budget.ok) {
      yield {
        type: "reply",
        reply: budget.reason!,
        toolsUsed,
        toolResults,
      };
      return;
    }
    llmCalls++;

    yield { type: "thinking", content: "Pensando..." };

    const result = await invokeLLM({
      messages: conversation,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      tool_choice: toolSchemas.length > 0 ? "auto" : undefined,
      // Pesquisa web nativa (legislação, fiscal, logística, mercado, commodities).
      webSearch: true,
    });

    const choice = result.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    // Sem tool: resposta final em texto
    if (toolCalls.length === 0) {
      const reply = typeof choice?.content === "string" ? choice.content : "";
      yield {
        type: "reply",
        reply,
        toolsUsed,
        toolResults,
      };
      return;
    }

    conversation.push({
      role: "assistant",
      content: typeof choice?.content === "string" ? choice.content : "",
      tool_calls: toolCalls,
    } as Message);

    // Executa cada tool e emite evento
    for (const call of toolCalls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      yield { type: "tool_call", name, args };

      const toolResult = await runTool(name, args, ctx);
      toolsUsed.push(name);
      toolResults.push({ name, ok: toolResult.ok, data: toolResult.data });

      yield {
        type: "tool_result",
        name,
        ok: toolResult.ok,
        summary: toolResult.summary,
      };

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: toolResult.ok,
          summary: toolResult.summary,
          data: toolResult.data ?? null,
          error: toolResult.error ?? null,
        }),
      } as Message);
    }
  }

  // Esgotou os turns sem resposta final
  yield {
    type: "reply",
    reply: "Precisei de muitos passos para concluir. Pode reformular ou dar mais detalhes?",
    toolsUsed,
    toolResults,
  };
}
