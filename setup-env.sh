#!/bin/bash
# Setup Environment - Configure .env for deployment

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     SUPPLEY AI BOT — ENVIRONMENT SETUP                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "✓ .env file already exists"
    read -p "Overwrite? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env"
        exit 0
    fi
fi

# Create .env with secure defaults
echo "Creating .env with secure configuration..."

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Generate MySQL password
DB_PASS=$(openssl rand -base64 16)

cat > .env << EOF_ENV
# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_URL=mysql://root:${DB_PASS}@db:3306/suppley_calc

# ============================================
# SECURITY
# ============================================
JWT_SECRET=${JWT_SECRET}

# ============================================
# APPLICATION
# ============================================
NODE_ENV=production
PORT=3000

# ============================================
# DOCKER COMPOSE (Internal)
# ============================================
MYSQL_ROOT_PASSWORD=${DB_PASS}
MYSQL_DATABASE=suppley_calc
MYSQL_USER=suppley
MYSQL_PASSWORD=${DB_PASS}

EOF_ENV

echo "✓ .env created with secure values"
echo ""
echo "📋 GENERATED SECURITY CREDENTIALS:"
echo "   JWT_SECRET: $(echo $JWT_SECRET | cut -c1-20)..."
echo "   DB_PASSWORD: $(echo $DB_PASS | cut -c1-20)..."
echo ""
echo "⚠️  IMPORTANT: Keep these credentials secure!"
echo "    - Never commit .env to git"
echo "    - Backup these values in a secure location"
echo ""
echo "✅ Environment setup complete"
echo ""

