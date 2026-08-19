# 🚀 DEPLOYMENT GUIDE — SUPPLEY AI BOT v2.0.0

## ⚡ Quick Start (5 minutes)

### 1. Prepare Environment

```bash
./setup-env.sh
```

This generates secure:
- JWT_SECRET (32 bytes random)
- MySQL password (16 bytes random)
- Database credentials

### 2. Deploy

```bash
./deploy-production.sh
```

This will:
- Build Docker image
- Start containers (app + MySQL)
- Run database migrations
- Health checks
- Ready in ~2-5 minutes

### 3. Access

```
Frontend:  http://your-domain.com:3000
API:       http://your-domain.com:3000/api/trpc
Database:  localhost:3306
```

---

## 📋 Pre-Deployment Checklist

- [ ] Server has Docker and Docker Compose installed
- [ ] Port 3000 is available (or update docker-compose.yml)
- [ ] MySQL port 3306 is available (internal only)
- [ ] Sufficient disk space (~2GB)
- [ ] Sufficient memory (2GB+ recommended)

---

## 🔧 Manual Deployment (Advanced)

If you prefer manual control:

### 1. Setup Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 2. Build Docker Image

```bash
docker build -t suppley-ai-bot:v2.0.0 .
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Run Migrations

```bash
docker-compose exec db mysql -u root -p < drizzle/0017_motor_v2_initial.sql
```

### 5. Verify

```bash
docker-compose ps
docker-compose logs -f app
```

---

## 🔗 Domain Configuration

### Option 1: Nginx Reverse Proxy (Recommended)

Create `/etc/nginx/sites-available/suppley`:

```nginx
server {
    listen 80;
    server_name calculasuppley.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name calculasuppley.com.br;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/calculasuppley.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calculasuppley.com.br/privkey.pem;

    # Security headers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Uploads de proforma/anexo: o padrão do nginx é 1MB — arquivos maiores
    # voltavam como 413 (HTML) e quebravam o parse de JSON no navegador.
    client_max_body_size 25m;

    # Proxy to Docker container
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Extração por IA de arquivos grandes pode levar minutos — o padrão
        # de 60s derrubava a requisição com 504 no meio da extração.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/suppley /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Option 2: Cloudflare

1. Point domain to your server IP
2. Enable Cloudflare proxy
3. Set SSL/TLS to "Full (strict)"
4. Add firewall rules as needed

### Option 3: AWS/DigitalOcean Load Balancer

Forward traffic to port 3000 on your server

---

## 📊 Monitoring

### View Logs

```bash
# Application logs
docker-compose logs -f app

# Database logs
docker-compose logs -f db

# All logs
docker-compose logs -f
```

### Container Stats

```bash
docker stats

# Or
docker-compose stats
```

### Database Health

```bash
docker-compose exec db mysql -u root -p -e "SELECT VERSION();"
```

---

## 🔄 Updates & Maintenance

### Update Application

```bash
git pull origin claude/manus-migration-independent-1kfrll
./deploy-production.sh
```

### Backup Database

```bash
docker-compose exec db mysqldump -u root -p suppley_calc > backup-$(date +%Y%m%d).sql
```

### Restore Database

```bash
docker-compose exec -T db mysql -u root -p suppley_calc < backup-20260614.sql
```

### Stop Services

```bash
docker-compose down
```

### Restart Services

```bash
docker-compose restart
```

---

## 🚨 Troubleshooting

### Container won't start

```bash
docker-compose logs app
# Check error messages and fix configuration
```

### Database migration fails

```bash
docker-compose exec -T db mysql -u root -p -e "SHOW DATABASES;"
# Verify database exists
```

### Port already in use

Edit `docker-compose.yml` and change port mapping:

```yaml
ports:
  - "8000:3000"  # Change from 3000:3000 to 8000:3000
```

### High memory usage

Limit Docker resources in `docker-compose.yml`:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

---

## 🔐 Security Hardening

### Change Default Passwords

1. Update .env with strong passwords
2. Restart docker-compose: `docker-compose restart`

### Enable SSL/TLS

Use Nginx + Let's Encrypt (see Domain Configuration above)

### Firewall Rules

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw deny 3000/tcp   # Block direct app access
```

### Database Backup Strategy

```bash
# Daily backup script
0 2 * * * /home/user/backup-db.sh >> /var/log/db-backup.log 2>&1
```

---

## 📈 Production Best Practices

- [ ] Enable monitoring (Sentry, DataDog)
- [ ] Configure log aggregation (ELK, Splunk)
- [ ] Set up automated backups
- [ ] Configure CI/CD for auto-deploys
- [ ] Use secrets management (HashiCorp Vault)
- [ ] Enable database replication for HA
- [ ] Use reverse proxy (Nginx) for SSL
- [ ] Configure firewall rules
- [ ] Monitor disk space and backups
- [ ] Plan disaster recovery

---

## 💬 Support

For issues or questions:
1. Check logs: `docker-compose logs`
2. Review configuration: `.env` and `docker-compose.yml`
3. Verify prerequisites: Docker, ports, disk space
4. Read documentation in `/docs`

---

**Last Updated:** 2026-06-14  
**Version:** 2.0.0 with Motor V2
