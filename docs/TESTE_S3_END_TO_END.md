# Teste End-to-End: Upload/Download S3

**Status:** ✅ Integração estrutural validada  
**Data:** 25 de junho de 2026  
**Objetivo:** Verificar fluxo completo de upload → presigned URL → download

---

## 1. Validação Estrutural (✅ Concluída)

A integração S3 foi validada estruturalmente:

```
✓ Módulos importáveis sem erros
✓ S3Client com lazy initialization (não quebra testes sem AWS)
✓ Storage layer expõe storagePut, storageGet, storageDelete
✓ quotationsRouter integrado com generateReport() e generateExcelReport()
✓ Presigned URLs usados (credenciais AWS não expostas)
```

### Arquitetura

```
Frontend (Browser)
    ↓
POST /api/trpc/quotations.generateReport
    ↓
Backend (Node.js)
    ├─ Monta PDF buffer (via pdfReportService)
    ├─ Chama storagePut(filename, buffer, "application/pdf")
    │   ├─ S3Client.upload() com credenciais AWS (privado)
    │   └─ Retorna presigned URL + filename
    └─ Responde ao cliente { url, fileName }
    ↓
Frontend (Browser)
    ├─ Recebe presigned URL
    ├─ Clica em link ou faz download
    └─ GET presigned URL (sem credenciais)
    ↓
Amazon S3
    ├─ Valida assinatura de presigned URL
    └─ Retorna arquivo
```

---

## 2. Teste Manual em Produção (🔄 Próximo)

### 2.1 Preparar ambiente

```bash
# 1. Acesse o servidor
# http://165.245.234.254:3000/

# 2. Faça login (ou crie uma conta se necessário)
```

### 2.2 Criar cotação de teste

```bash
# 1. Navegue para /Calculate
# 2. Preencha os dados:
#    - Fornecedor: "Test Supplier"
#    - Produto: "Test Product"
#    - Quantidade: 100
#    - Valor FOB: $1.000

# 3. Selecione NCM (ex: 8471.30.00 para eletrônicos)
# 4. Clique em "Calcular"
```

### 2.3 Gerar e fazer download de PDF

```bash
# 1. Na página de cotação, clique em "Gerar PDF"
# 2. Aguarde a geração (pode levar alguns segundos)

# Esperado na resposta:
{
  "url": "https://[bucket].s3.[region].amazonaws.com/reports/quotation-123-timestamp.pdf?X-Amz-Algorithm=...",
  "fileName": "reports/quotation-123-timestamp.pdf"
}

# 3. Clique no link ou copie a URL
# 4. Verifique que o arquivo foi baixado
# 5. Abra o PDF para confirmar que o conteúdo está correto
```

### 2.4 Gerar e fazer download de Excel

```bash
# 1. Volta à página de cotação
# 2. Clique em "Gerar Excel"
# 3. Aguarde a geração

# Esperado:
{
  "url": "https://[bucket].s3.[region].amazonaws.com/reports/quotation-123-timestamp.xlsx?X-Amz-Algorithm=...",
  "fileName": "reports/quotation-123-timestamp.xlsx"
}

# 4. Faça download do Excel
# 5. Abra e verifique que a planilha contém:
#    - Dados do produto
#    - Cálculos de impostos
#    - Análise de viabilidade
```

---

## 3. Validação de Presigned URLs

### 3.1 Verificar assinatura

Uma presigned URL é segura porque:

```
✓ Assinada com AWS Signature V4
✓ Válida por apenas 1 hora (configurável em storagePut)
✓ Específica para GET de um arquivo exato
✓ Contém timestamp e nonce
✓ Não expõe credenciais AWS
```

### 3.2 Copie uma URL no DevTools e inspecione

```bash
# 1. Abra DevTools (F12) → Network
# 2. Gere um PDF
# 3. Busque a request para quotations.generateReport
# 4. Copie a URL presigned retornada

# Exemplo:
# https://suppley-s3-bucket.s3.us-east-1.amazonaws.com/reports/quotation-456-1719381600000.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA...%2F20260625%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260625T120000Z&X-Amz-Expires=3600&X-Amz-Signature=...&X-Amz-SignedHeaders=host

# Observe:
# - X-Amz-Expires=3600 (válida por 1 hora)
# - X-Amz-Date (timestamp da geração)
# - X-Amz-Signature (assinatura HMAC)
```

### 3.3 Teste de expiração

```bash
# 1. Copie uma presigned URL
# 2. Modifique o parâmetro X-Amz-Expires para um número pequeno (ex: 10)
# 3. Aguarde mais de 10 segundos
# 4. Tente acessar a URL modificada
# 5. Esperado: 403 Forbidden ou erro de assinatura
```

