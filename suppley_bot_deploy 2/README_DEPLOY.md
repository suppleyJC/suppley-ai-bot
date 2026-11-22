# Suppley AI Telegram Bot

Bot de Telegram integrado com Suppley AI Agent — seu Head of AI Virtual.
O agente usa a API do **DeepSeek** (compatível com a OpenAI).

## Deploy no Railway

### Passo 1: Criar Repositório no GitHub

1. Acesse: https://github.com/new
2. Nome: `suppley-ai-bot`
3. Visibilidade: Private
4. Clique "Create repository"

### Passo 2: Upload dos Arquivos

Faça upload destes arquivos para o repositório:

- `suppley_ai_agent.py`
- `suppley_telegram_bot_final.py`
- `requirements.txt`
- `Procfile`
- `runtime.txt`
- `README_DEPLOY.md` (este arquivo)

### Passo 3: Deploy no Railway

1. Acesse: https://railway.app
2. Faça login com GitHub
3. Clique "New Project"
4. Selecione "Deploy from GitHub repo"
5. Escolha o repositório `suppley-ai-bot`
6. Clique "Deploy Now"

### Passo 4: Configurar Variáveis de Ambiente

No Railway, vá em "Variables" e adicione:

```
TELEGRAM_TOKEN=seu_token_do_botfather
DEEPSEEK_API_KEY=sua_chave_aqui
```

Opcionais (têm valores padrão no código):

```
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

**Importante:** o token do Telegram e a chave do DeepSeek **nunca** devem ser
commitados no repositório. Configure-os apenas como variáveis de ambiente.

Sobre o modelo: `deepseek-chat` é a escolha para conversa e análises gerais.
`deepseek-reasoner` raciocina mais em troca de respostas mais lentas.

### Passo 5: Aguardar Deploy

O Railway vai:
1. Detectar Python
2. Instalar dependências
3. Iniciar o bot
4. Status "Success" = Pronto!

### Passo 6: Testar

1. Abra Telegram
2. Procure: @suppley_ai_bot
3. Envie: /start
4. Comece a usar!

## Comandos Disponíveis

- `/start` - Iniciar bot
- `/proximos` - Próximos passos
- `/projeto [nome]` - Analisar projeto
- `/roadmap [objetivo]` - Criar roadmap
- `/relatorio` - Relatório de progresso
- `/decisao [texto]` - Registrar decisão
- `/insight [texto]` - Adicionar insight
- `/explicar [conceito]` - Explicar conceito
- `/ajuda` - Ajuda

## Suporte

Qualquer problema, verifique os logs no Railway:
Dashboard > Deployments > View Logs

## Custo

- Railway: ~$5-10/mês (R$ 25-50)
- DeepSeek: conforme o uso (tabela em https://api-docs.deepseek.com/quick_start/pricing)
