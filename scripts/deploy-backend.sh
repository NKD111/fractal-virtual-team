#!/bin/bash
# ═══════════════════════════════════════════════
# FRACTAL VIRTUAL TEAM v4.0 — Deploy a Railway
# ═══════════════════════════════════════════════
# Proyecto ya creado: fractal-virtual-team
# Project ID: 1896d437-cb2a-4a16-bec2-3f4ad58fa901
# Service ID:  374a68c7-9ea4-4758-999b-f6a763099283
# Env ID:      0a29646a-1ead-484a-91b5-f4b09b27b958
#
# PASOS:
# 1. railway login   (abre browser, 1 click)
# 2. bash scripts/deploy-backend.sh

set -e
cd "$(dirname "$0")/../backend"

echo "🌸 Deploying Fractal Virtual Team Backend a Railway..."
echo ""

# Link al proyecto ya creado
railway link --project 1896d437-cb2a-4a16-bec2-3f4ad58fa901 \
             --service 374a68c7-9ea4-4758-999b-f6a763099283 \
             --environment production 2>/dev/null || true

# Upload y deploy
railway up --detach

echo ""
echo "✅ Deploy iniciado en Railway"
echo "📡 Ver logs: railway logs"
echo "🌐 URL: railway domain"
