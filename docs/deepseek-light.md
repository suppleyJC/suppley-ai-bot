# DeepSeek: integração experimental, desativada por padrão

Escopo: apenas a rota leve de saudações/agradecimentos/testes delimitados em conversas novas. Histórico, operações, anexos, cálculos, ferramentas e pesquisa continuam no Claude. Não há fallback automático nem migração dos dados.

Configuração no servidor (nunca no navegador ou Git): `LIGHT_LLM_PROVIDER=deepseek` e `DEEPSEEK_API_KEY` com chave autorizada. O padrão é `anthropic`; voltar a esse valor desativa DeepSeek. Recrie somente a aplicação usando o procedimento de deploy e preservando JWT/DB. Não basta editar o ambiente sem recriar o container.

Não ativar em produção antes de validar chave, saldo, privacidade e tarifas. Sem tarifa validada, o painel registra tokens DeepSeek mas exclui seu custo do total/média e marca o total como parcial. Não usar fallback Claude para estimar a cobrança DeepSeek.

Endpoint fixo HTTPS, sem redirecionamento, timeout 30 segundos, modelo `deepseek-flash`, pensamento desligado e limite de saída de 256 tokens. Sem novas dependências ou migração de banco. A integração não resolve a indisponibilidade do Claude para tarefas completas.

Antes de ativar: executar testes locais; em ambiente autorizado, testar uma saudação e o teste de eco em conversas novas, conferir uma chamada registrada, contadores de entrada/cache/saída e cobrança no console. Testar retorno a Anthropic. A qualidade real e disponibilidade ainda não foram verificadas com API real.

Referências: https://api-docs.deepseek.com/api/create-chat-completion/ e https://api-docs.deepseek.com/quick_start/pricing/
