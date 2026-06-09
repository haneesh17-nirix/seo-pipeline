#!/bin/bash
# Cloud-init script — runs once on first VM boot
set -euo pipefail

# ── System updates ────────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git unzip

# ── Node.js 20 ────────────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ── Ollama ────────────────────────────────────────────────────────────────────
curl -fsSL https://ollama.com/install.sh | sh

# Configure Ollama to listen on localhost only (security: not exposed publicly)
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<'EOF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
EOF

systemctl daemon-reload
systemctl enable ollama
systemctl start ollama

# Wait for Ollama to be ready, then pull the model
sleep 15
ollama pull llama3.2

# ── SEO pipeline ─────────────────────────────────────────────────────────────
# Clone your repo (update this URL after pushing to GitHub)
# git clone https://github.com/YOUR_USERNAME/seo-pipeline.git /opt/seo-pipeline
# cd /opt/seo-pipeline && npm install

echo "VM setup complete. Ollama is running with llama3.2."
echo "Access Ollama via SSH tunnel: ssh -L 11434:localhost:11434 seouser@<VM_IP>"
