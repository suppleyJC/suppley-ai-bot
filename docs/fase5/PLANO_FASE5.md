# SUPPLEY — Fase 5: Base de Inteligência Viva
### Estruturação dos ambientes de dados, ingestão de documentos históricos e arquitetura agêntica coordenada pela Excambia

> O que a Fase 5 é, em uma frase: transformar proformas, invoices e cotações dispersas
> (planilhas e PDFs) em uma base estruturada, pesquisável e acionável, onde cada documento
> ingerido fortalece a inteligência da plataforma. A Excambia coordena; os agentes alimentam.

---

## 1. Ancoragem no que já existe (não recriar)

A Fase 5 reorganiza e amplia peças que JÁ estão no código:

| Capacidade da Fase 5 | Já existe | Papel na Fase 5 |
|---|---|---|
| Extrair dados de cotação/PDF | `quotationExtractorService` | vira o **Agente Documental** + **Agente de Preços** |
| Classificar NCM | `ncmService` + `ncmRouter` | vira o **Agente Fiscal/NCM** |
| Dados externos de mercado | `tradeData/` (Comex, ImportGenius, Panjiva) | alimenta **Inteligência de Mercado** |
| Rating de fornecedor | schemas de rating (desenhados) | vira o **Agente de Rating** |
| Análise preditiva | `predictiveAnalysisService` | vira o **Agente Preditivo** |
| Orquestração + tools | `server/agent/` (camada agêntica) | a base onde os novos agentes entram como **tools** |

**Conclusão:** a Fase 5 é, tecnicamente, (a) renomear/reorganizar ambientes, (b) criar
tabelas de catálogo (ativos, fornecedores ampliados, compradores), e (c) registrar os
agentes como tools no orquestrador que já existe. Não é um novo sistema.

---

## 2. Renomeações e nova estrutura de menu

### Renomeações
- **Produtos / Insumos** → **Ativos & Insumos** (escopo ampliado: do prego à linha de produção)
- **Fornecedores** → **Fornecedores / Fabricantes** (fábricas, tradings, distribuidores, nacionais)
- **Indústrias / Clientes** → sai da Base; vira **Compradores nacionais / Setores** dentro de Inteligência de Mercado

### Menu novo
```
INTELIGÊNCIA
  Excambia
  Inteligência de Mercado
    ├─ Câmbio
    ├─ Commodities
    ├─ Tendências de preço
    ├─ Compradores nacionais / Setores
    ├─ Benchmark de mercado
    ├─ Análises preditivas
    └─ API Bloomberg (e outras fontes)
OPERAÇÕES
  Painel de Operações
BASE OPERACIONAL
  Fornecedores / Fabricantes
  Ativos & Insumos
```

**Impacto técnico:** renomear é baixo risco (rótulos + rotas). Mover "Indústrias/Clientes"
para dentro de Inteligência de Mercado como "Compradores/Setores" muda a navegação e a
semântica da tabela `industries` (passa a ser lida como compradores nacionais para benchmark).

---

## 3. Os três ambientes-base (modelo de dados)

### 3.1 Ativos & Insumos (catálogo técnico-comercial-fiscal-histórico)
Substitui Produtos/Insumos. Nova tabela `ativos` (ou ampliar `products`):

Campos: descrição técnica · categoria · aplicação · material · dimensões · unidade ·
NCM (sugerido/validado) · origem (nacional/importado/ambos) · país de origem ·
fornecedores vinculados (nacionais e internacionais) · histórico de preços (nacional e
internacional) · MOQ · Incoterms praticados · lead time médio · documentos · desenhos ·
catálogos · proformas · invoices · cotações (nac. e int.) · operações vinculadas ·
**comparativo custo nacional × importado**.

**Selo visual de origem:** Nacional · Internacional · Nacional+Internacional ·
Importado anteriormente · Cotado mas não importado.

### 3.2 Fornecedores / Fabricantes
Amplia `suppliers`. Tipos: fábrica · trading · distribuidor · exportador · representante ·
fornecedor nacional · fabricante nacional · importador local · distribuidor brasileiro.

