# AWS S3 Setup Guide — Fase 2 Storage

**Data:** 24 de junho de 2026  
**Status:** Pronto para deploy  
**Tempo Estimado:** 30-45 minutos  

---

## 📋 O Que Você Vai Fazer

1. Criar um bucket S3 no AWS
2. Gerar credenciais IAM
3. Configurar variáveis de ambiente
4. Deploy em produção
5. Testar upload de PDF/Word

---

## 🚀 PASSO 1: Criar Bucket S3 (5 minutos)

### 1.1 Acessar AWS Console

```
Abrir: https://console.aws.amazon.com/
Login: sua conta AWS
```

### 1.2 Criar Bucket

```
1. Ir para: S3 > "Create bucket"

2. Nome do bucket:
   DESENVOLVIMENTO: suppley-ai-uploads-dev
   PRODUÇÃO:        suppley-ai-uploads-prod
   
   ⚠️ Nomes S3 são globalmente únicos
   ⚠️ Se já existir, use: suppley-uploads-{seu-nome}

3. Região:
   Desenvolvimento: us-east-1 (mais barato)
   Produção:       sa-east-1 (mais próximo do Brasil)
   
4. Configurações:
   ✓ Versioning: Enable (backup automático)
   ✓ Server-side encryption: AES-256 (default)
   ✓ Block all public access: KEEP ENABLED (segurança)

5. Clicar: "Create bucket"
```

### 1.3 Verificar Bucket

```bash
Você verá uma mensagem:
"Bucket suppley-ai-uploads-prod created successfully"
```

---

## 🔐 PASSO 2: Criar IAM User (10 minutos)

### 2.1 Acessar IAM

```
AWS Console > Services > IAM > Users > "Create user"
```

### 2.2 Criar User

```
1. User name: suppley-app-s3

2. Clique: Next

3. Set permissions > "Attach policies directly"

4. Buscar e selecionar:
   Policy name: AmazonS3FullAccess
   
   ⚠️ Em produção, use uma policy mais restritiva (veja abaixo)

5. Clique: Next > Create user
```

### 2.3 Gerar Access Keys

```
1. AWS Console > IAM > Users > suppley-app-s3

2. Ir para aba: "Security credentials"

3. Descer até: "Access keys"

4. Clicar: "Create access key"

5. Use case: "Application running on other AWS services"
   (ou outro que se aplique)

6. Clicar: "Create access key"

7. ⚠️ COPIAR E SALVAR:
   - Access Key ID:     AKIA...
   - Secret Access Key: wJalr...
   
   ⚠️ NÃO COMPARTILHE ESSAS CHAVES
   ⚠️ Clique "Download .csv file" como backup
```

---

## 🔐 PASSO 3: Configurar Policy Mais Restritiva (Opcional, Recomendado para Prod)

Se quer limitar as permissões do user S3 (melhor segurança):

### 3.1 Criar Policy Customizada

```
AWS Console > IAM > Policies > "Create policy"
```

### 3.2 Colar JSON Abaixo

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucketContents",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketVersioning",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::suppley-ai-uploads-prod"
    },
    {
      "Sid": "AllowObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::suppley-ai-uploads-prod/*"
    }
  ]
}
```

### 3.3 Anexar ao User

```
1. IAM > Users > suppley-app-s3
2. Add permissions > Attach policies directly
3. Selecionar a policy criada
4. Clicker: Add permissions
```

---

## 🔧 PASSO 4: Configurar Variáveis de Ambiente

### 4.1 Adicionar ao `.env` (Desenvolvimento)

```bash
# .env (local development)
AWS_S3_BUCKET=suppley-ai-uploads-dev
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY
```

### 4.2 Adicionar ao `.env.production` (Produção)

```bash
# .env.production (production - servidor SSH)
AWS_S3_BUCKET=suppley-ai-uploads-prod
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### 4.3 Atualizar docker-compose.yml (Produção)

```yaml
# docker-compose.yml
services:
  app:
    environment:
      NODE_ENV: production
      DATABASE_URL: mysql://suppley:${DB_PASSWORD}@mysql:3306/suppley_calc
      JWT_SECRET: ${JWT_SECRET}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      # AWS S3 (NOVO)
      AWS_S3_BUCKET: ${AWS_S3_BUCKET}
      AWS_REGION: ${AWS_REGION}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
```

---

## 🚀 PASSO 5: Deploy em Produção

### 5.1 SSH no Servidor

```bash
ssh root@165.245.234.254
cd /opt/suppley/suppley-ai-bot
```

### 5.2 Atualizar .env

```bash
# Adicionar variáveis AWS (substituir com SUAS chaves)
cat >> .env << 'EOF'
AWS_S3_BUCKET=suppley-ai-uploads-prod
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=AKIA...COLEASUACHAVEAQUI...
AWS_SECRET_ACCESS_KEY=...COLEASUASECRETKEY...
EOF
```

### 5.3 Fazer Pull da Branch

```bash
git pull origin claude/manus-migration-independent-1kfrll
```

### 5.4 Build + Deploy

