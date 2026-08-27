#!/usr/bin/env bash
# Деплой на боевой сервер: rsync исходников + пересборка контейнеров.
#
# База (backend/data) и .env.production на сервере не трогаются — они
# исключены из rsync и живут только там.
#
# Использование: ./deploy.sh

set -euo pipefail

HOST="root@45.10.110.136"
REMOTE_DIR="/opt/cs2-tournament"

cd "$(dirname "$0")"

echo "==> rsync -> $HOST:$REMOTE_DIR"
rsync -az --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.production' \
  --exclude 'node_modules' \
  --exclude '__pycache__' \
  --exclude '.DS_Store' \
  --exclude 'backend/data' \
  --exclude 'frontend/dist' \
  ./ "$HOST:$REMOTE_DIR/"

echo "==> docker compose up --build -d"
ssh "$HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build"

echo "==> уборка старых образов"
ssh "$HOST" "docker image prune -f"

echo "==> готово"