Campos: nome · **país (obrigatório/recomendado)** · cidade · tipo · origem (nac./int.) ·
selo de nacionalidade · categorias atendidas · ativos/insumos fornecidos · histórico de
cotações e pedidos · documentos · condições comerciais · moedas · Incoterms · lead time ·
ocorrências · não conformidades · rating · comparação com concorrentes.

### 3.3 Compradores nacionais / Setores (dentro de Inteligência de Mercado)
Reorganiza `industries` como base de **benchmark**, não operacional.

Mapeia: empresas compradoras BR · segmentos · regiões · categorias · perfil de demanda ·
recorrência · sensibilidade a preço · volumes estimados · histórico de oportunidades ·
potencial comercial. Responde perguntas de mercado (quem compra o quê, preço médio
nacional, importado × nacional, regiões de demanda, margem potencial por setor).

---

## 4. Arquitetura agêntica — o ciclo de inteligência

O princípio central da Fase 5 é o **fluxo circular**, não linear:

```
Excambia → agentes → bases estruturadas → agentes → Excambia
```

Cada agente não só executa: ele **alimenta** a inteligência geral. A Excambia consolida e
responde melhor a cada documento ingerido.

### Agentes por ambiente (subordinados à Excambia)
- **Agente de Ativos & Insumos** — identifica itens em documentos, padroniza descrição,
  classifica tipo, sugere NCM, vincula fornecedores, organiza histórico de preços,
  diferencia nacional×importado, apoia a decisão "importar ou comprar nacional".
- **Agente de Fornecedores / Fabricantes** — identifica/atualiza fornecedores, classifica
  tipo, registra país/origem, aplica selo, vincula a ativos, alimenta rating.
- **Agente de Inteligência de Mercado** — consolida interno+externo, tendências, benchmark,
  compradores nacionais, oportunidades.

### Agentes transversais (subordinados à Excambia)
- **Agente Documental** — lê PDF/planilha/invoice/proforma/cotação. *(base: quotationExtractorService)*
- **Agente de Preços** — extrai valor, moeda, MOQ, Incoterm, validade, variação.
- **Agente Fiscal / NCM** — sugere/valida NCM, sempre com validação humana possível. *(base: ncmService)*
- **Agente de Qualidade de Dados** — duplicidades, inconsistências, campos ausentes, baixa confiança.
- **Agente de Rating** — desempenho de fornecedores/categorias/ativos.
- **Agente Preditivo** — alta/baixa/estabilidade com interno+externo+câmbio+commodities. *(base: predictiveAnalysisService)*

**Como isso encaixa na camada agêntica existente:** cada agente é registrado como uma
**tool** (ou um conjunto de tools) no `server/agent/tools/`. A Excambia (orquestrador) os
aciona conforme a necessidade. "Agente" aqui = uma capacidade especializada que a Excambia
chama, não um processo separado — coeso com a decisão de copiloto único + tools.

---

## 5. Fluxo de ingestão de documentos

```
Upload (proforma/invoice/cotação/PDF/planilha)
  → Excambia identifica o tipo de documento
  → Agente Documental extrai os dados brutos
  → Agente de Ativos & Insumos identifica e estrutura os itens
  → Agente de Fornecedores/Fabricantes identifica/atualiza fornecedores
  → Agente de Preços registra valores e condições
  → Agente Fiscal/NCM sugere classificações
  → Agente de Qualidade de Dados valida consistência
  → Excambia consolida o resultado
  → Usuário revisa e APROVA (human-in-the-loop)
  → Dados gravados nas bases (ativos, fornecedores, preços, etc.)
```

**Dois pontos de entrada, mesma lógica:**
1. Upload pela Excambia (chat).
2. Upload direto nos ambientes (Fornecedores/Fabricantes ou Ativos & Insumos).
Ambos disparam o mesmo pipeline agêntico.

**Guardrail (coeso com a camada agêntica):** o NCM e os preços extraídos entram como
**sugestão com nível de confiança**, nunca como verdade automática. O usuário aprova.
Alíquota/fórmula continuam vindo só do motor determinístico.

