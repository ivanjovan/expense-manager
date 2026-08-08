#!/usr/bin/env bash
set -euo pipefail

# Dumps a *remote* Postgres (Neon in production) to an encrypted file.
#
# Distinct from scripts/backup.sh, which shells into the local docker
# compose container and therefore only works in development. This one takes
# a connection string, so it runs anywhere — a laptop, or the scheduled job
# in .github/workflows/backup.yml.
#
# The output is encrypted before it is written, not after. A dump of this
# database contains every bill and fill-up the household has recorded plus
# bcrypt password hashes, and it is about to be uploaded to third-party
# storage; a plaintext file on disk in between is a window worth closing.
# Symmetric AES-256 keeps recovery to one passphrase, so restoring does not
# depend on still having a particular keypair years from now.
#
# Usage:
#   BACKUP_PASSPHRASE=... ./scripts/backup-remote.sh [output-dir]
#
# Environment:
#   DIRECT_DATABASE_URL  preferred — a direct (non-pooled) connection
#   DATABASE_URL         fallback
#   BACKUP_PASSPHRASE    required; symmetric key for the dump

OUT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups}"

# pg_dump wants a real session. Neon's "-pooler" host is PgBouncer in
# transaction mode, which breaks the long-lived snapshot a consistent dump
# depends on — the same reason migrations use the direct URL.
CONNECTION="${DIRECT_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$CONNECTION" ]; then
  echo "error: set DIRECT_DATABASE_URL (preferred) or DATABASE_URL" >&2
  exit 1
fi
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "error: BACKUP_PASSPHRASE is required — refusing to write an unencrypted dump" >&2
  exit 1
fi
# Prisma connection strings carry query parameters libpq has never heard of,
# and it rejects the whole URI rather than ignoring them — `?schema=public`
# alone fails with "invalid URI query parameter". Since the same variable is
# shared with Prisma, strip its parameters here instead of asking for a
# second, hand-edited copy of the same credential.
strip_prisma_params() {
  local url="$1" base query kept="" pair
  case "$url" in
    *\?*) base="${url%%\?*}"; query="${url#*\?}" ;;
    *) printf '%s' "$url"; return ;;
  esac
  local pairs=()
  IFS='&' read -ra pairs <<<"$query"
  for pair in "${pairs[@]}"; do
    [ -n "$pair" ] || continue
    case "${pair%%=*}" in
      schema|connection_limit|pool_timeout|pgbouncer|sslaccept| \
      socket_timeout|statement_cache_size) continue ;;
    esac
    kept="${kept:+${kept}&}${pair}"
  done
  printf '%s%s' "$base" "${kept:+?${kept}}"
}
CONNECTION="$(strip_prisma_params "$CONNECTION")"

case "$CONNECTION" in
  *-pooler.*)
    echo "warning: this looks like a pooled connection; a dump taken through" >&2
    echo "         PgBouncer can be inconsistent. Prefer DIRECT_DATABASE_URL." >&2
    ;;
esac

# pg_dump refuses to dump a server newer than itself, and most machines
# either lack the client entirely or carry whatever version the distro
# shipped. Docker gives a pinned, new-enough client without installing
# anything system-wide. The CI job installs a real client from PGDG and
# never reaches this branch.
PG_DUMP_IMAGE="${PG_DUMP_IMAGE:-postgres:17-alpine}"
run_pg_dump() {
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump --format=custom --no-owner --no-privileges "$CONNECTION"
  elif command -v docker >/dev/null 2>&1; then
    # The URL is passed by name, not by value, so the credentials stay out
    # of the host's process list.
    # --network host so the container resolves hosts exactly as the shell
    # does; without it a localhost URL would point at the container itself.
    PGURL="$CONNECTION" docker run --rm -i --network host -e PGURL "$PG_DUMP_IMAGE" \
      sh -c 'pg_dump --format=custom --no-owner --no-privileges "$PGURL"'
  else
    echo "error: neither pg_dump nor docker is available" >&2
    return 1
  fi
}

mkdir -p "$OUT_DIR"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%SZ)"
BASENAME="expense_manager-${TIMESTAMP}.dump"
OUT_FILE="${OUT_DIR}/${BASENAME}.gpg"

# A failed pg_dump still leaves whatever gpg had already written — observed
# as a 70-byte file when pg_dump was missing entirely. `set -e` aborts
# before the size check below can catch it, so a partial file would survive
# on disk looking like a backup. Remove it on any non-zero exit.
cleanup_partial() {
  local code=$?
  if [ "$code" -ne 0 ] && [ -f "$OUT_FILE" ]; then
    rm -f "$OUT_FILE"
    echo "removed partial backup ${OUT_FILE}" >&2
  fi
  exit "$code"
}
trap cleanup_partial EXIT

echo "Dumping database to ${OUT_FILE} ..."

# -Fc so pg_restore can restore selectively and into a differently-named
# database, which is what makes the drill in restore.sh possible.
# The dump is piped straight into gpg: it never exists unencrypted on disk.
# pipefail is set, so a pg_dump failure fails the whole command rather than
# leaving a small, valid-looking encrypted file containing nothing.
run_pg_dump \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-fd 3 --output "$OUT_FILE" 3<<<"$BACKUP_PASSPHRASE"

SIZE_BYTES="$(stat -c%s "$OUT_FILE" 2>/dev/null || stat -f%z "$OUT_FILE")"

# A dump of an empty or unreachable database still produces a small,
# well-formed file. Failing loudly here beats discovering it at restore
# time — the whole point of §19 is that an unverified backup is not one.
if [ "$SIZE_BYTES" -lt 1024 ]; then
  echo "error: backup is only ${SIZE_BYTES} bytes — treating as a failed dump" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

echo "Wrote ${OUT_FILE} ($(du -h "$OUT_FILE" | cut -f1))"
echo
echo "To restore:"
echo "  gpg --batch --decrypt --passphrase \"\$BACKUP_PASSPHRASE\" \\"
echo "      --output restored.dump \"${OUT_FILE}\""
echo "  ./scripts/restore.sh restored.dump      # into a scratch database first"
