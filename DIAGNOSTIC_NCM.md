# Diagnóstico: Alíquotas NCM Não Aparecem na Produção

## Situação

O cálculo ainda mostra `Alíquotas (II 14% / IPI 0%) — estimadas` mesmo após carregar dados TEC/TIPI reais. Isso significa que `getNcmTaxRate("73084000")` retorna `null` em vez do registro do banco.

## Causas Possíveis

1. **Tabela ncm_tax_rates vazia** - O script de load não foi executado ou falhou silenciosamente
2. **Dados não foram commitados** - Transação SQL ainda pendente ou rollback
3. **Container foi reiniciado** - Dados em memória foram perdidos (se usando volume não persistido)
4. **Banco de dados errado** - DATABASE_URL aponta para instância diferente
5. **Índice/cache corrompido** - Dados existem mas query não encontra

## Solução Passo a Passo

### Passo 1: Diagnosticar via API

#### Opção A: Via Endpoint tRPC (Produção)

```bash
# No navegador ou via fetch:
fetch('https://seu-dominio/api/trpc/ncm.diagnose')
  .then(r => r.json())
  .then(console.log)

# Você verá algo como:
{
  "result": {
    "data": {
      "ok": true,
      "message": "Banco conectado: 11023 NCMs carregados",
      "total": 11023,
      "ncm73084000": {
        "ncmCode": "73084000",
        "description": "73.08 Construções... (material para andaimes)",
        "iiRate": 1400,
        "ipiRate": 0,
        "notes": "TEC/TIPI 2021"
      }
    }
  }
}
```

Se `ok: true` e `total > 100`, os dados existem. Se `ncm73084000` for `null`, vá para o Passo 2.

#### Opção B: Via CLI Local

```bash
# Conectar ao servidor e rodar:
docker exec suppley_db mysql -u suppley -pSuppleyDb2024 suppley_calc \
  -e "SELECT COUNT(*) as total FROM ncm_tax_rates;"

docker exec suppley_db mysql -u suppley -pSuppleyDb2024 suppley_calc \
  -e "SELECT * FROM ncm_tax_rates WHERE ncmCode='73084000';"
```

### Passo 2: Se o Banco Estiver Vazio

#### 2a. Recarregar dados (no servidor)

```bash
cd /opt/suppley/suppley-ai-bot
bash scripts/load-ncm.sh
```

**Saída esperada:**
```
[NCM] Carregando data/ncm_import.sql.gz no banco 'suppley_calc'...
[NCM] Contagem final de NCMs na tabela:
+----------+
| total_ncm|
+----------+
|    11023 |
+----------+
[NCM] Concluído. Lembre de limpar o cache...
```

#### 2b. Limpar cache em memória

```bash
# Via API (no navegador ou curl):
fetch('https://seu-dominio/api/trpc/ncm.clearCache', { method: 'POST' })
  .then(r => r.json())
  .then(console.log)

# Ou via CLI:
curl -X POST https://seu-dominio/api/trpc/ncm.clearCache
```

#### 2c. Reiniciar container (último recurso)

```bash
docker restart suppley_app
# Aguarde ~30s para healthcheck passar
```

### Passo 3: Verificar Novamente

```bash
# Chamar endpoint diagnose novamente
# Deveria retornar ncm73084000 com os dados corretos
```

### Passo 4: Testar o Cálculo

Na interface:
1. Vá para Operações → Nova
2. Entre com os dados:
   - NCM: 7308.40.00
   - Produto: "Escoras de aço"
   - Quantidade: 100
   - Preço FOB: 10 USD
3. Clique em "Calcular"

**Esperado:** Sem mensagem de "estimadas" — mostra `II 14%` mas sem aviso

Se ainda aparecer "estimadas", o problema é mais profundo.

## Diagnóstico Avançado

### Cenário 1: Banco vazio (~0-100 NCMs)

```bash
# Regenerar e recarregar

# 1. Gerar novo SQL a partir das planilhas (se ainda existirem)
pnpm tsx scripts/importNcmTable.ts caminho/para/TEC.xlsx

# 2. Se não tiver as planilhas, restaurar da committed sql.gz
cd /opt/suppley/suppley-ai-bot
bash scripts/load-ncm.sh
```

### Cenário 2: Banco tem alguns dados mas não o 73084000

```bash
# Ver quais NCMs existem no capítulo 73
docker exec suppley_db mysql -u suppley -pSuppleyDb2024 suppley_calc \
  -e "SELECT ncmCode, iiRate, notes FROM ncm_tax_rates WHERE ncmCode LIKE '73%' LIMIT 10;"

# Se estiver vazio, o capítulo 73 não foi incluído nas fontes TEC/TIPI
# Isso é normal — nem todas as NCMs têm alíquota TEC/TIPI publicada
```

### Cenário 3: Dados existem mas getNcmTaxRate retorna null

```bash
# Verificar se o índice está correto
docker exec suppley_db mysql -u suppley -pSuppleyDb2024 suppley_calc \
  -e "SHOW INDEX FROM ncm_tax_rates;"

# Deverá mostrar um índice UNIQUE em ncmCode
# Se não existir, criar:
docker exec suppley_db mysql -u suppley -pSuppleyDb2024 suppley_calc \
  -e "ALTER TABLE ncm_tax_rates ADD UNIQUE KEY uk_ncmCode (ncmCode);"
```

## Checklist de Resolução

- [ ] Endpoint `/ncm.diagnose` retorna `ok: true`
- [ ] `total > 1000` (pelo menos 1000 NCMs carregados)
- [ ] NCM 73084000 existe e tem `iiRate > 0`
- [ ] `ncm.clearCache()` foi chamado
- [ ] Container foi reiniciado **após** o load
- [ ] Novo cálculo não mostra "estimadas"

## Notas Técnicas

- Arquivo SQL: `/data/ncm_import.sql.gz` (309 KB)
- Formato: `8 dígitos sem pontos` (73084000, não 7308.40.00)
- Alíquotas em basis points: 1% = 100, 14% = 1400
- PIS/COFINS: Usa defaults legais (210 e 1025 bp) se não carregado
- Cache: Drizzle não faz cache, mas ncmService.ts caches com LRU de 1h

## Se Continuar Falhando

1. Verificar logs do container:
   ```bash
   docker logs suppley_app | tail -100
   docker logs suppley_db | tail -50
   ```

2. Verificar variáveis de ambiente:
   ```bash
   docker exec suppley_app env | grep DATABASE_URL
   ```

3. Testar conexão diretamente:
   ```bash
   docker exec suppley_db mysql -u root -p${DB_ROOT_PASSWORD} -e "SELECT COUNT(*) FROM suppley_calc.ncm_tax_rates;"
   ```

4. Como último recurso, reiniciar tudo:
   ```bash
   docker-compose -f docker-compose.prod.yml down
   docker-compose -f docker-compose.prod.yml up -d
   # Aguarde 60s para MySQL inicializar
   bash scripts/load-ncm.sh
   ```

---

**Data:** 2026-06-19  
**Versão:** Motor V2 (Drizzle ORM + MySQL)  
**Alíquotas Reais:** TEC (2021) + TIPI (2021)