---

## 6. Consultas em linguagem natural

A Excambia responde perguntas cruzando as bases (exemplos do documento):
"preço médio do prego 17x27?", "tem fornecedor nacional?", "vale importar ou comprar
nacional?", "esse item está em alta ou baixa?", "menor preço histórico?".

Tecnicamente: cada pergunta vira uma chamada de tool de **busca** (`buscar_ativo`,
`buscar_fornecedor`, `comparar_nacional_importado`) que consulta as bases estruturadas e
devolve à Excambia, que sintetiza a resposta. É o lado "leitura" do ciclo circular.

---

## 7. Integração com dados externos (Bloomberg e outras)

Inteligência de Mercado cruza dados internos com externos:
```
Ativos & Insumos + Fornecedores + Histórico de cotações + Compradores/Setores
  + Câmbio + Commodities + Dados externos (Bloomberg/etc.)
  = benchmark + oportunidade + previsão
```

**Honestidade técnica:** Bloomberg é uma integração **paga e licenciada** (Bloomberg API/
Terminal não é trivial nem barata). Recomendo modelar a Inteligência de Mercado atrás de
uma **interface de provedor** (como já existe em `tradeData/providers/`), começando com as
fontes gratuitas/baratas (Comex Stat, BCB para câmbio) e deixando Bloomberg como um provider
plugável para quando houver contrato. Não bloquear a Fase 5 esperando Bloomberg.

---

## 8. Plano de execução — fatias testáveis

Da fundação ao topo, cada uma entrega valor:

### Fatia 1 — Renomeações + estrutura de menu
Rótulos, rotas, mover Compradores/Setores para Inteligência de Mercado. Baixo risco.

### Fatia 2 — Modelo de dados dos 3 ambientes
Ampliar `products`→ativos, `suppliers`→fornecedores/fabricantes, `industries`→compradores.
Adicionar selo de origem, país, vínculos. Migrações aditivas.

### Fatia 3 — Pipeline de ingestão (o coração da Fase 5)
Orquestrar os agentes documentais sobre o `quotationExtractorService` existente.
Upload → extração → estruturação → revisão humana → gravação. Começar com 1 tipo
de documento (proforma) e expandir.

### Fatia 4 — Agentes como tools + busca em linguagem natural
Registrar os agentes no `server/agent/tools/`. Tools de busca para as consultas.

### Fatia 5 — Inteligência de Mercado + dados externos
Benchmark nacional×importado, preditiva, providers externos (Comex/BCB agora, Bloomberg depois).

---

## 9. Riscos e honestidade

- **Escopo grande:** a Fase 5 é a maior até aqui. Fatiar é essencial — não tentar tudo junto.
- **Ingestão de documentos históricos é trabalhosa e imperfeita:** PDFs/planilhas variam muito;
  a extração nunca é 100%. Por isso a **revisão humana** no pipeline é obrigatória, não opcional.
- **Bloomberg é caro e licenciado** — modelar plugável, não bloquear por ele.
- **Qualidade de dados:** lixo histórico vira lixo estruturado se não houver o Agente de
  Qualidade + revisão. Investir nisso desde o início.
- **Coordenação com a outra IA:** amplia `schema.ts` em várias tabelas — alto conflito.
- **A inteligência "viva" depende de volume:** com poucos documentos, o benchmark é fraco.
  O valor cresce com a base. Gerenciar expectativa: começa modesto, melhora com uso.
- **NCM/preço sempre como sugestão com confiança + aprovação humana** — salvaguarda fiscal.

---

## 10. O próximo passo concreto

Recomendo começar pela **Fatia 1 (renomeações + menu)** — baixo risco, alinha a plataforma
ao vocabulário da Fase 5 — em paralelo com o desenho do **modelo de dados (Fatia 2)**, que
é o que destrava o pipeline de ingestão. O pipeline (Fatia 3) é o coração, mas depende das
bases existirem primeiro.
