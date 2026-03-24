#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════
# EcomPilot PL — Deploy Script
# Pulls latest code, rebuilds, and restarts all services
# Usage: bash /opt/ecompilot/infra/deploy/deploy.sh
# ═══════════════════════════════════════════════

DEPLOY_DIR="/opt/ecompilot"
cd "$DEPLOY_DIR"

echo "══════════════════════════════════════"
echo " EcomPilot PL — Deploying..."
echo "══════════════════════════════════════"

# Pull latest
echo "[1/4] Pulling latest code..."
git pull

# Create Docker network if not exists
echo "[2/4] Ensuring Docker network..."
docker network create ecompilot-network 2>/dev/null || true

# Start infrastructure first
echo "[3/4] Starting infrastructure..."
docker compose -f docker-compose.yml up -d --wait

# Start all services + web app
echo "[4/4] Building and starting services..."
docker compose -f docker-compose.services.yml -f docker-compose.prod.yml up -d --build

echo ""
echo "══════════════════════════════════════"
echo " Deploy complete!"
echo "══════════════════════════════════════"
echo ""
echo " Checking status..."
docker compose -f docker-compose.yml -f docker-compose.services.yml -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo " Site: https://app.ecompilot.org"
