#!/usr/bin/env bash
set -euo pipefail

# Restores a pg_dump custom-format backup (see scripts/backup.sh).
#
# By default this restores into a *separate* scratch database in the same
# Postgres container, so a restore can be verified without touching real
# data — this is the "tested restore procedure" SRS §19 asks for as a
# Phase 0 exit criterion, and is safe to re-run any time as a drill.
#
# Pass --into-original for actual disaster recovery, which requires typing
# the database name to confirm before it drops and recreates it.

usage() {
  echo "Usage: $0 <backup-file> [--into-original]"
  exit 1
}

[ $# -ge 1 ] || usage

BACKUP_FILE="$1"
MODE="${2:-}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

COMPOSE_SERVICE="db"
DB_USER="${POSTGRES_USER:-expense}"
ORIGINAL_DB="${POSTGRES_DB:-expense_manager}"
TARGET_DB="$ORIGINAL_DB"

if [ "$MODE" != "--into-original" ]; then
  TARGET_DB="${ORIGINAL_DB}_restore_test"
  echo "Restoring into scratch database '${TARGET_DB}'."
  echo "(pass --into-original to restore over '${ORIGINAL_DB}' instead)"
  docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
  docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE ${TARGET_DB} OWNER ${DB_USER};"
else
  echo "This will DROP and recreate the PRIMARY database '${ORIGINAL_DB}'."
  read -r -p "Type the database name to confirm: " CONFIRM
  if [ "$CONFIRM" != "$ORIGINAL_DB" ]; then
    echo "Confirmation did not match. Aborting."
    exit 1
  fi
  docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
  docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE ${TARGET_DB} OWNER ${DB_USER};"
fi

docker compose exec -T "$COMPOSE_SERVICE" pg_restore -U "$DB_USER" -d "$TARGET_DB" \
  --clean --if-exists < "$BACKUP_FILE"

echo "Restore into '${TARGET_DB}' complete."
