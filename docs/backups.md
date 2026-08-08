# Backups

SRS §19 treats this as a feature, not an operational footnote:

> Moving off Excel means moving from a file the household can copy and email
> to a database they cannot. If data loss is possible, this application is a
> downgrade regardless of its features.

There are three layers, and they cover different failures.

| Layer | Protects against | Automatic |
|---|---|---|
| Neon point-in-time restore | a bad delete, inside the retention window | yes, by Neon |
| Nightly encrypted dump → Google Drive | losing the Neon account or project | yes, once configured |
| Excel export (owner → Settings) | this app ceasing to exist | no — you click it |

Only the middle layer survives losing the database provider, and only the
last is readable without any of this software.

## Nightly dump — one-time setup

`.github/workflows/backup.yml` runs at 02:15 UTC and can be triggered by
hand from the Actions tab. It needs four repository secrets.

### 1. `DIRECT_DATABASE_URL`

Your Neon connection string with the **direct** host — that is, the one
*without* `-pooler` in the hostname. `pg_dump` holds a long-lived snapshot,
which PgBouncer's transaction pooling breaks. The same variable is used for
migrations.

### 2. `BACKUP_PASSPHRASE`

Any long random string, e.g. `openssl rand -base64 32`.

**Store it somewhere that is not this repo, not the database, and not
Google Drive.** A password manager is right. An encrypted backup whose
passphrase was only ever kept next to the backup is not encrypted, and one
whose passphrase is lost is not a backup.

### 3 & 4. `RCLONE_CONFIG_BASE64` and `RCLONE_REMOTE`

A Google **service account will not work here.** Service accounts have no
Drive storage of their own, so uploading into a folder shared with one
fails with `storageQuotaExceeded` on a personal (`@gmail.com`) account.
That path only works with a Workspace Shared Drive. Authenticate as
yourself instead, so the files are owned by you:

```bash
# On your own machine, where a browser can open:
rclone config
#   n) new remote
#   name> gdrive
#   Storage> drive
#   client_id / client_secret> (blank is fine)
#   scope> 1  (full access)  — or 3 (drive.file) to limit rclone to files
#                              it created, which is the safer choice here
#   Edit advanced config> n
#   Use web browser to authenticate> y

# Verify it works, then encode the whole config:
rclone lsd gdrive:
base64 -w0 ~/.config/rclone/rclone.conf
```

Paste that string as `RCLONE_CONFIG_BASE64`, and set `RCLONE_REMOTE` to the
destination folder, e.g. `gdrive:expense-manager-backups`.

The config file contains a refresh token — treat it as a credential.
Revoke it from your Google account's third-party access page if it leaks.

## Restoring

The point of §19 is that this has been *done*, not just documented.

```bash
# 1. Fetch a backup
rclone copy gdrive:expense-manager-backups ./backups \
  --include "expense_manager-2026*.dump.gpg"

# 2. Decrypt
gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" \
    --output restored.dump backups/expense_manager-<timestamp>.dump.gpg

# 3. Restore into a scratch database first — safe, and re-runnable as a drill
./scripts/restore.sh restored.dump

# 4. Only for real disaster recovery:
./scripts/restore.sh restored.dump --into-original
```

Do step 3 at least once now, and again whenever the schema changes
substantially. A backup you have never restored is a guess.

## Retention

90 days of nightly dumps, pruned after a successful upload — a failed
backup never deletes the last good one.

## Running it by hand

```bash
export DIRECT_DATABASE_URL="postgresql://..."   # direct host, not -pooler
export BACKUP_PASSPHRASE="..."
./scripts/backup-remote.sh
```

Writes to `backups/`, which is gitignored. The script refuses to run
without a passphrase rather than quietly writing plaintext, and fails if
the dump comes out implausibly small — an unreachable database otherwise
produces a small, valid-looking file that only reveals itself at restore
time.
