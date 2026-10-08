#!/bin/bash
# Script para importar tabela TIPI no servidor de produção
# Uso: ./scripts/import-tipi.sh

set -e

echo "🚀 Importando Tabela TIPI (10.521 NCMs com alíquotas IPI)"
echo "=================================================="

# Detectar caminho do projeto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$PROJECT_ROOT/drizzle/seed_tipi.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Arquivo não encontrado: $SQL_FILE"
    exit 1
fi

echo "📄 Arquivo SQL: $SQL_FILE"
echo "   Tamanho: $(ls -lh "$SQL_FILE" | awk '{print $5}')"
echo ""

# Ler DATABASE_URL do .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
else
    echo "❌ Arquivo .env não encontrado!"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL não está configurado!"
    exit 1
fi

echo "🔌 Conectando ao banco de dados..."
echo "   URL: $DATABASE_URL (sem credenciais)"
echo ""

# Executar SQL
mysql "$DATABASE_URL" < "$SQL_FILE"

echo ""
echo "✅ Importação Concluída!"
echo ""
echo "📊 Verificando dados..."
mysql "$DATABASE_URL" -e "SELECT COUNT(*) as total_ncm FROM ncm_tax_rates; SELECT COUNT(*) as com_ipi FROM ncm_tax_rates WHERE ipiRate > 0;"
echo ""
echo "ℹ️  Próximos passos:"
echo "   1. Validar dados: SELECT * FROM ncm_tax_rates LIMIT 10;"
echo "   2. Verificar alíquotas: SELECT DISTINCT ipiRate FROM ncm_tax_rates ORDER BY ipiRate DESC LIMIT 10;"
echo "   3. Testar clasificação NCM no chat"
