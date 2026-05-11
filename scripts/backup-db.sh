#!/bin/sh
BACKUP_DIR="/app/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_DIR/feed2040_$DATE.sql.gz"
# Keep last 7 backups
ls -t "$BACKUP_DIR"/feed2040_*.sql.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null
echo "[Backup] Created feed2040_$DATE.sql.gz"
