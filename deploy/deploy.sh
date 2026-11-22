#!/usr/bin/env sh
# Обновление на сервере: ./deploy/deploy.sh [--seed]
set -e
cd "$(dirname "$0")"
git -C .. pull --ff-only
docker compose up -d --build
docker compose exec -T app node node_modules/prisma/build/index.js migrate deploy
# Ключи push-уведомлений (VAPID): при первом деплое генерируем и сохраняем в .env (на сервере, не в git)
if ! grep -q '^VAPID_PUBLIC_KEY=..' .env 2>/dev/null; then
  KEYS=$(docker compose exec -T app node -e "const k=require('web-push').generateVAPIDKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)")
  sed -i '/^VAPID_PUBLIC_KEY=/d;/^VAPID_PRIVATE_KEY=/d' .env
  printf '%s\n' "$KEYS" >> .env
  chmod 600 .env
  docker compose up -d --force-recreate app
  echo "VAPID-ключи созданы и сохранены в deploy/.env"
fi
if [ "$1" = "--seed" ]; then
  docker compose exec -T app node node_modules/tsx/dist/cli.mjs prisma/seed.ts
fi
# Демо-вход без пароля (кнопки для жюри) — в боевой сборке только при явном DEMO_LOGIN=1. Для настоящего запуска — убрать.
if grep -q '^DEMO_LOGIN=1' .env 2>/dev/null; then
  echo "ВНИМАНИЕ: включён демо-вход без пароля (DEMO_LOGIN=1). Для настоящих данных уберите эту строку из deploy/.env и перезапустите."
fi
docker compose ps
