#!/bin/bash
# One-shot Azure deployment script for the SEO Ollama VM
set -euo pipefail

RESOURCE_GROUP="habun-seo-rg"
LOCATION="uaenorth"
VM_NAME="habun-seo-ollama"

echo ""
echo "=== SEO Pipeline — Azure Deployment ==="
echo ""

# ── Check az CLI login ─────────────────────────────────────────────────────
if ! az account show &>/dev/null; then
  echo "Not logged in. Running az login..."
  az login
fi

echo "Subscription: $(az account show --query name -o tsv)"
echo ""

# ── SSH key ────────────────────────────────────────────────────────────────
SSH_KEY_PATH="$HOME/.ssh/id_rsa_seo_ollama"
if [ ! -f "$SSH_KEY_PATH" ]; then
  echo "Generating SSH key pair at $SSH_KEY_PATH..."
  ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_PATH" -N "" -C "habun-seo-ollama-vm"
fi
SSH_PUBLIC_KEY=$(cat "${SSH_KEY_PATH}.pub")

# ── Your current IP (for SSH whitelist) ───────────────────────────────────
MY_IP=$(curl -s ifconfig.me)
# Detect IPv4 vs IPv6 and use correct CIDR prefix length
if [[ "$MY_IP" == *":"* ]]; then
  MY_IP_CIDR="${MY_IP}/128"
else
  MY_IP_CIDR="${MY_IP}/32"
fi
echo "Your public IP: $MY_IP → CIDR: $MY_IP_CIDR (will be whitelisted for SSH)"
echo ""

# ── Resource group ─────────────────────────────────────────────────────────
echo "Creating resource group '$RESOURCE_GROUP' in $LOCATION..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# ── Deploy Bicep ───────────────────────────────────────────────────────────
echo "Deploying VM (this takes 3-5 minutes)..."
DEPLOY_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters \
    location="$LOCATION" \
    vmName="$VM_NAME" \
    adminUsername="seouser" \
    sshPublicKey="$SSH_PUBLIC_KEY" \
    myIp="$MY_IP_CIDR" \
  --output json)

VM_IP=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['properties']['outputs']['vmPublicIp']['value'])")
TUNNEL_CMD=$(echo "$DEPLOY_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['properties']['outputs']['ollamaTunnel']['value'])")

# ── Save state ─────────────────────────────────────────────────────────────
cat > "$(dirname "$0")/.deploy-state.json" <<EOF
{
  "vmIp": "$VM_IP",
  "resourceGroup": "$RESOURCE_GROUP",
  "sshKeyPath": "$SSH_KEY_PATH",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "✓ Deployment complete!"
echo ""
echo "  VM IP:         $VM_IP"
echo "  SSH key:       $SSH_KEY_PATH"
echo ""
echo "  The VM is installing Ollama + llama3.2 in the background (~10 min)."
echo "  To check setup progress:"
echo "    ssh -i $SSH_KEY_PATH seouser@$VM_IP 'tail -f /var/log/cloud-init-output.log'"
echo ""
echo "  To run the SEO pipeline from your Mac (via SSH tunnel):"
echo "    $TUNNEL_CMD -N &"
echo "    OLLAMA_HOST=http://localhost:11434 npm run dev -- generate --type blog-post --keyword 'best crusher app'"
echo ""
echo "  To stop the VM when not in use (saves ~\$5/day):"
echo "    az vm deallocate --resource-group $RESOURCE_GROUP --name $VM_NAME"
echo ""
echo "  To start it again:"
echo "    az vm start --resource-group $RESOURCE_GROUP --name $VM_NAME"
echo ""
