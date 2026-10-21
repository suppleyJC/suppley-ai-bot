# Resultados dos Testes Visuais - 05/06/2026

## Páginas Testadas

| Página | Rota | Status | Observações |
|--------|------|--------|-------------|
| Dashboard | / | OK | Funcionando, exibe câmbio, stats |
| Novo Cálculo | /calculate | OK | Formulário completo com upload PDF |
| Excambia (IA) | /excambia | OK | Chat funcional, tabs, ações rápidas |
| Histórico | /calculations | OK | Mostra cálculos avulsos agrupados |
| RFQ | /rfq | OK | Lista RFQs com stats e pipeline |
| Fornecedores | /suppliers | OK | Listagem funcional |
| Produtos | /products | OK | Listagem funcional |
| Reforma Tributária | /reform | OK | Funcional |
| Dashboard (rota /dashboard) | /dashboard | 404 | Rota não existe - Dashboard está em / |

## Bugs Encontrados e Corrigidos

1. Cookie de sessão com nome errado (excambia_session → suppley_session)
2. Rota duplicada /excambia causando redirect infinito
3. Rotas RFQ ausentes no App.tsx
4. Item RFQ ausente no menu lateral
5. Título da aba do navegador dizia "Excambia"
6. Tabelas consolidated_quotes e supplier_outreach não existiam no banco
7. Cálculos sem quotationId não apareciam no Histórico
8. calculateMultiple não criava quotation ao salvar

## Pendente

- Dashboard acessível apenas via / (não /dashboard) - comportamento correto pois menu aponta para /