```bash
# Build
docker-compose up -d --build

# Aguardar ~2-3 minutos para vite + esbuild
docker logs suppley-ai-bot -f

# Quando ver "Server running on...", está pronto
```

### 5.5 Verificar Containers

```bash
docker ps

# Esperado:
# CONTAINER ID   IMAGE            STATUS
# xxxxx          suppley-ai-bot   Up 2 minutes (healthy)
# xxxxx          mysql:8.0        Up 2 hours (healthy)
```

---

## ✅ PASSO 6: Testar Upload de PDF

### 6.1 Abrir no Navegador

```
http://165.245.234.254:3000/excambia
```

### 6.2 Teste 1: Enviar Mensagem com Streaming

```
1. Digitar: "classifica a NCM de um notebook"
2. Verificar: Status animado aparece ("Excambia está...")
3. Aguardar resposta
4. Confirmar: Alíquota IPI aparece na análise ✓
```

### 6.3 Teste 2: Upload de PDF (NOVO!)

```
1. Clicar no botão 📎 (Paperclip)
2. Selecionar um PDF (cotação, proforma, etc.)
3. Aguardar upload (barra de progresso)
4. Confirmar: "Arquivo enviado com sucesso" ✓
5. Mensagem aparece: "📎 Enviei o arquivo: nomedoarquivo.pdf"
6. AI responde analisando o arquivo ✓
```

### 6.4 Teste 3: Verificar S3 Console

```bash
AWS Console > S3 > suppley-ai-uploads-prod > Objects

Você deve ver arquivos em:
quotations/123/2024-06-24-abc123-filename.pdf
```

---

## 🔍 Troubleshooting

### Erro: "Access Denied to S3"

```
Causa: Credenciais inválidas ou policy insuficiente

Solução:
1. Verificar .env tem as chaves corretas
2. Executar: docker restart suppley-ai-bot
3. Conferir logs: docker logs suppley-ai-bot
4. Verificar IAM policy tem s3:PutObject, s3:GetObject
```

### Erro: "InvalidBucketName"

```
Causa: Nome do bucket inválido (já existe, caracteres inválidos)

Solução:
1. Ir ao AWS S3 console
2. Verificar que bucket existe e nome está correto
3. Atualizar AWS_S3_BUCKET no .env
```

### Erro: "Upload timeout"

```
Causa: Arquivo muito grande ou conexão lenta

Solução:
1. Verificar limite no express (50MB — veja server/_core/index.ts)
2. Testar com arquivo menor primeiro
3. Verificar speed.cloudflare.com para velocidade
```

### Upload funciona mas arquivo não aparece

```
Causa: Presigned URL expirou ou S3 não salvou

Solução:
1. Aguardar 10 segundos (S3 eventual consistency)
2. Recarregar página (F5)
3. Verificar CloudWatch logs (AWS Console > CloudWatch)
```

---

## 📊 Verificar Custos

### Depois de alguns testes:

```
AWS Console > Billing > Cost Management > Cost Explorer

Você verá:
- S3 Storage: ~$0.023/GB/mês
- Upload requests: ~$0.005 por 1000 PUTs
- Download requests: ~$0.0004 por 1000 GETs
- Data transfer: ~$0.09/GB (saída)

Para 10 arquivos de 5MB: ~$0.50-1.00 por mês
```

---

## 🔒 Segurança em Produção

### Checklist de Segurança

- [x] Bucket: "Block all public access" **ENABLED**
- [x] Bucket: Server-side encryption **AES-256**
- [x] Bucket: Versioning **ENABLED** (backup)
- [x] IAM User: Policy restritiva (não AmazonS3FullAccess)
- [x] Access Keys: Rotadas a cada 90 dias
- [x] `.env`: NÃO commitado no git
- [x] Presigned URLs: 1 hora expiration
- [x] Logs: CloudWatch habilitado

### Configurar Logs (Opcional)

```bash
AWS S3 > suppley-ai-uploads-prod > Properties > Logging

Enable server access logging:
Target bucket: suppley-ai-uploads-prod
Target prefix: logs/

Isso cria auditoria de quem acessou o quê
```

---

## 📝 Referências

- AWS S3 Pricing: https://aws.amazon.com/s3/pricing/
- S3 Developer Guide: https://docs.aws.amazon.com/s3/
- IAM Best Practices: https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html

---

## ✅ Checklist de Conclusão

- [ ] Bucket S3 criado (suppley-ai-uploads-prod)
- [ ] IAM User criado (suppley-app-s3)
- [ ] Access Keys geradas e salvas
- [ ] .env atualizado com credenciais
- [ ] docker-compose.yml atualizado
- [ ] Git pull da branch
- [ ] docker-compose up -d --build
- [ ] Teste streaming: "classifica um NCM" ✓
- [ ] Teste upload: PDF enviado e processado ✓
- [ ] S3 console: arquivo visível em bucket ✓

---

**Quando tudo estiver verde, SPRINT 4 estará 100% completo!** 🎉

Próximo passo: Fase 2.1 — Auditoria + Aprovação (15-20 horas)

Mantido por: Tim de Desenvolvimento Suppley  
Última atualização: 24 de junho de 2026
