#!/usr/bin/env bash
# Ежедневный бэкап (cron: 0 3 * * * /var/www/service.setoffice.ru/app/deploy/backup.sh), хранение 14 дней.
# БД + все файлы приложения из /app/data: uploads (материалы, домашние), documents (личные документы студентов), photos.
# Пишем во временные файлы, проверяем архивы и только потом переименовываем — частичный файл не выглядит готовым бэкапом.
# Копию каталога backups нужно регулярно уносить за пределы VPS и проверять восстановление на тестовом стенде.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
mkdir -p backups
day="$(date +%F)"

# pipefail: если pg_dump упал, скрипт упадёт, а не сохранит пустой gzip
rm -f "backups/${day}.complete"
docker compose exec -T db pg_dump -U univer univer | gzip > "backups/.${day}.sql.gz.tmp"
gzip -t "backups/.${day}.sql.gz.tmp"
test "$(gzip -dc "backups/.${day}.sql.gz.tmp" | head -c 1000 | wc -c)" -gt 0

# файлы приложения — каталоги, которые есть в томе (photos/documents могут ещё не существовать).
# «exit 0» в конце: иначе код последней проверки [ -d photos ] (1, если каталога нет) оборвал бы скрипт через set -e
dirs="$(docker compose exec -T app sh -c 'cd /app/data && for d in uploads documents photos; do if [ -d "$d" ]; then printf "%s " "$d"; fi; done; exit 0')"
if [ -n "$dirs" ]; then
  # shellcheck disable=SC2086
  docker compose exec -T app tar -czf - -C /app/data $dirs > "backups/.${day}-data.tar.gz.tmp"
  tar -tzf "backups/.${day}-data.tar.gz.tmp" > /dev/null
fi

# публикуем комплект только когда готовы обе части; маркер .complete — признак полного бэкапа (БД + файлы)
mv "backups/.${day}.sql.gz.tmp" "backups/${day}.sql.gz"
if [ -n "$dirs" ]; then mv "backups/.${day}-data.tar.gz.tmp" "backups/${day}-data.tar.gz"; fi
date -Is > "backups/${day}.complete"

find backups -name '*.sql.gz' -mtime +14 -delete
find backups -name '*-data.tar.gz' -mtime +14 -delete
find backups -name '*-uploads.tar.gz' -mtime +14 -delete
find backups -name '*.complete' -mtime +14 -delete
find backups -name '.*.tmp' -mtime +1 -delete