---

## 4. Monitoramento em Produção

### 4.1 Logs do servidor

```bash
# SSH no servidor (se disponível)
# docker logs [container-id]

# Procure por:
# - "Storage upload successful"
# - "S3 upload failed" (se houver erro)
```

### 4.2 AWS CloudWatch (opcional)

```bash
# Se configurado, verifique em AWS CloudWatch Logs:
# - /aws/s3/uploads
# - PUT requests para reports/quotation-*
```

### 4.3 Verificar arquivos em S3

```bash
# Via AWS Console:
# 1. Acesse S3 → suppley-s3-bucket
# 2. Navegue para reports/
# 3. Verifique que arquivos aparecem com timestamps corretos
```

---

## 5. Checklist de Teste

- [ ] **Integração estrutural validada** (✅ Feito)
- [ ] Acessar servidor em produção
- [ ] Fazer login
- [ ] Criar cotação com cálculos
- [ ] Gerar PDF
  - [ ] Recebe presigned URL
  - [ ] URL é válida (contém AWS Signature V4)
  - [ ] Download do PDF funciona
  - [ ] PDF contém dados corretos
- [ ] Gerar Excel
  - [ ] Recebe presigned URL
  - [ ] URL é diferente de PDF (timestamp único)
  - [ ] Download do Excel funciona
  - [ ] Excel contém dados corretos
- [ ] Testar presigned URL expirada (modificar Expires)
- [ ] Verificar CloudWatch logs (se disponível)

---

## 6. Fluxo Esperado em Detalhes

### 6.1 POST /api/trpc/quotations.generateReport

**Request:**
```json
{
  "quotationId": 123
}
```

**Response (Sucesso):**
```json
{
  "result": {
    "data": {
      "url": "https://suppley-s3-bucket.s3.us-east-1.amazonaws.com/reports/quotation-123-1719381600000.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
      "fileName": "reports/quotation-123-1719381600000.pdf"
    }
  }
}
```

**Response (Erro - Quotação não encontrada):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cotação não encontrada"
  }
}
```

**Response (Erro - Sem cálculos):**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Cotação não possui cálculos"
  }
}
```

**Response (Erro - S3 falhou):**
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Storage upload failed: ..."
  }
}
```

### 6.2 GET presigned-url (download)

**Request:**
```
GET https://suppley-s3-bucket.s3.us-east-1.amazonaws.com/reports/quotation-123-1719381600000.pdf?X-Amz-Algorithm=...
```

**Response (Sucesso):**
```
HTTP 200 OK
Content-Type: application/pdf
Content-Length: 123456
[PDF binary content]
```

**Response (Erro - URL expirada):**
```
HTTP 403 Forbidden
<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>
```

---

## 7. Troubleshooting

### 7.1 "Cotação não encontrada"

- Verifique se a cotação existe
- Verifique se você é o owner da cotação
- Confira o ID da cotação nos logs

### 7.2 "Cotação não possui cálculos"

- Crie cálculos na cotação antes de gerar relatório
- Mínimo 1 cálculo por cotação

### 7.3 "Storage upload failed: AWS_S3_BUCKET not configured"

- Verifique se as credenciais AWS estão carregadas no Docker
- Revise o arquivo `.env` no servidor
- Reinicie o container

### 7.4 "Access Denied" ao fazer download

- URL pode ter expirado (válida por 1 hora)
- Gere nova presigned URL via endpoint
- Verifique bucket name e permissions no AWS

### 7.5 Download é arquivo vazio ou corrompido

- Verifique logs do servidor para erros de geração
- Confirme que pdfReportService/excelReportService funcionam
- Teste com quotação simples (1 produto)

---

## 8. Próximos Passos

Após validar o fluxo S3:

1. **Integrar com Excambia**
   - Adicionar tool `gerar_relatorio_pdf` / `gerar_relatorio_excel`
   - Especialista_analise pode chamar para entregar relatórios

2. **Implementar Fase 2.1: Auditoria + Aprovação**
   - Trilha de auditoria: quem fez upload de qual arquivo
   - Aprovação: revisor confirma antes de entregar ao cliente

3. **Otimizações**
   - Cache de PDFs/Excels já gerados
   - Bulk uploads para múltiplas cotações
   - Compressão antes de upload

---

## Referências

- AWS S3 Presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- Código: `server/storage.ts`, `server/_core/s3Client.ts`, `server/routers/quotationsRouter.ts`
- Arquitetura: `/docs/ARQUITETURA_ESPECIALISTAS.md`
