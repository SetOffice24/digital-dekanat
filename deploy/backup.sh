#!/usr/bin/env sh
# Ежедневный бэкап БД (cron: 0 3 * * * /opt/univer/deploy/backup.sh), хранение 14 дней
set -e
cd "$(dirname "$0")"
mkdir -p backups
docker compose exec -T db pg_dump -U univer univer | gzip > "backups/$(date +%F).sql.gz"
find backups -name '*.sql.gz' -mtime +14 -delete
