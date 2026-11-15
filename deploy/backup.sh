#!/usr/bin/env bash
# Saves the database and uploaded pictures into ~/smallmart-backups and keeps the last 14 days.
# Run by hand or daily with cron:  0 3 * * * bash /home/ubuntu/smallmart/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")"
dest="$HOME/smallmart-backups"
stamp="$(date +%Y%m%d-%H%M)"
mkdir -p "$dest"
docker compose exec -T db pg_dump -U smallmart smallmart | gzip > "$dest/db-$stamp.sql.gz"
docker compose exec -T api tar -C /data -cz . > "$dest/pictures-$stamp.tar.gz"
find "$dest" -type f -mtime +14 -delete
ls -lh "$dest" | tail -4
