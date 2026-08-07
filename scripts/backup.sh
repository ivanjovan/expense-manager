#!/usr/bin/env bash
set -euo pipefail

# Dumps the dev Postgres database (via docker compose) in pg_dump's custom
# format, so it can be restored — including into a differently-named
# database — with pg_restore. See scripts/restore.sh and SRS §19.
#
# For production, point COMPOSE_SERVICE/DB_USER/DB_NAME at the real
# deployment (or swap the `docker compose exec` calls for a direct
# `pg_dump "$DATABASE_URL"`) and run this from cron/a scheduled job.

COMPOSE_SERVICE="db"
DB_NAME="${POSTGRES_DB:-expense_manager}"
DB_USER="${POSTGRES_USER:-expense}"
BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${BACKUP_DIR}/expense_manager-${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "Backing up '${DB_NAME}' from the '${COMPOSE_SERVICE}' container..."
docker compose exec -T "$COMPOSE_SERVICE" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$OUT_FILE"

echo "Backup written to ${OUT_FILE} ($(du -h "$OUT_FILE" | cut -f1))"
