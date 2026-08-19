# Security & Access Control Guide

**Last Updated:** 2026-06-25  
**Status:** ⚠️ Action Required — Password rotation recommended

---

## 🔐 Database Access — Current State

### The Problem

The production database uses Docker Compose with the following credential flow:

```bash
# docker-compose.yml defines the MySQL service:
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-root}
MYSQL_PASSWORD=${MYSQL_PASSWORD:-changeme}

# The application uses different credentials:
DB_USER=${DB_USER:-suppley}
DB_PASSWORD=${DB_PASSWORD:-changeme}
DB_NAME=${DB_NAME:-suppley_calc}

# The .env file SHOULD define these, but they may not be properly configured
```

**Risk:** If `.env` is missing or incomplete on the production server, Docker Compose defaults to weak passwords (`root`, `changeme`).

---

## 🔄 Secure Password Rotation Procedure

### Prerequisites

- SSH access to the production server (`calculasupley.com.br`)
- `docker-compose` and `mysql` CLI available
- Current `.env` file backed up

### Step 1: Generate a Strong Password

```bash
# On your local machine or server:
openssl rand -base64 32
# Example output: K7mX9pL2bN5qR8tU3vW6xY9zA0cD4eF7gH8iJ9kL0mN1oP2

# Store this password securely (password manager, etc.)
```

### Step 2: Update the Production `.env` File

SSH into the production server and edit `.env`:

```bash
ssh user@calculasupley.com.br
cd /path/to/suppley-ai-bot

# Backup current .env
cp .env .env.backup-$(date +%Y%m%d-%H%M%S)

# Edit .env with the new password
nano .env
# OR
vi .env
```

Update these lines (replace `<STRONG_PASSWORD>` with the generated password):

```bash
# Application database credentials
DB_USER=suppley
DB_PASSWORD=<STRONG_PASSWORD>
DB_NAME=suppley_calc

# Docker MySQL credentials (for container initialization only)
MYSQL_ROOT_PASSWORD=<STRONG_PASSWORD>
MYSQL_PASSWORD=<STRONG_PASSWORD>
```

**Remove obsolete variables:**
```bash
# DELETE this line (it's not used by the app):
MYSQL_PASSWORD=SuppleyDb2024
```

### Step 3: Rotate the MySQL User Password

The container is already running. Change the password in the live database:

```bash
# Connect to MySQL container
docker exec -it suppley-mysql mysql -u root -p<current_root_password>

# Inside MySQL, execute:
ALTER USER 'suppley'@'%' IDENTIFIED BY '<STRONG_PASSWORD>';
ALTER USER 'root'@'%' IDENTIFIED BY '<STRONG_PASSWORD>';
FLUSH PRIVILEGES;
EXIT;
```

### Step 4: Verify Connection with New Credentials

```bash
# Test the new credentials from the app container
docker exec suppley-ai-bot mysql -h db -u suppley -p<STRONG_PASSWORD> suppley_calc -e "SELECT 1;"

# Should return: Query OK, 0 rows affected
```

### Step 5: Restart Services (Optional, but Recommended)

If you want to redeploy with the new credentials baked in:

```bash
# From the repo root:
./redeploy.sh
# This will:
# 1. Read the new passwords from .env
# 2. Rebuild containers
# 3. Apply pending migrations
# 4. Verify health
```

If you prefer to just restart without rebuild:

```bash
docker-compose down
docker-compose up -d
```

### Step 6: Verify After Restart

```bash
# Check if services are healthy
docker-compose ps
docker-compose logs -f app

# Test app health
curl http://localhost:3000
# Should return 200 OK
```

---

## 📋 Checklist for Production Security

- [ ] Root password rotated from default
- [ ] Application user (`suppley`) has a strong, unique password
- [ ] `.env` file has all credentials properly set
- [ ] Obsolete `MYSQL_PASSWORD` variable removed from `.env`
- [ ] Backup of `.env` kept in secure location
- [ ] Password stored in password manager (not in repository)
- [ ] `docker-compose.yml` reviewed for hardcoded secrets (should have none)
- [ ] Database backups configured (separate task)
- [ ] Access logs reviewed for unauthorized attempts

---

## 🚨 Emergency Recovery

If you forget the database password:

```bash
# Option 1: Stop MySQL and restart with init file (advanced)
# This requires manually resetting with --skip-grant-tables

# Option 2: Use database backup and restore (recommended)
# Restore from the latest backup, update credentials, redeploy

# Option 3: Re-initialize from scratch
# WARNING: Data loss risk. Only as last resort.
```

Contact the team if you need help recovering the database.

---

## 🔒 Secrets Management Best Practices

### What Goes in `.env`

✅ Database credentials  
✅ API keys  
✅ JWT secret  
✅ OAuth credentials (if used)  

### What Should NOT Be in `.env`

❌ Hard-coded in repository  
❌ Shared in unencrypted chat/email  
❌ Logged to console  
❌ Exposed in docker-compose.yml values (use variable substitution)  

### Current State

- `.env` is in `.gitignore` ✅
- `docker-compose.yml` uses `${VAR:-default}` syntax ✅
- No secrets in code ✅
- Password changes documented ✅

---

## 🔍 Auditing

To check current database users and their privileges:

```bash
docker exec -it suppley-mysql mysql -u root -p<root_password> <<'EOF'
SELECT User, Host, authentication_string FROM mysql.user;
SHOW GRANTS FOR 'suppley'@'%';
EOF
```

---

## 📞 Questions?

If you need help with password rotation or encounter issues:
1. Check `docker-compose logs db` for database startup errors
2. Verify `.env` syntax (no extra spaces around `=`)
3. Ensure MySQL is fully initialized before attempting connection
4. Review `DEPLOYMENT_GUIDE.md` for the full deployment workflow
