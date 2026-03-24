#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════
# EcomPilot PL — Server Setup Script
# Run once on a fresh Ubuntu 20.04+ server
# Usage: bash setup-server.sh
# ═══════════════════════════════════════════════

echo "══════════════════════════════════════"
echo " EcomPilot PL — Server Setup"
echo "══════════════════════════════════════"

# ── 1. System update ──
echo "[1/6] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release

# ── 2. Install Docker ──
if ! command -v docker &>/dev/null; then
  echo "[2/6] Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "  Docker installed: $(docker --version)"
else
  echo "[2/6] Docker already installed: $(docker --version)"
fi

# ── 3. Install Caddy ──
if ! command -v caddy &>/dev/null; then
  echo "[3/6] Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  echo "  Caddy installed: $(caddy version)"
else
  echo "[3/6] Caddy already installed: $(caddy version)"
fi

# ── 4. Clone repository ──
DEPLOY_DIR="/opt/ecompilot"
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  echo "[4/6] Cloning repository..."
  git clone https://github.com/yakden/ecompilot.git "$DEPLOY_DIR"
else
  echo "[4/6] Repository already exists, pulling latest..."
  cd "$DEPLOY_DIR" && git pull
fi

# ── 5. Setup environment ──
echo "[5/6] Setting up environment..."
cd "$DEPLOY_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from .env.example"
  echo "  ⚠  IMPORTANT: Edit /opt/ecompilot/.env with your real values!"
else
  echo "  .env already exists, skipping"
fi

# ── 6. Setup Caddy ──
echo "[6/6] Configuring Caddy..."
cp infra/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

echo ""
echo "══════════════════════════════════════"
echo " Setup complete!"
echo "══════════════════════════════════════"
echo ""
echo " Next steps:"
echo "  1. Edit /opt/ecompilot/.env with real values"
echo "     nano /opt/ecompilot/.env"
echo ""
echo "  2. Run the deploy script:"
echo "     bash /opt/ecompilot/infra/deploy/deploy.sh"
echo ""
