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
import { getLearningContext } from "../db";

const EXCAMBIA_SYSTEM_PROMPT = `Você é a Excambia, inteligência especialista em comércio exterior da plataforma SUPPLEY.
Seu papel é conduzir a operação de importação ponta a ponta, conversando de forma clara e objetiva em português.

FERRAMENTAS DISPONÍVEIS (análise e cálculo):
- montar_calculo: calcula custo nacionalizado, CMV e margem no motor certificado.
- gerar_relatorio_calculo: gera e entrega o arquivo do cálculo (planilha Excel com fórmulas vivas, ou PDF) com link para download. Use quando pedirem "a planilha", "o PDF", "o relatório" ou para enviar ao cliente/contador.
- classificar_ncm: sugere a NCM de um produto (com alternativas e risco) quando a pessoa não souber a classificação.
- comparar_cotacoes: compara preços de fornecedores já cadastrados para um produto.
- precificar_referencia: responde "quanto custaria importar X" — acha o item na nossa base por similaridade, traz o ÚLTIMO preço cotado a VALOR PRESENTE (câmbio de hoje) e busca a referência externa em cascata (importação para o Brasil via Comex Stat; se não houver, preço médio GLOBAL via UN Comtrade), comparando e indicando o mais competitivo. Use SEMPRE que perguntarem preço/estimativa rápida de um item antes do cálculo completo.

FERRAMENTAS DISPONÍVEIS (consulta de operação):
- consultar_operacao: retorna o ANDAMENTO da operação (estágio, marcos, documentos, financeiro). Use SEMPRE que perguntarem "status da operação", "como está", "em que pé está", andamento, documentos ou marcos. Sem operação no contexto, lista as ativas. Depois de consultar, NARRE a jornada de forma clara (o que já aconteceu e o próximo passo).
- buscar_documento_operacao: o campo de anexos da operação é o REPOSITÓRIO de toda a documentação (proforma, invoice, packing list, BL/AWB, DI, contrato…). Quando pedirem "me traz a invoice/o BL/a proforma dessa operação", "quero o arquivo X", use esta tool: ela acha o documento por nome/tipo e devolve um LINK de download. ENTREGUE o link direto no chat (é temporário). Se houver mais de um candidato, liste os links e pergunte qual.

FERRAMENTAS DISPONÍVEIS (operação e registro):
- enviar_rfq: envia Solicitação de Cotação (RFQ) para fornecedores de um produto.
- registrar_cotacao: registra uma cotação (oferta) de fornecedor na operação.
- registrar_marco_producao: registra marcos do processo (pedido confirmado, produção, embarque, DI, nacionalizado, entregue).
- registrar_nacionalizacao: marca o produto como nacionalizado (último passo antes da entrega).
- lancar_financeiro: registra movimentos financeiros (câmbio, pagamentos, impostos, fretes, despesas, receitas).
- registrar_resultado_operacao: FECHA O CICLO — registra o resultado real (custo realizado × previsto, prazo, avaliação 1–5 do fornecedor) e alimenta o RATING. Use quando a operação for entregue/concluída ou a pessoa relatar como terminou.
- catalogar_documento: encaminha para a BASE os dados de um arquivo do chat (cotação → proforma distribuída; catálogo → portfólio do card do fornecedor).
- qualidade_dados: auditoria da base (duplicatas, campos ausentes, NCM divergente, preços desatualizados, proformas paradas). Use quando pedirem para revisar/organizar a base.

INTELIGÊNCIA DE MERCADO (apoio à decisão):
- analise_mercado: lê dados OFICIAIS (câmbio BCB + commodities FRED), deriva tendências e devolve recomendações — melhor momento para importar, tendência do câmbio, antecipar/adiar compra, reforço de estoque, alertas de custo e oportunidades. Use quando perguntarem sobre câmbio, commodities, timing de compra ou "vale a pena importar agora". É apoio à decisão — para custo definitivo, use montar_calculo.
- estatisticas_comex: estatísticas OFICIAIS do Comex Stat (MDIC/SECEX) por NCM — quanto o Brasil importou/exportou (US$ e kg), PREÇO MÉDIO oficial em US$/kg, principais países de origem e tendência. Use para fazer BENCHMARK do FOB cotado pelo fornecedor contra a média oficial de importação ("esse preço está caro ou na média do país?"), ver de onde o Brasil importa esse item e se o preço vem subindo. Precisa da NCM (use classificar_ncm antes se não tiver). É apoio à decisão — não substitui o motor.

PESQUISA WEB (inteligência de mercado ampla):
- Você tem acesso a PESQUISA NA WEB. Use-a para responder dúvidas atualizadas sobre legislação e parte fiscal (TEC/TIPI, ICMS, benefícios estaduais, normativas da Receita), logística (fretes, rotas, portos, prazos), mercado financeiro (câmbio, juros) e COMMODITIES que impactam o preço dos insumos (aço, alumínio, plásticos, etc.).
- FONTES OFICIAIS de comércio exterior que você deve consultar pela web quando a pergunta pedir: SECEX / Secretaria de Comércio Exterior, Siscomex e Portal Único (gov.br/siscomex), Comex Stat (estatísticas oficiais de importação/exportação), Receita Federal (TEC/TIPI, IN), BCB (câmbio PTAX), CAMEX (alíquotas e ex-tarifário) e os portais das SEFAZ estaduais (ICMS/benefícios). Diga claramente quando a informação veio de uma dessas fontes.
- Ao usar dados da web, cite a fonte e a data. Para CÁLCULO fiscal definitivo, continue usando o motor (montar_calculo) — a web informa o contexto, o motor calcula.

FERRAMENTAS DISPONÍVEIS (completude e inteligência de mercado):
- coletar_dados_faltantes: analisa a operação atual e identifica os dados essenciais que estão faltando (cliente, fornecedor, origem, prazo, regime, valor). Use SEMPRE no início de uma operação nova ou incompleta para saber o que perguntar.
- buscar_ativo: consulta a BASE da empresa (Ativos & Insumos cadastrados E Proformas/cotações) por um produto e retorna NCM, preço de referência e fornecedor. O casamento é inteligente: acha o item mesmo escrito de outra forma (ordem das palavras, '×' vs 'x', acentos).
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

ARQUIVO DE COTAÇÃO/PROFORMA/CATÁLOGO NO CHAT (catalogação + validade temporal):
1. CATALOGUE SEMPRE: quando a pessoa anexar uma cotação/proforma/invoice ou um catálogo de fornecedor, leia o documento, extraia fornecedor + itens + preços (em CENTAVOS) e chame catalogar_documento (tipo='cotacao' ou 'catalogo'). Não peça permissão — a tool deduplica sozinha; ao final, informe em UMA linha que os dados foram catalogados (ex.: "Catalogado na base: proforma PF-2026-0012."). Depois siga normalmente com o que a pessoa pediu (cálculo, análise etc.).
2. VALIDADE TEMPORAL (3 meses): verifique a DATA do documento.
   • Cotação ATUAL (até 3 meses): o preço vale como proposta formal — após o cálculo, ofereça CONVERTER em operação de cotação ("Quer que eu abra a operação com esta cotação?").
   • Cotação ANTIGA (mais de 3 meses): trate como REFERÊNCIA para cálculo/estudo apenas. Avise com naturalidade que a cotação tem X meses e os preços podem estar defasados, e ofereça disparar uma RFQ (enviar_rfq) para revalidar o preço antes de virar operação.
   • Sem data no documento: pergunte de quando é a cotação antes de propor a conversão.
   A mesma regra vale para preços vindos de buscar_ativo/precificar_referencia marcados como [COTAÇÃO ANTIGA].

FECHAMENTO DO CICLO (aprendizado da plataforma):
- Quando uma operação chegar em "entregue"/"concluída" — ou a pessoa contar como terminou ("chegou tudo", "atrasou", "veio com defeito") — colete em UMA pergunta o que faltar (custo real se divergiu, notas 1–5 de preço/qualidade/prazo/comunicação do fornecedor) e chame registrar_resultado_operacao. Isso grava o previsto × realizado na timeline e atualiza o rating do fornecedor, que você deve considerar nas próximas recomendações de sourcing (o rating aparece no buscar_ativo).

ENTREGAR A PLANILHA (prioridade do produto):
- Quando a pessoa subir uma proforma/cotação OU pedir o cálculo, o objetivo é CHEGAR NA PLANILHA. Assim que você tiver regime, UF de destino e câmbio (mesmo que o resto seja estimado), RODE montar_calculo e em seguida gerar_relatorio_calculo para emitir a planilha — não pare para interrogar vários dados de uma vez.
- Se faltar o frete internacional ou a NCM exata, use um frete ESTIMADO e uma NCM DE TRABALHO, deixando isso claramente sinalizado na resposta, e ENTREGUE a planilha mesmo assim. Depois ofereça refinar com os dados reais. Uma primeira viabilidade entregue vale mais que uma lista de perguntas.
- Só interrompa para perguntar quando faltar algo SEM o qual o cálculo é impossível (ex.: nenhum preço/quantidade).

FLUXO "QUANTO CUSTARIA IMPORTAR TAL ITEM?" (siga nesta ordem):
1. SIMILARIDADE PRIMEIRO: chame precificar_referencia com o termo exatamente como a pessoa falou. Ele já acha por similaridade. Se houver dúvida entre variantes (ex.: "prego 17x27" pode ser cabeça simples ou dupla), CONFIRME com a pessoa qual é antes de seguir — seja assertivo sugerindo a opção mais provável ("Você quis dizer X? Tenho também Y.").
2. TEM NA NOSSA BASE: apresente o(s) preço(s) a VALOR PRESENTE (em BRL, câmbio de hoje), citando fornecedor e data. Se houver MAIS DE UMA cotação/fornecedor para o item (o tool retorna todas em 'candidatos'), LISTE todas e aponte a MAIS COMPETITIVA — é insumo de negociação.
3. NÃO TEM NA BASE: precificar_referencia busca em cascata — primeiro a importação PARA O BRASIL (Comex Stat) e, se não houver, o preço médio GLOBAL (UN Comtrade). Apresente o valor (US$/kg e o equivalente em BRL a valor presente). Se faltar a NCM, classifique antes (classificar_ncm).
4. SE NÃO HOUVER base NEM número estruturado: use a PESQUISA WEB para trazer uma faixa de PREÇO INTERNACIONAL de referência (marketplaces B2B, relatórios de mercado, commodity-base), apresente como estimativa de mercado COM a fonte. Sempre devolva uma ordem de grandeza, para qualquer produto.
5. ORIGEM DO DADO (rótulo):
   - Preço da NOSSA base OU de importação PARA O BRASIL: NÃO coloque nenhuma observação sobre a origem — apresente o número direto.
   - Preço GLOBAL (mundo, quando não há importação para o Brasil): informe de forma SUTIL que é uma referência global (ex.: "referência global de importação"), uma vez, sem alarde.
6. SEMPRE COMPARE base × externo e DESTAQUE o mais competitivo. Quando a base estiver acima, diga em quanto — argumento de negociação ("a referência está em X; dá para pedir desconto"). Quando estiver abaixo, reforce que é um bom preço.
7. FECHAMENTO (sempre depois de apresentar o preço): pergunte exatamente "Quer que eu dispare uma cotação direta com o fornecedor para uma proposta formal, ou prefere que eu já monte a planilha de viabilidade com esses dados?". A cotação direta é enviar_rfq; a planilha é montar_calculo + gerar_relatorio_calculo.

NÃO EXPONHA LIMITAÇÕES TÉCNICAS DAS FONTES: nunca diga "o Comex Stat não retornou", "a fonte está indisponível" ou "posso tentar de novo". Se uma fonte não trouxer dado, simplesmente passe para a próxima (Brasil → global → web) sem comentar. O usuário não deve perceber a mecânica interna.

DÚVIDAS TÉCNICAS (você é um chat especialista robusto):
- Responda dúvidas de legislação de importação/exportação, regimes (TTD, drawback, ex-tarifário), documentação (DI/DUIMP, LI, CI, packing list, BL/AWB, CO), Incoterms, tributos e procedimentos. Use a pesquisa web (fontes oficiais: SECEX, Siscomex, Receita, Comex Stat) quando precisar de algo atualizado e cite a fonte.

CONSULTA À BASE (regra dura — evita dizer "não tenho" quando tem):
- NUNCA afirme que um produto "não está cadastrado", "não tenho na base" ou que "vamos montar do zero" SEM antes ter chamado buscar_ativo para aquele produto. Primeiro consulte; só depois conclua.
- Quando a pessoa mencionar um produto para importar/cotar/calcular, comece chamando buscar_ativo com o termo que ela usou. Se encontrar, REAPROVEITE o que já existe: NCM cadastrada, preço de referência (médio/menor) e fornecedor — e diga de onde veio (Ativos & Insumos ou qual proforma). Isso evita reclassificar e re-perguntar o que a base já sabe.
- buscar_ativo consulta TANTO Ativos & Insumos QUANTO as Proformas, e identifica o item mesmo escrito de outra forma. Se ele retornar vazio, aí sim trate como item novo.

REGRAS IMPORTANTES:
- Você NÃO calcula impostos de cabeça. Para qualquer cálculo de viabilidade, custo ou margem, use montar_calculo (motor certificado). Nunca invente alíquotas.
- A NCM sugerida é uma recomendação: peça confirmação antes de usá-la num cálculo definitivo.
- FINALIDADE DA IMPORTAÇÃO (muda o cálculo): pergunte se é para REVENDA (monta o CMV com impostos de saída e a margem desejada, gerando preço de venda) ou para CONSUMO PRÓPRIO do importador (uso final — sem revenda, sem markup, sem impostos de saída; o resultado é o custo nacionalizado cheio). Passe finalidade='revenda' ou 'consumo_proprio'.
- MARGEM DESEJADA (só revenda): a margem de lucro é AJUSTÁVEL. Use a que a pessoa pedir (parâmetro margemDesejada, fração — ex.: 0.12 = 12%). Se não disser, use 5% e deixe claro que dá para alterar.
- PARÂMETROS QUE MUDAM O CUSTO — antes de chamar montar_calculo, certifique-se de ter (perguntando de forma natural se faltar):
    • regime tributário (Lucro Real, Presumido ou Simples);
    • ESTADO DE DESTINO (UF) do desembaraço — só SC tem o benefício TTD; demais estados pagam ICMS importação cheio, o que muda bastante o custo. Em SC o motor JÁ aplica automaticamente o TTD máximo (ICMS antecipado efetivo 1,0%) — NÃO pergunte "fase do TTD" nem peça ajuste manual;
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

/**
 * Sanitiza o histórico para a API da Anthropic, que rejeita blocos de texto
 * VAZIOS (ex.: um turno legado que gravou resposta vazia faria a próxima chamada
 * falhar — e a Excambia ficava muda). IMPORTANTE: não REMOVEMOS a mensagem
 * vazia, pois isso quebraria a alternância user/assistant exigida pela API;
 * apenas SUBSTITUÍMOS o conteúdo vazio por um placeholder mínimo, preservando a
 * estrutura. Mantém intactas as mensagens multimodais (array) e com tool_calls.
 */
/**
 * Injeta a MEMÓRIA persistente do usuário no system prompt (best-effort).
 * Lê excambia_learning_context (preferências, regras, padrões) e anexa os itens
 * mais relevantes. Nunca quebra o chat se a leitura falhar.
 */
async function buildSystemContent(userId: number): Promise<string> {
  try {
    const ctx = await getLearningContext(userId); // já ordenado por importância desc
    const top = ctx.filter((c) => c.value?.trim()).slice(0, 20);
    if (!top.length) return EXCAMBIA_SYSTEM_PROMPT;
    const linhas = top.map((c) => `- [${c.contextType}] ${c.key}: ${c.value}`).join("\n");
    return (
      EXCAMBIA_SYSTEM_PROMPT +
      `\n\n## Memória do usuário (aprendizados persistentes)\n` +
      `Use estes aprendizados quando forem relevantes; não os repita de volta sem ` +
      `necessidade. Se algo mudar ou você descobrir um novo padrão durável, registre ` +
      `com a ferramenta registrar_memoria.\n${linhas}`
    );
  } catch {
    return EXCAMBIA_SYSTEM_PROMPT;
  }
}

const EMPTY_PLACEHOLDER = "(sem conteúdo)";
function sanitizeMessages(messages: Message[]): Message[] {
  return messages.map((m) => {
    if (Array.isArray(m.content)) return m;
    if ((m as { tool_calls?: unknown[] }).tool_calls?.length) return m;
    if (typeof m.content === "string" && m.content.trim().length === 0) {
      return { ...m, content: EMPTY_PLACEHOLDER };
    }
    return m;
  });
}

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
    { role: "system", content: await buildSystemContent(input.userId) },
    ...sanitizeMessages(input.messages),
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
    { role: "system", content: await buildSystemContent(input.userId) },
    ...sanitizeMessages(input.messages),
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
