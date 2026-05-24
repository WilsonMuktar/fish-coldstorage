#!/bin/bash
# Daily backup: fishstorage DB + receipt images to NAS (SMB mount)
set -euo pipefail

BACKUP_DIR="${NAS_MOUNT_PATH:-/Volumes/NAS/backups}/fish-coldstorage"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/images"

# DB dump
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST:-localhost}" \
  -p "${DB_PORT:-5432}" \
  -U "${DB_USER:-postgres}" \
  "${DB_NAME:-fishstorage}" \
  | gzip > "$BACKUP_DIR/db/fishstorage_${TIMESTAMP}.sql.gz"

echo "DB backup: $BACKUP_DIR/db/fishstorage_${TIMESTAMP}.sql.gz"

# Images
if [ -d "data/receipts" ]; then
  tar czf "$BACKUP_DIR/images/receipts_${TIMESTAMP}.tar.gz" data/receipts/
  echo "Images backup: $BACKUP_DIR/images/receipts_${TIMESTAMP}.tar.gz"
fi

# Prune: keep 30 daily backups
find "$BACKUP_DIR/db" -name "*.sql.gz" -mtime +30 -delete
find "$BACKUP_DIR/images" -name "*.tar.gz" -mtime +30 -delete

echo "Backup complete: $TIMESTAMP"
