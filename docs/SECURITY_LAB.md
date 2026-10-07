# Suppley AI Bot Lab — Security Hardening

## Escopo

Este documento acompanha o hardening do fork `WillianPadilhaFst/suppley-ai-bot-lab`.

O repositório original `suppleyJC/suppley-ai-bot` não deve ser alterado por este trabalho.

- Base da aplicação: `claude/manus-migration-independent-1kfrll`
- Branch de trabalho: `security/codeql-fixes`
- Base inicial: `7057ea5`
- Pull request do lab: #1 (draft)

## Estado inicial

A análise CodeQL herdada apontou 10 findings:
- SSRF em leitura de anexo;
- ausência de rate limiting em rotas;
- decisão de autenticação sinalizada no streaming;
- regex sobre entrada não confiável;
- escaping incompleto;
- format string/log injection.

O workflow Test & Build também falhava antes dos testes por usar `actions/upload-artifact@v3`.

## Correções implementadas

### CI
- `actions/upload-artifact@v4`;
- testes não são mais mascarados com `|| echo "No tests found"`;
- branch `security/**` incluída no workflow;
- CodeQL configurado para executar em push da branch de segurança.

### SSRF / anexos
- a URL enviada pelo cliente não é usada diretamente pelo backend;
- download é re-assinado via `storageGet(fileKey)`;
- `fileKey` é restrita ao prefixo do usuário autenticado;
- redirects são recusados;
- leitura limitada a 20 MB;
- testes de regressão cobrem URL maliciosa, chave de outro usuário e ausência de chave.

### JWT
- removidos fallbacks hardcoded de `JWT_SECRET`;
- segredo centralizado em `server/_core/jwtSecret.ts`;
- ausência ou segredo menor que 32 caracteres falha de forma explícita;
- testes adicionados.

### Rate limiting
Rate limiting em memória aplicado a:
- fallback de SPA/arquivo estático;
- download estável de arquivos;
- chat stream;
- webhook RFQ.

### Findings adicionais
- todos os caracteres `%` são removidos no parser de alíquota;
- células Markdown escapam barras invertidas e pipes;
- regex sinalizadas em enriquecimento/RFQ foram removidas ou simplificadas;
- log de erro de operação não interpola entrada externa.

## Validação pendente

O fork ainda não registrou execuções de GitHub Actions após a criação do PR. Em forks públicos, o GitHub pode exigir habilitação manual dos workflows na aba **Actions** antes da primeira execução.

Nenhuma correção deve ser levada ao repositório original antes de:
1. Test & Build executar;
2. CodeQL executar;
3. findings remanescentes serem triados;
4. PR do lab ser revisado.


## GitHub Actions

Workflows habilitados manualmente no fork em 2026-10-04. Este commit serve também para disparar a primeira execução de validação do lab.
