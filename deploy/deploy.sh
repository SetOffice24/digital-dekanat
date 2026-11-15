#!/usr/bin/env sh
# Обновление на сервере: ./deploy/deploy.sh [--seed]
set -e
cd "$(dirname "$0")"
git -C .. pull --ff-only
docker compose up -d --build
docker compose exec -T app node node_modules/prisma/build/index.js migrate deploy
if [ "$1" = "--seed" ]; then
  docker compose exec -T app node node_modules/tsx/dist/cli.mjs prisma/seed.ts
fi
docker compose ps
