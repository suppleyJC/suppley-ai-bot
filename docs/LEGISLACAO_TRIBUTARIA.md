# Base Legislativa e Arquitetura de Dados Tributários

> Documento de referência da **parte legislativa que embasa os cálculos** da Excambia.
> Arquitetura escolhida: **HÍBRIDA** — repositório interno versionado como fonte da
> verdade + sincronização periódica das fontes oficiais.

---

## 1. Princípio: a IA nunca inventa alíquota

O motor de cálculo (`importCostEngine.ts`) é **determinístico**. O agente (Excambia)
apenas coleta parâmetros e delega ao motor — há um **guardrail fiscal**
(`server/agent/guardrails/fiscal.ts`) que bloqueia qualquer alíquota injetada pelo LLM.
Toda alíquota vem das tabelas internas ou de override explícito do usuário.

## 2. Fontes da verdade (repositório interno)

| Tributo / dado | Onde mora | Origem oficial |
| --- | --- | --- |
| **II / IPI / PIS / COFINS por NCM** | tabela `ncmTaxRates` (8 dígitos) | TEC (MDIC/CAMEX), TIPI (Receita Federal), Nomenclatura (Siscomex) |
| **ICMS interno por UF** | `statePricingService.getStateIcmsInternalRate()` (fonte única) | Legislação estadual / convênios CONFAZ |
| **ICMS interestadual importados** | constante 4% | Resolução Senado 13/2012 |
| **ICMS antecipado SC (TTD 409)** | default do motor (2,6% / 1,0%) | TTD 409/SC |
| **PIS/COFINS-Importação** | defaults do motor (2,1% / 9,65%) | Lei 10.865/2004, art. 8º |
| **Adicional COFINS 0,6%** | flag `applyCofinsLc224` | LC 224/2025 (vigência 2026) |
| **Reforma tributária (IBS/CBS/IS)** | `taxReformService.TAX_REFORM_TIMELINE` | EC 132/2023 + LC 214/2025 |
| **Histórico de alterações** | tabela `taxRateHistory` | — (auditoria interna) |
| **Log de sincronizações** | tabela `taxUpdateLogs` | — (auditoria interna) |

## 3. Sincronização (o lado "sync" do híbrido)

- `taxTableUpdateService.updateNcmFromSiscomex()` baixa a nomenclatura oficial do
  Siscomex e insere NCMs novos com alíquotas padrão por capítulo (sinalizadas como
  *estimadas* até confirmação).
- `taxTableUpdateService.updateNcmRates()` aplica ajustes manuais **gravando o valor
  anterior em `taxRateHistory`** antes de sobrescrever — versionamento por data.
- `checkForTaxUpdates()` recomenda revisão quando passou > 7 dias da última atualização.
- Cadência recomendada: revisão mensal da TEC/TIPI e a cada mudança publicada (DCC,
  ex-tarifário, resolução GECEX).

## 4. Como o estado de destino entra no cálculo (P4)

`calculateEstimativa` (em `estimativaService.ts`) resolve o regime de ICMS importação
a partir da UF informada:

- **SC** → benefício **TTD 409** (ICMS antecipado 2,6% nos primeiros 36 meses, 1,0%
  após), que é o default histórico.
- **Demais UFs** → **ICMS importação cheio** com a alíquota interna do estado
  (`getStateIcmsInternalRate`), salvo override explícito.
- **UF não informada** → assume SC **com aviso explícito** no resultado, para o
  usuário saber que pode refazer com a UF correta. (Não há mais "SC silencioso".)

O **modal** define o AFRMM: ele só incide no marítimo; aéreo/rodoviário/ferroviário
zeram o AFRMM automaticamente (com aviso).

## 5. Avisos de confiabilidade

O resultado do motor carrega `ncmWarnings` e `warnings` que sinalizam, entre outros:

- NCM não encontrado → II 14% / IPI 0% **estimados** (confirmar na TEC/TIPI);
- II estimada por capítulo ou elevação temporária (DCC) prestes a expirar;
- estado assumido como SC por falta de UF;
- regime de ICMS cheio aplicado fora de SC;
- AFRMM zerado por modal não-marítimo;
- COFINS calculada sem o adicional da LC 224/2025 (paridade com planilhas anteriores).

Esses avisos devem ser **sempre repassados ao usuário** antes de fechar a operação.

---

**Resumo da decisão (a confirmar/validar pelo contador):** alíquotas e regras vêm de
tabelas internas versionadas (fonte da verdade), sincronizadas periodicamente com as
fontes oficiais; o estado de destino e o modal passaram a parametrizar o cálculo; e
nenhum valor é inventado pela IA. Defaults legais aplicados: TTD 409/SC, Res. Senado
13/2012 (4% importados), Lei 10.865/2004 (PIS/COFINS-Importação) e LC 224/2025
(adicional COFINS, para operações a partir de 2026).
